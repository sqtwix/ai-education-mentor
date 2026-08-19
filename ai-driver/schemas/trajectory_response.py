from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any

# ========================= Trajectory Response Schemas =========================

class CourseRecommendation(BaseModel):
    course_id: str
    course_name: str
    type: str  # "ППК" или "ЭК"
    category: Optional[str] = "Программа обучения"
    duration_hours: int = 16
    competencies: List[str] = []
    annotation: str = ""
    learning_outcomes: Optional[str] = ""
    justification: str = ""
    priority: str = "High"  # "High", "Medium", "Low"
    status: str = "Рекомендован"

class TrajectoryStage(BaseModel):
    stage_number: int
    stage_title: str
    recommended_period: str
    stage_goal: str
    courses: List[CourseRecommendation] = []

class CompetencyRadarPoint(BaseModel):
    competency: str
    current_level: int = 40
    target_level: int = 85
    growth: int = 45

class BenchmarkCourseInfo(BaseModel):
    course_name: str
    type: str
    popularity_pct: float
    success_rate: Optional[float] = 100.0

class ColleagueBenchmark(BaseModel):
    total_colleagues_in_position: int = 0
    top_recommended_for_position: List[BenchmarkCourseInfo] = []

class TrajectoryResult(BaseModel):
    trajectory_id: str
    employee_name: str
    position: str
    department: str
    summary: str
    stages: List[TrajectoryStage] = []
    competency_radar: List[CompetencyRadarPoint] = []
    colleague_benchmark: Optional[ColleagueBenchmark] = None

class TrajectoryResponse(BaseModel):
    batch_id: str
    trajectory: TrajectoryResult
