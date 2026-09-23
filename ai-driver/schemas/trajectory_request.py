from pydantic import BaseModel, Field
from typing import Annotated, List, Optional, Any

# ========================= Trajectory Request Schemas =========================

class CourseHistoryItem(BaseModel):
    course_name: Annotated[str, Field(min_length=1, max_length=500)]
    course_type: Optional[Annotated[str, Field(max_length=100)]] = None
    status: Annotated[str, Field(min_length=1, max_length=100)]

class EmployeeProfile(BaseModel):
    fio: Annotated[str, Field(min_length=1, max_length=200)]
    position: Annotated[str, Field(min_length=1, max_length=300)]
    department: Annotated[str, Field(min_length=1, max_length=300)]
    experience_years: Optional[Annotated[int, Field(ge=0, le=80)]] = None
    # В официальном реестре истории обучения цель развития отсутствует.
    # Ручной профиль по-прежнему требует её на уровне UI/API Core, а пакетная
    # загрузка передаёт пустую строку и строит траекторию по должности,
    # ведомству и подтверждённой истории без выдумывания цели.
    career_goal: Annotated[str, Field(max_length=2000)]
    learning_history: List[CourseHistoryItem] = Field(default_factory=list, max_length=200)

class CourseCatalogItem(BaseModel):
    id: str
    name: str
    type: str  # "ППК" или "ЭК"
    category: Optional[str] = None
    annotation: Optional[str] = ""
    target: Optional[str] = ""
    results: Optional[str] = ""
    duration_hours: Optional[int] = None
    competencies: List[str] = Field(default_factory=list)

class TrajectoryRequest(BaseModel):
    request_id: Optional[Annotated[str, Field(max_length=128, pattern=r"^[A-Za-z0-9_-]+$")]] = None
    model_type: Optional[str] = None
    employee: EmployeeProfile
    custom_catalog: Optional[Annotated[List[CourseCatalogItem], Field(max_length=500)]] = None
    target_stages_count: Optional[Annotated[int, Field(ge=1, le=10)]] = None

# Для совместимости с предыдущими вызовами
class CourseBatchAnalysisRequest(BaseModel):
    batch_id: Optional[str] = None
    employee: Optional[EmployeeProfile] = None
    courses: Optional[List[Any]] = None
