from fastapi import APIRouter

# ========================= Routes Setup =========================

def setup_routes(agent_controller):
    router = APIRouter()

    # Анализ и генерация траектории через DeepSeek
    router.add_api_route(
        path="/get_deepseek_data_analysis",
        endpoint=agent_controller.get_deepseek_data_analysis,
        methods=["POST"],
        summary="Сформировать ИОТ с использованием группы агентов DeepSeek",
        description="Возвращает индивидуальную образовательную траекторию, сформированную группой агентов DeepSeek"
    )

    # Анализ и генерация траектории через Sber GigaChat
    router.add_api_route(
        path="/get_sbergpt_data_analysis",
        endpoint=agent_controller.get_sbergpt_data_analysis,
        methods=["POST"],
        summary="Сформировать ИОТ с использованием группы агентов Sber GigaChat",
        description="Возвращает индивидуальную образовательную траекторию, сформированную группой агентов Sber GigaChat"
    )

    # Канонический маршрут для managed GGUF и внешних OpenAI-compatible моделей.
    router.add_api_route(
        path="/get_local_llm_data_analysis",
        endpoint=agent_controller.get_local_llm_data_analysis,
        methods=["POST"],
        summary="Сформировать ИОТ с использованием локальной OpenAI-compatible модели",
        description="Поддерживает управляемую GGUF-модель через llama.cpp и внешний совместимый endpoint"
    )

    # Совместимость с ранее выпущенным API.
    router.add_api_route(
        path="/get_qwen_local_data_analysis",
        endpoint=agent_controller.get_qwen_local_data_analysis,
        methods=["POST"],
        summary="Устаревший alias локальной модели",
        description="Совместимый маршрут; новые клиенты используют get_local_llm_data_analysis",
        deprecated=True,
    )

    # Получить актуальный каталог программ 2025 года (ППК и ЭК)
    router.add_api_route(
        path="/catalog",
        endpoint=agent_controller.get_courses_catalog,
        methods=["GET"],
        summary="Получить каталог программ обучения",
        description="Возвращает список всех доступных курсов ППК и ЭК с аннотациями и компетенциями"
    )

    # Получить аналитику и бенчмарк по должностям
    router.add_api_route(
        path="/benchmarks",
        endpoint=agent_controller.get_positions_benchmark,
        methods=["GET"],
        summary="Получить бенчмарки и историю обучения по должностям",
        description="Возвращает статистику востребованности и успешности курсов по должностям и ведомствам"
    )

    router.add_api_route(
        path="/progress/{request_id}",
        endpoint=agent_controller.get_processing_progress,
        methods=["GET"],
        summary="Получить фактический этап обработки ИОТ",
        description="Возвращает текущий этап внутреннего конвейера для активной задачи"
    )

    return router
