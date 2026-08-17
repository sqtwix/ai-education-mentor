using System.Text.Json.Serialization;

namespace ApiCore.Models;

public class CourseBatchAnalysisResult
{
    [JsonPropertyName("batch_id")]
    public string BatchId { get; set; } = string.Empty;

    [JsonPropertyName("courses_analysis")]
    public List<CourseAnalysisResultDto> CoursesAnalysis { get; set; } = new();
}

public class CourseAnalysisResultDto
{
    [JsonPropertyName("course_name")]
    public string CourseName { get; set; } = string.Empty;

    [JsonPropertyName("period")]
    public string Period { get; set; } = string.Empty;

    [JsonPropertyName("students_count")]
    public int StudentsCount { get; set; }

    [JsonPropertyName("statistics")]
    public CourseStatisticsDto Statistics { get; set; } = new();

    [JsonPropertyName("position_distribution")]
    public Dictionary<string, int> PositionDistribution { get; set; } = new();

    [JsonPropertyName("preferred_formats")]
    public Dictionary<string, int> PreferredFormats { get; set; } = new();

    [JsonPropertyName("analytical_report")]
    public AnalyticalReportDto AnalyticalReport { get; set; } = new();

    [JsonPropertyName("dashboard_data")]
    public DashboardDataDto DashboardData { get; set; } = new();

    [JsonPropertyName("text_analysis")]
    public TextAnalysisDto TextAnalysis { get; set; } = new();
}

public class CourseStatisticsDto
{
    [JsonPropertyName("usefulness")]
    public NumericMetricDto Usefulness { get; set; } = new();

    [JsonPropertyName("practicality")]
    public NumericMetricDto Practicality { get; set; } = new();

    [JsonPropertyName("accessibility")]
    public NumericMetricDto Accessibility { get; set; } = new();

    [JsonPropertyName("interaction")]
    public NumericMetricDto Interaction { get; set; } = new();

    [JsonPropertyName("involvement")]
    public InvolvementMetricDto Involvement { get; set; } = new();
}

public class NumericMetricDto
{
    [JsonPropertyName("average")]
    public double Average { get; set; }

    [JsonPropertyName("median")]
    public double Median { get; set; }

    [JsonPropertyName("std_dev")]
    public double StdDev { get; set; }

    [JsonPropertyName("distribution")]
    public DistributionDto Distribution { get; set; } = new();
}

public class DistributionDto
{
    [JsonPropertyName("low")]
    public double Low { get; set; } // 1-3

    [JsonPropertyName("mid")]
    public double Mid { get; set; } // 4-7

    [JsonPropertyName("high")]
    public double High { get; set; } // 8-10
}

public class InvolvementMetricDto
{
    [JsonPropertyName("detached_percent")]
    public double DetachedPercent { get; set; }

    [JsonPropertyName("involved_percent")]
    public double InvolvedPercent { get; set; }

    [JsonPropertyName("yes_count")]
    public int YesCount { get; set; }

    [JsonPropertyName("no_count")]
    public int NoCount { get; set; }
}

public class AnalyticalReportDto
{
    [JsonPropertyName("section1_general_info")]
    public string Section1GeneralInfo { get; set; } = string.Empty;

    [JsonPropertyName("section2_key_criteria")]
    public Section2KeyCriteriaDto Section2KeyCriteria { get; set; } = new();

    [JsonPropertyName("section3_suggestions")]
    public Section3SuggestionsDto Section3Suggestions { get; set; } = new();

    [JsonPropertyName("section4_trajectory")]
    public Section4TrajectoryDto Section4Trajectory { get; set; } = new();
}

public class Section2KeyCriteriaDto
{
    [JsonPropertyName("usefulness_summary")]
    public string UsefulnessSummary { get; set; } = string.Empty;

    [JsonPropertyName("practicality_summary")]
    public string PracticalitySummary { get; set; } = string.Empty;

    [JsonPropertyName("accessibility_summary")]
    public string AccessibilitySummary { get; set; } = string.Empty;

    [JsonPropertyName("interaction_summary")]
    public string InteractionSummary { get; set; } = string.Empty;

    [JsonPropertyName("involvement_summary")]
    public string InvolvementSummary { get; set; } = string.Empty;
}

