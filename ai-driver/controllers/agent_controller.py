from fastapi import HTTPException, status
from fastapi.responses import JSONResponse
import json
import logging
from backend.agent_manager import AgentManager
from schemas.trajectory_request import TrajectoryRequest
from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

class AgentController:
    def __init__(self, agent_manager: AgentManager):
        self.agent_manager = agent_manager

    async def get_deepseek_data_analysis(self, request: TrajectoryRequest):
        try:
            body_str = request.model_dump_json(exclude_none=True)
            result_str = await run_in_threadpool(self.agent_manager.start_deepseek_processing, body_str)
            return JSONResponse(content=json.loads(result_str), status_code=status.HTTP_200_OK)
        except Exception as e:
            logger.error("DeepSeek controller error (%s)", type(e).__name__)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Не удалось обработать запрос DeepSeek.")

    async def get_sbergpt_data_analysis(self, request: TrajectoryRequest):
        try:
            body_str = request.model_dump_json(exclude_none=True)
            result_str = await run_in_threadpool(self.agent_manager.start_sbergpt_processing, body_str)
            return JSONResponse(content=json.loads(result_str), status_code=status.HTTP_200_OK)
        except Exception as e:
            logger.error("SberGPT controller error (%s)", type(e).__name__)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Не удалось обработать запрос SberGPT.")

    async def get_local_llm_data_analysis(self, request: TrajectoryRequest):
        try:
            body_str = request.model_dump_json(exclude_none=True)
            result_str = await run_in_threadpool(self.agent_manager.start_local_llm_processing, body_str)
            return JSONResponse(content=json.loads(result_str), status_code=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Local LLM controller error (%s)", type(e).__name__)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Не удалось обработать запрос локальной модели.")

    async def get_qwen_local_data_analysis(self, request: TrajectoryRequest):
        """Compatibility route for API Core versions that still use qwen_local."""
        return await self.get_local_llm_data_analysis(request)

    async def get_courses_catalog(self):
        try:
            return JSONResponse(content=self.agent_manager.catalog, status_code=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Catalog controller error (%s)", type(e).__name__)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Не удалось загрузить каталог программ.")

    async def get_positions_benchmark(self):
        try:
            return JSONResponse(content=self.agent_manager.get_public_benchmarks(), status_code=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Benchmarks controller error (%s)", type(e).__name__)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Не удалось загрузить бенчмарки.")

    async def get_processing_progress(self, request_id: str):
        return JSONResponse(
            content=self.agent_manager.get_progress(request_id),
            status_code=status.HTTP_200_OK,
        )
