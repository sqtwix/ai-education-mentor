from pydantic import BaseModel, Field
from typing import List, Optional

# ========================= Analysis Request Schemas =========================

# Эти схемы соответствуют контракту данных между api-core и ai-driver.
# Представляют полную структуру опроса: анкеты слушателей по курсам.

class SurveyResponse(BaseModel):
    student_id: Optional[str] = "unknown"
    position_category: Optional[str] = "Не указано"
    usefulness_score: float = 0.0
    practicality_score: float = 0.0
    accessibility_score: float = 0.0
    interaction_score: float = 0.0
    preferred_format: Optional[str] = "Не указано"
    is_detached: bool = False
    
    motivation_comment: Optional[str] = ""
    usefulness_comment: Optional[str] = ""
    applied_skills_comment: Optional[str] = ""
    expected_effect: Optional[str] = ""
    expected_effect_reason: Optional[str] = ""
    topics_to_exclude_comment: Optional[str] = ""
    topics_to_add_comment: Optional[str] = ""
    practicality_comment: Optional[str] = ""
    practice_tuning_comment: Optional[str] = ""
    practice_change_comment: Optional[str] = ""
    accessibility_comment: Optional[str] = ""
    logic_sequence_reason: Optional[str] = ""
    ask_questions_comment: Optional[str] = ""
    ask_questions_reason: Optional[str] = ""
    detachment_reason_comment: Optional[str] = ""
    involvement_comment: Optional[str] = ""
    interaction_comment: Optional[str] = ""

class CourseSurvey(BaseModel):
    course_name: str
    period: Optional[str] = "Не указан"
    students_count: Optional[int] = 0
    responses: List[SurveyResponse] = []

class AnalysisRequest(BaseModel):
    batch_id: str
    courses: List[CourseSurvey]