public class Section3SuggestionsDto
{
    [JsonPropertyName("unwanted_topics")]
    public List<string> UnwantedTopics { get; set; } = new();

    [JsonPropertyName("added_topics")]
    public List<AddedTopicDto> AddedTopics { get; set; } = new();

    [JsonPropertyName("preferred_format_summary")]
    public string PreferredFormatSummary { get; set; } = string.Empty;
}

public class AddedTopicDto
{
    [JsonPropertyName("topic")]
    public string Topic { get; set; } = string.Empty;

    [JsonPropertyName("count")]
    public int Count { get; set; }
}

public class Section4TrajectoryDto
{
    [JsonPropertyName("further_implementation_needed")]
    public string FurtherImplementationNeeded { get; set; } = string.Empty;

    [JsonPropertyName("student_selection_correction")]
    public string StudentSelectionCorrection { get; set; } = string.Empty;

    [JsonPropertyName("added_topics_recommendation")]
    public string AddedTopicsRecommendation { get; set; } = string.Empty;

    [JsonPropertyName("hours_correction_needed")]
    public string HoursCorrectionNeeded { get; set; } = string.Empty;

    [JsonPropertyName("format_correction_needed")]
    public string FormatCorrectionNeeded { get; set; } = string.Empty;

    [JsonPropertyName("conclusions")]
    public List<string> Conclusions { get; set; } = new();
}

public class DashboardDataDto
{
    [JsonPropertyName("correlation_matrix")]
    public Dictionary<string, Dictionary<string, double>> CorrelationMatrix { get; set; } = new();

    [JsonPropertyName("trend_data")]
    public List<TrendPointDto> TrendData { get; set; } = new();
}

public class TrendPointDto
{
    [JsonPropertyName("period")]
    public string Period { get; set; } = string.Empty;

    [JsonPropertyName("usefulness_avg")]
    public double UsefulnessAvg { get; set; }

    [JsonPropertyName("practicality_avg")]
    public double PracticalityAvg { get; set; }

    [JsonPropertyName("accessibility_avg")]
    public double AccessibilityAvg { get; set; }

    [JsonPropertyName("interaction_avg")]
    public double InteractionAvg { get; set; }

    [JsonPropertyName("involvement_avg")]
    public double InvolvementAvg { get; set; }
}

public class TextAnalysisDto
{
    [JsonPropertyName("top_topics")]
    public List<TopicDto> TopTopics { get; set; } = new();

    [JsonPropertyName("sentiment")]
    public SentimentDto Sentiment { get; set; } = new();

    [JsonPropertyName("key_problems")]
    public List<ProblemDto> KeyProblems { get; set; } = new();

    [JsonPropertyName("quotes")]
    public List<QuoteDto> Quotes { get; set; } = new();

    [JsonPropertyName("recommendations")]
    public List<RecommendationDto> Recommendations { get; set; } = new();
}

public class TopicDto
{
    [JsonPropertyName("topic")]
    public string Topic { get; set; } = string.Empty;

    [JsonPropertyName("description")]
    public string Description { get; set; } = string.Empty;

    [JsonPropertyName("frequency")]
    public int Frequency { get; set; }
}

public class SentimentDto
{
    [JsonPropertyName("positive")]
    public double Positive { get; set; }

    [JsonPropertyName("neutral")]
    public double Neutral { get; set; }

    [JsonPropertyName("negative")]
    public double Negative { get; set; }
}

public class ProblemDto
{
    [JsonPropertyName("problem")]
    public string Problem { get; set; } = string.Empty;

    [JsonPropertyName("frequency_percent")]
    public double FrequencyPercent { get; set; }

    [JsonPropertyName("severity")]
    public string Severity { get; set; } = string.Empty; // High, Medium, Low
}

public class QuoteDto
{
    [JsonPropertyName("quote")]
    public string Quote { get; set; } = string.Empty;

    [JsonPropertyName("frequency")]
    public int Frequency { get; set; }
}

public class RecommendationDto
{
    [JsonPropertyName("target")]
    public string Target { get; set; } = string.Empty;

    [JsonPropertyName("action_item")]
    public string ActionItem { get; set; } = string.Empty;

    [JsonPropertyName("priority")]
    public string Priority { get; set; } = string.Empty; // High, Medium, Low
}