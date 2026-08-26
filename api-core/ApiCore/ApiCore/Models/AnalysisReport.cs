using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace ApiCore.Models;

[Table("analysis_reports")]
public class AnalysisReport
{
    [Key]
    [MaxLength(255)]
    [Column("id")]
    public string Id { get; set; } = string.Empty;

    [Required]
    [MaxLength(255)]
    [Column("user_id")]
    public Guid UserId { get; set; }

    [Required]
    [MaxLength(255)]
    [Column("course_name")]
    public string CourseName { get; set; } = string.Empty;

    [Required]
    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Required]
    [MaxLength(50)]
    [Column("status")]
    public string Status { get; set; } = string.Empty;

    [Column("result_json", TypeName = "jsonb")]
    public string? ResultJson { get; set; }

    [Column("checkpoint_json", TypeName = "jsonb")]
    public string? CheckpointJson { get; set; }

    [Column("error")]
    public string? Error { get; set; }

    [Column("is_archived")]
    public bool IsArchived { get; set; } = false;

    [Column("job_type")]
    [MaxLength(30)]
    public string? JobType { get; set; }

    [Column("payload_json", TypeName = "jsonb")]
    public string? PayloadJson { get; set; }

    [Column("model_type")]
    [MaxLength(30)]
    public string? ModelType { get; set; }

    [Column("attempt_count")]
    public int AttemptCount { get; set; }

    [Column("next_retry_at")]
    public DateTime? NextRetryAt { get; set; }

    [Column("started_at")]
    public DateTime? StartedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
