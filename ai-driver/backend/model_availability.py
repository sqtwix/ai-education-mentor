import json
import os
import urllib.request


def configured_api_key(name: str) -> bool:
    value = (os.getenv(name) or "").strip()
    return bool(value) and not value.startswith("sk-placeholder")


def _first_env(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name)
        if value is not None and value.strip():
            return value.strip()
    return default


def local_llm_enabled() -> bool:
    raw = os.getenv("ENABLE_LOCAL_LLM")
    if raw is None:
        raw = os.getenv("ENABLE_LOCAL_QWEN", "false")
    return raw.strip().lower() == "true"


def local_llm_mode() -> str:
    return _first_env("LOCAL_LLM_MODE", default="managed").lower()


def local_llm_base_url() -> str:
    return _first_env(
        "LOCAL_LLM_BASE_URL",
        "QWEN_LOCAL_URL",
        default="http://local-llm:8080/v1",
    ).rstrip("/")


def local_llm_model() -> str:
    return _first_env("LOCAL_LLM_MODEL", "QWEN_LOCAL_MODEL", default="local-model")


def local_llm_display_name() -> str:
    if local_llm_mode() == "managed":
        return _first_env(
            "LOCAL_LLM_MODEL_FILE",
            "QWEN_MODEL_FILE",
            "LOCAL_LLM_MODEL",
            "QWEN_LOCAL_MODEL",
            default="local-model",
        )
    return local_llm_model()


def local_llm_disable_thinking() -> bool:
    raw = _first_env("LOCAL_LLM_DISABLE_THINKING").lower()
    if raw in ("true", "false"):
        return raw == "true"
    return "qwen" in local_llm_model().lower() or "qwen" in local_llm_display_name().lower()


def _local_headers(content_type: bool = False) -> dict[str, str]:
    headers: dict[str, str] = {}
    api_key = _first_env("LOCAL_LLM_API_KEY")
    if api_key and api_key != "not-needed":
        headers["Authorization"] = f"Bearer {api_key}"
    if content_type:
        headers["Content-Type"] = "application/json"
    return headers


def local_llm_ready() -> bool:
    """Check the standard OpenAI models endpoint without running generation."""
    if not local_llm_enabled():
        return False
    request = urllib.request.Request(
        f"{local_llm_base_url()}/models",
        headers=_local_headers(),
    )
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            if not 200 <= response.status < 300:
                return False
            payload = json.loads(response.read().decode("utf-8"))
            return isinstance(payload, dict) and isinstance(payload.get("data"), list)
    except Exception:
        return False


def verify_local_inference() -> bool:
    """Run one minimal chat request used by deploy to reject incompatible endpoints."""
    if not local_llm_ready():
        return False
    prompt = "Ответь одним словом: OK"
    if local_llm_disable_thinking():
        prompt = f"/no_think\n{prompt}"
    payload = json.dumps({
        "model": local_llm_model(),
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": 32,
    }).encode("utf-8")
    request = urllib.request.Request(
        f"{local_llm_base_url()}/chat/completions",
        data=payload,
        headers=_local_headers(content_type=True),
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
        choices = result.get("choices") if isinstance(result, dict) else None
        content = choices[0].get("message", {}).get("content") if choices else None
        return isinstance(content, str) and bool(content.strip())
    except Exception:
        return False


# Compatibility import for extensions written against the old name.
qwen_local_ready = local_llm_ready


def get_model_availability() -> dict:
    deepseek_ready = configured_api_key("DEEPSEEK_API_KEY")
    sber_ready = configured_api_key("SBERGPT_API_KEY")
    local_ready = local_llm_ready()
    local_enabled = local_llm_enabled()
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
            "id": "local_llm",
            "group": "local",
            "configured": local_ready,
            "model": local_llm_display_name(),
            "mode": local_llm_mode(),
            "status": "ready" if local_ready else (
                "local_service_unavailable" if local_enabled else "disabled"
            ),
        },
    ]
    generation_available = any(model["configured"] for model in models)
    return {
        "generation_available": generation_available,
        "operating_mode": "ai-enabled" if generation_available else "no-ai",
        "models": models,
    }
