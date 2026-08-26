from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

# ========================= Trajectory Request Schemas =========================

class CourseHistoryItem(BaseModel):
    course_name: str
    course_type: Optional[str] = None
    status: str

class EmployeeProfile(BaseModel):
    fio: str
    position: str
    department: str
    experience_years: Optional[int] = None
    career_goal: str
    learning_history: List[CourseHistoryItem] = Field(default_factory=list)

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
    request_id: Optional[str] = None
    model_type: Optional[str] = None
    employee: EmployeeProfile
    custom_catalog: Optional[List[CourseCatalogItem]] = None
    target_stages_count: Optional[int] = None

# Для совместимости с предыдущими вызовами
class CourseBatchAnalysisRequest(BaseModel):
    batch_id: Optional[str] = None
    employee: Optional[EmployeeProfile] = None
    courses: Optional[List[Any]] = None
