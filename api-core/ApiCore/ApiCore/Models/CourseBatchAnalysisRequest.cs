using System.Text.Json.Serialization;

namespace ApiCore.Models;

public class TrajectoryGenerateRequest
{
    [JsonPropertyName("request_id")]
    public string RequestId { get; set; } = Guid.NewGuid().ToString();

    [JsonPropertyName("employee")]
    public EmployeeProfileDto Employee { get; set; } = new();

    [JsonPropertyName("model_type")]
    public string ModelType { get; set; } = "deepseek";
}

public class EmployeeProfileDto
{
    [JsonPropertyName("fio")]
    public string Fio { get; set; } = string.Empty;

    [JsonPropertyName("position")]
    public string Position { get; set; } = string.Empty;

    [JsonPropertyName("department")]
    public string Department { get; set; } = string.Empty;

    [JsonPropertyName("experience_years")]
    public int ExperienceYears { get; set; }

    [JsonPropertyName("career_goal")]
    public string CareerGoal { get; set; } = string.Empty;

    [JsonPropertyName("learning_history")]
    public List<CourseHistoryItemDto> LearningHistory { get; set; } = new();
}

public class CourseHistoryItemDto
{
    [JsonPropertyName("course_name")]
    public string CourseName { get; set; } = string.Empty;

    [JsonPropertyName("course_type")]
    public string CourseType { get; set; } = string.Empty;

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;
}

public class CourseCatalogItemDto
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("type")]
    public string Type { get; set; } = string.Empty;

    [JsonPropertyName("category")]
    public string Category { get; set; } = string.Empty;

    [JsonPropertyName("annotation")]
    public string Annotation { get; set; } = string.Empty;

    [JsonPropertyName("target")]
    public string Target { get; set; } = string.Empty;

    [JsonPropertyName("results")]
    public string Results { get; set; } = string.Empty;

    [JsonPropertyName("duration_hours")]
    public int DurationHours { get; set; }

    [JsonPropertyName("competencies")]
    public List<string> Competencies { get; set; } = new();
}

// Совместимость с предыдущим форматом пакетов
public class CourseBatchAnalysisRequest
{
    [JsonPropertyName("batch_id")]
    public string BatchId { get; set; } = string.Empty;

    [JsonPropertyName("employee")]
    public EmployeeProfileDto? Employee { get; set; }

    [JsonPropertyName("courses")]
    public List<CourseSurveyDto> Courses { get; set; } = new();
}

public class CourseSurveyDto
{
    [JsonPropertyName("course_name")]
    public string CourseName { get; set; } = string.Empty;

    [JsonPropertyName("period")]
    public string Period { get; set; } = string.Empty;

    [JsonPropertyName("students_count")]
    public int StudentsCount { get; set; }

    [JsonPropertyName("responses")]
    public List<SurveyResponseDto> Responses { get; set; } = new();
}

public class SurveyResponseDto
{
    [JsonPropertyName("student_id")]
    public string StudentId { get; set; } = string.Empty;

    [JsonPropertyName("position_category")]
    public string PositionCategory { get; set; } = string.Empty;

    [JsonPropertyName("usefulness_score")]
    public int UsefulnessScore { get; set; }

    [JsonPropertyName("practicality_score")]
    public int PracticalityScore { get; set; }

    [JsonPropertyName("accessibility_score")]
    public int AccessibilityScore { get; set; }

    [JsonPropertyName("interaction_score")]
    public int InteractionScore { get; set; }

    [JsonPropertyName("preferred_format")]
    public string PreferredFormat { get; set; } = string.Empty;

    [JsonPropertyName("is_detached")]
    public bool IsDetached { get; set; }

    [JsonPropertyName("motivation_comment")]
    public string MotivationComment { get; set; } = string.Empty;

    [JsonPropertyName("usefulness_comment")]
    public string UsefulnessComment { get; set; } = string.Empty;

    [JsonPropertyName("applied_skills_comment")]
    public string AppliedSkillsComment { get; set; } = string.Empty;

    [JsonPropertyName("expected_effect")]
    public string ExpectedEffect { get; set; } = string.Empty;

    [JsonPropertyName("expected_effect_reason")]
    public string ExpectedEffectReason { get; set; } = string.Empty;

    [JsonPropertyName("topics_to_exclude_comment")]
    public string TopicsToExcludeComment { get; set; } = string.Empty;

    [JsonPropertyName("topics_to_add_comment")]
    public string TopicsToAddComment { get; set; } = string.Empty;

    [JsonPropertyName("practicality_comment")]
    public string PracticalityComment { get; set; } = string.Empty;

    [JsonPropertyName("practice_tuning_comment")]
    public string PracticeTuningComment { get; set; } = string.Empty;

    [JsonPropertyName("practice_change_comment")]
    public string PracticeChangeComment { get; set; } = string.Empty;

    [JsonPropertyName("accessibility_comment")]
    public string AccessibilityComment { get; set; } = string.Empty;

    [JsonPropertyName("logic_sequence_reason")]
    public string LogicSequenceReason { get; set; } = string.Empty;

    [JsonPropertyName("ask_questions_comment")]
    public string AskQuestionsComment { get; set; } = string.Empty;

    [JsonPropertyName("ask_questions_reason")]
    public string AskQuestionsReason { get; set; } = string.Empty;

    [JsonPropertyName("detachment_reason_comment")]
    public string DetachmentReasonComment { get; set; } = string.Empty;

    [JsonPropertyName("involvement_comment")]
    public string InvolvementComment { get; set; } = string.Empty;

    [JsonPropertyName("interaction_comment")]
    public string InteractionComment { get; set; } = string.Empty;
}
