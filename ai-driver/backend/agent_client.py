from openai import OpenAI
import json
import logging

# ========================= Agent Client =========================

# AgentClient - class, that present an Agent.
# AgnetClient class contains a basic constructor
# and execute method that used to get data from
# model API (DeepSeek, Sber GPT, Local Qwen via vLLM).

# ========================= General JSON-Format =========================
# {
#     model: "Model",
#     messages: [
#         {"role": "ROLE", "content": "CONTENT"}
#     ],
#     response_format = {"type" : "json_object"},
#     temperature = 0.3
# }

# Для локальной модели через vllm используется тот же формат,
# так как vllm поднимает OpenAI-совместимый сервер.
# api_key для локальной модели передается как "not-needed".

# Настройка логгера для отслеживания работы агентов
logger = logging.getLogger(__name__)

class AgentClient:
    def __init__(self, api_key: str, base_url: str, agent_model: str, specialization: str):
        # Проверяем обязательные параметры перед инициализацией
        if not base_url or not agent_model:
            raise Exception("AgentClient Initialization Exception: base_url and agent_model are required")
        try:
            self.api_key = api_key if (api_key and api_key.strip()) else "sk-placeholder-key"
            self.base_url = base_url
            self.model = agent_model
            self.specialization = specialization
            self.is_local_qwen = api_key == "not-needed" or "qwen-local" in base_url
            # OpenAI клиент работает для всех совместимых API (DeepSeek, GigaChat, vLLM/llama.cpp)
            self.client = OpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
                max_retries=0 if self.is_local_qwen else 2,
            )
        except Exception as e:
            raise Exception("AgentClient Initialization Exception: agent initialization failed - " + str(e))

    def execute(self, system_prompt: str, user_prompt: str) -> str:
        # Выполняет запрос к модели и возвращает JSON-строку с ответом.
        # Параметры:
        #   system_prompt - системный промпт, определяющий роль агента
        #   user_prompt   - данные для анализа в JSON-формате
        # Возвращает:
        #   str - валидная JSON-строка с результатом работы модели
        # Исключения:
        #   Exception - при ошибках API, таймаутах или невалидном JSON в ответе

        logger.info("Agent [%s] starting with model %s", self.specialization, self.model)

        try:
            # Отправка запроса к API нейросети
            max_tokens_by_specialization = {
                "competency-analyst": 320,
                "trajectory-architect": 500,
                "trajectory-justifier": 700,
            }
            effective_system_prompt = system_prompt
            if self.is_local_qwen:
                # Qwen3 по умолчанию может расходовать весь небольшой output budget
                # на рассуждение. Для строгого JSON-конвейера нужен non-thinking mode.
                effective_system_prompt = f"{system_prompt}\n/no_think"

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": effective_system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.3,
                max_tokens=max_tokens_by_specialization.get(self.specialization, 900),
                timeout=60
            )

            # Извлекаем содержимое ответа
            raw_content = response.choices[0].message.content

            parsed_content = self._parse_json_object(raw_content)

            logger.info("Agent [%s] completed successfully", self.specialization)
            return json.dumps(parsed_content, ensure_ascii=False)

        except Exception as e:
            logger.error("Agent [%s] execution failed (%s)", self.specialization, type(e).__name__)
            raise RuntimeError("AgentClient Execution Exception: prompt execution failed") from e

    @staticmethod
    def _parse_json_object(raw_content: str) -> dict:
        """Parse an object and only repair omitted closing brackets/braces."""
        if not isinstance(raw_content, str):
            raise ValueError("AgentClient JSON Validation Exception: model returned no text")

        start = raw_content.find("{")
        if start < 0:
            raise ValueError("AgentClient JSON Validation Exception: model returned no JSON object")

        stack = []
        in_string = False
        escaped = False
        end = None
        matching = {"}": "{", "]": "["}
        closing = {"{": "}", "[": "]"}

        for index, char in enumerate(raw_content[start:], start=start):
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue

            if char == '"':
                in_string = True
            elif char in closing:
                stack.append(char)
            elif char in matching:
                if not stack or stack[-1] != matching[char]:
                    raise ValueError("AgentClient JSON Validation Exception: mismatched JSON delimiters")
                stack.pop()
                if not stack:
                    end = index + 1
                    break

        if in_string:
            raise ValueError("AgentClient JSON Validation Exception: unterminated JSON string")

        candidate = raw_content[start:end] if end is not None else raw_content[start:].strip()
        if end is None:
            if not stack or len(stack) > 4:
                raise ValueError("AgentClient JSON Validation Exception: incomplete JSON structure")
            candidate += "".join(closing[opener] for opener in reversed(stack))

        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError as json_err:
            raise ValueError("AgentClient JSON Validation Exception: model returned invalid JSON") from json_err
        if not isinstance(parsed, dict):
            raise ValueError("AgentClient JSON Validation Exception: root must be an object")
        return parsed
