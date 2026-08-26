from backend.agent_client import AgentClient
import os

# ========================= Agent Factory =========================

# AgentFactory создает очередь из 3 специализированных агентов ИОТ:
# 1. competency-analyst
# 2. trajectory-architect
# 3. trajectory-justifier

class AgentFactory:

    SPECIALIZATIONS = [
        "competency-analyst",
        "trajectory-architect",
        "trajectory-justifier"
    ]

    def create_queue(self, model: str) -> list:
        queue: list = []

        api_key: str = None
        base_url: str = None
        agent_model: str = None

        normalized_model = model.lower()
        if normalized_model == "deepseek":
            api_key = (os.getenv("DEEPSEEK_API_KEY") or "").strip() or "sk-placeholder-deepseek"
            base_url = (os.getenv("DEEPSEEK_BASE_URL") or "").strip() or "https://api.deepseek.com"
            agent_model = (os.getenv("DEEPSEEK_MODEL") or "").strip() or "deepseek-chat"
            if api_key.startswith("sk-placeholder"):
                raise ValueError("DEEPSEEK_API_KEY is required for DeepSeek production mode")
        elif normalized_model in ("gigachat", "sbergpt"):
            api_key = (os.getenv("SBERGPT_API_KEY") or "").strip() or "sk-placeholder-sber"
            base_url = (os.getenv("SBERGPT_BASE_URL") or "").strip() or "https://gigachat.devices.sberbank.ru/api/v1/"
            agent_model = (os.getenv("SBERGPT_MODEL") or "").strip() or "GigaChat-Pro"
            if api_key.startswith("sk-placeholder"):
                raise ValueError("SBERGPT_API_KEY is required for GigaChat/SberGPT production mode")
        elif normalized_model in ("qwen_local", "qwen", "local"):
            # llama.cpp OpenAI-совместимый сервер
            api_key = "not-needed"
            base_url = (os.getenv("QWEN_LOCAL_URL") or "").strip() or "http://qwen-local:8080/v1"
            agent_model = (os.getenv("QWEN_LOCAL_MODEL") or "").strip() or "local-model"
        else:
            api_key = (os.getenv("DEEPSEEK_API_KEY") or "").strip() or "sk-placeholder-deepseek"
            base_url = (os.getenv("DEEPSEEK_BASE_URL") or "").strip() or "https://api.deepseek.com"
            agent_model = (os.getenv("DEEPSEEK_MODEL") or "").strip() or "deepseek-chat"
            if api_key.startswith("sk-placeholder"):
                raise ValueError("DEEPSEEK_API_KEY is required for DeepSeek production mode")

        try:
            for specialization in self.SPECIALIZATIONS:
                queue.append(
                    AgentClient(
                        api_key=api_key,
                        base_url=base_url,
                        agent_model=agent_model,
                        specialization=specialization
                    )
                )

            if len(queue) != 3:
                raise Exception(
                    "AgentFactory Creating Queue Exception: expected 3 agents, got " + str(len(queue))
                )

            return queue

        except Exception as e:
            raise Exception("AgentFactory Creating Queue Exception: " + str(e))
