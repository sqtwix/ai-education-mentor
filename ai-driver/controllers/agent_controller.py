from fastapi import HTTPException, status, Request
from fastapi.responses import JSONResponse
import json
import logging
from backend.agent_manager import AgentManager

logger = logging.getLogger(__name__)

class AgentController:
    def __init__(self, agent_manager: AgentManager):
        self.agent_manager = agent_manager

    async def get_deepseek_data_analysis(self, request: Request):
        try:
            body = await request.body()
            body_str = body.decode("utf-8")
            result_str = self.agent_manager.start_deepseek_processing(body_str)
            return JSONResponse(content=json.loads(result_str), status_code=status.HTTP_200_OK)
        except Exception as e:
            logger.error("DeepSeek controller error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    async def get_sbergpt_data_analysis(self, request: Request):
        try:
            body = await request.body()
            body_str = body.decode("utf-8")
            result_str = self.agent_manager.start_sbergpt_processing(body_str)
            return JSONResponse(content=json.loads(result_str), status_code=status.HTTP_200_OK)
        except Exception as e:
            logger.error("SberGPT controller error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    async def get_qwen_local_data_analysis(self, request: Request):
        try:
            body = await request.body()
            body_str = body.decode("utf-8")
            result_str = self.agent_manager.start_qwen_local_processing(body_str)
            return JSONResponse(content=json.loads(result_str), status_code=status.HTTP_200_OK)
        except Exception as e:
            logger.error("Qwen local controller error: %s", str(e))
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    async def get_courses_catalog(self):
        try:
            return JSONResponse(content=self.agent_manager.catalog, status_code=status.HTTP_200_OK)
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    async def get_positions_benchmark(self):
        try:
            return JSONResponse(content=self.agent_manager.history_dataset, status_code=status.HTTP_200_OK)
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))