from fastapi import FastAPI
import logging
import contextvars
import re
import time
import uuid

from backend.agent_factory import AgentFactory
from backend.agent_manager import AgentManager
from controllers.agent_controller import AgentController
from routes import setup_routes
from backend.model_availability import get_model_availability

# ========================= Main Application =========================

# Настройка логирования для отслеживания работы всех модулей
correlation_id_context = contextvars.ContextVar("correlation_id", default="system")


class CorrelationIdFilter(logging.Filter):
    def filter(self, record):
        record.correlation_id = correlation_id_context.get()
        return True


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] correlation=%(correlation_id)s %(name)s: %(message)s"
)
for handler in logging.getLogger().handlers:
    handler.addFilter(CorrelationIdFilter())

app = FastAPI(
    title="Agents API",
    description="Документация Agents API: DeepSeek, SberGPT и локальные OpenAI-compatible модели.",
    version="1.0.0",
    swagger_ui_parameters={"syntaxHighlight.theme": "obsidian"}
)


@app.middleware("http")
async def correlation_and_request_logging(request, call_next):
    supplied = request.headers.get("x-correlation-id", "")
    correlation_id = supplied if (
        0 < len(supplied) <= 128 and re.fullmatch(r"[A-Za-z0-9._-]+", supplied)
    ) else uuid.uuid4().hex
    token = correlation_id_context.set(correlation_id)
    started = time.perf_counter()
    try:
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        logging.getLogger("request").info(
            "HTTP %s %s status=%s elapsed_ms=%.1f",
            request.method,
            request.url.path,
            response.status_code,
            (time.perf_counter() - started) * 1000,
        )
        return response
    finally:
        correlation_id_context.reset(token)

# Инициализация компонентов системы
# AgentFactory создает агентов для разных провайдеров
# AgentManager управляет конвейером последовательной обработки
# AgentController обрабатывает HTTP-запросы и валидирует данные
agent_factory = AgentFactory()
agent_manager = AgentManager(agent_factory=agent_factory)
agent_controller = AgentController(agent_manager=agent_manager)

# Регистрация маршрутов с префиксом /agents
app.include_router(setup_routes(agent_controller=agent_controller), prefix="/agents")


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "service": "ai-driver", "version": app.version}


@app.get("/models/availability", tags=["system"])
def model_availability():
    """Возвращает состояние конфигурации, не раскрывая ключи провайдеров."""
    return get_model_availability()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
