import os
import urllib.request


def configured_api_key(name: str) -> bool:
    value = (os.getenv(name) or "").strip()
    return bool(value) and not value.startswith("sk-placeholder")


def qwen_local_ready() -> bool:
    base_url = (os.getenv("QWEN_LOCAL_URL") or "http://qwen-local:8080/v1").rstrip("/")
    health_url = base_url[:-3] + "/health" if base_url.endswith("/v1") else base_url + "/health"
    try:
        with urllib.request.urlopen(health_url, timeout=2) as response:
            return 200 <= response.status < 300
    except Exception:
        return False


def get_model_availability() -> dict:
    deepseek_ready = configured_api_key("DEEPSEEK_API_KEY")
    sber_ready = configured_api_key("SBERGPT_API_KEY")
    qwen_ready = qwen_local_ready()
    models = [
        {
            "id": "deepseek",
            "group": "foreign",
            "configured": deepseek_ready,
            "model": (os.getenv("DEEPSEEK_MODEL") or "deepseek-chat").strip(),
            "status": "ready" if deepseek_ready else "api_key_missing",
        },
        {
            "id": "sbergpt",
            "group": "russian",
            "configured": sber_ready,
            "model": (os.getenv("SBERGPT_MODEL") or "GigaChat-Pro").strip(),
            "status": "ready" if sber_ready else "api_key_missing",
        },
        {
            "id": "qwen_local",
            "group": "local",
            "configured": qwen_ready,
            "model": (
                os.getenv("QWEN_MODEL_FILE")
                or os.getenv("QWEN_LOCAL_MODEL")
                or "local-model"
            ).strip(),
            "status": "ready" if qwen_ready else "local_service_unavailable",
        },
    ]
    return {
        "generation_available": any(model["configured"] for model in models),
        "operating_mode": "ai-enabled" if any(model["configured"] for model in models) else "no-ai",
        "models": models,
    }
