from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

# ========================= Trajectory Request Schemas =========================

class CourseHistoryItem(BaseModel):
    course_name: str
    course_type: Optional[str] = "ППК"  # "ППК" или "ЭК"
    status: Optional[str] = "Пройден"   # "Пройден", "Не пройден", "В процессе"

class EmployeeProfile(BaseModel):
    fio: Optional[str] = "Служащий"
    position: str = "Главный специалист"
    department: str = "Администрация Губернатора Санкт-Петербурга"
    experience_years: Optional[int] = 3
    career_goal: Optional[str] = "Развитие управленческих и цифровых компетенций"
    learning_history: List[CourseHistoryItem] = []

class CourseCatalogItem(BaseModel):
    id: str
    name: str
    type: str  # "ППК" или "ЭК"
    category: Optional[str] = "Общее"
    annotation: Optional[str] = ""
    target: Optional[str] = ""
    results: Optional[str] = ""
    duration_hours: Optional[int] = 16
    competencies: List[str] = []

class TrajectoryRequest(BaseModel):
    request_id: Optional[str] = "req_1"
    employee: EmployeeProfile
    custom_catalog: Optional[List[CourseCatalogItem]] = None
    target_stages_count: Optional[int] = 3

# Для совместимости с предыдущими вызовами
class CourseBatchAnalysisRequest(BaseModel):
    batch_id: Optional[str] = "batch_1"
    employee: Optional[EmployeeProfile] = None
    courses: Optional[List[Any]] = None
