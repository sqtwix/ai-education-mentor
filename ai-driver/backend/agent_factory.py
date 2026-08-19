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

        match model.lower():
            case "deepseek":
                api_key = os.getenv("DEEPSEEK_API_KEY", "not-needed")
                base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
                agent_model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

            case "gigachat" | "sbergpt":
                api_key = os.getenv("SBERGPT_API_KEY", "not-needed")
                base_url = os.getenv("SBERGPT_BASE_URL", "https://gigachat.devices.sberbank.ru/api/v1/")
                agent_model = os.getenv("SBERGPT_MODEL", "GigaChat-Pro")

            case "qwen_local" | "qwen" | "local":
                # llama.cpp OpenAI-совместимый сервер
                api_key = "not-needed"
                base_url = os.getenv("QWEN_LOCAL_URL", "http://qwen-local:8080/v1")
                agent_model = os.getenv("QWEN_LOCAL_MODEL", "local-model")

            case _:
                api_key = os.getenv("DEEPSEEK_API_KEY", "not-needed")
                base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
                agent_model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")

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