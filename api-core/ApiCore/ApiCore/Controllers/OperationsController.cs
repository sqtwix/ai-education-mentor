using ApiCore.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiCore.Controllers;

[ApiController]
[Authorize(Roles = "Admin")]
[Route("api/v1/operations")]
public sealed class OperationsController(AppDbContext dbContext) : ControllerBase
{
    [HttpGet("metrics")]
    public async Task<IActionResult> GetMetrics(CancellationToken cancellationToken)
    {
        var now = DateTime.UtcNow;
        var statusCounts = await dbContext.AnalysisReports
            .GroupBy(report => report.Status)
            .Select(group => new { status = group.Key, count = group.Count() })
            .ToDictionaryAsync(item => item.status, item => item.count, cancellationToken);

        var durationSamples = await dbContext.AnalysisReports
            .Where(report => report.StartedAt != null
                && (report.Status == "Completed" || report.Status == "CompletedWithLimitations" || report.Status == "Failed"))
            .Select(report => new { report.StartedAt, report.UpdatedAt })
            .ToListAsync(cancellationToken);

        var oldestQueuedAt = await dbContext.AnalysisReports
            .Where(report => report.Status == "Queued" || report.Status == "Retrying")
            .OrderBy(report => report.CreatedAt)
            .Select(report => (DateTime?)report.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        var totalAttempts = await dbContext.AnalysisReports.SumAsync(
            report => (int?)report.AttemptCount,
            cancellationToken) ?? 0;
        var retriedTasks = await dbContext.AnalysisReports.CountAsync(
            report => report.AttemptCount > 1,
            cancellationToken);

        var durations = durationSamples
            .Where(sample => sample.StartedAt.HasValue && sample.UpdatedAt >= sample.StartedAt.Value)
            .Select(sample => (sample.UpdatedAt - sample.StartedAt!.Value).TotalSeconds)
            .ToArray();

        return Ok(new
        {
            generated_at = now,
            correlation_id = HttpContext.TraceIdentifier,
            queue = new
            {
                statuses = statusCounts,
                active = statusCounts.GetValueOrDefault("Queued")
                    + statusCounts.GetValueOrDefault("Processing")
                    + statusCounts.GetValueOrDefault("Retrying"),
                oldest_wait_seconds = oldestQueuedAt.HasValue
                    ? Math.Max(0, (now - oldestQueuedAt.Value).TotalSeconds)
                    : 0
            },
            processing = new
            {
                completed_samples = durations.Length,
                average_duration_seconds = durations.Length > 0 ? durations.Average() : 0,
                maximum_duration_seconds = durations.Length > 0 ? durations.Max() : 0,
                total_attempts = totalAttempts,
                tasks_with_retries = retriedTasks
            }
        });
    }
}
