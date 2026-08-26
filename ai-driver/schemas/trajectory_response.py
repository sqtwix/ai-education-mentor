from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any

# ========================= Trajectory Response Schemas =========================

class CourseRecommendation(BaseModel):
    course_id: str
    course_name: str
    type: str  # "ППК" или "ЭК"
    category: Optional[str] = None
    duration_hours: Optional[int] = None
    competencies: List[str] = Field(default_factory=list)
    annotation: str = ""
    learning_outcomes: Optional[str] = ""
    justification: str = ""
    priority: Optional[str] = None
    status: Optional[str] = None

class TrajectoryStage(BaseModel):
    stage_number: int
    stage_title: str
    recommended_period: str
    stage_goal: str
    courses: List[CourseRecommendation] = Field(default_factory=list)

class CompetencyRadarPoint(BaseModel):
    competency: str
    current_level: int
    target_level: int
    growth: int

class BenchmarkCourseInfo(BaseModel):
    course_name: str
    type: str
    popularity_pct: float
    success_rate: Optional[float] = None

class ColleagueBenchmark(BaseModel):
    total_colleagues_in_position: int = 0
    top_recommended_for_position: List[BenchmarkCourseInfo] = Field(default_factory=list)

class TrajectoryResult(BaseModel):
    trajectory_id: str
    employee_name: str
    position: str
    department: str
    summary: str
    stages: List[TrajectoryStage] = Field(default_factory=list)
    competency_radar: List[CompetencyRadarPoint] = Field(default_factory=list)
    colleague_benchmark: Optional[ColleagueBenchmark] = None

class TrajectoryResponse(BaseModel):
    batch_id: str
    trajectory: TrajectoryResult
