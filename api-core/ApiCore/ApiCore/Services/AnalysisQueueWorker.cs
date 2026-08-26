using ApiCore.Data;
using ApiCore.Models;
using Microsoft.EntityFrameworkCore;

namespace ApiCore.Services;

public sealed class AnalysisQueueWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<AnalysisQueueWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            string? taskId = null;

            try
            {
                taskId = await ClaimNextJobAsync(stoppingToken);
                if (taskId == null)
                {
                    await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
                    continue;
                }

                using var scope = scopeFactory.CreateScope();
                var analysisService = scope.ServiceProvider.GetRequiredService<AnalysisService>();
                await analysisService.ProcessQueuedJobAsync(taskId, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "Ошибка worker очереди ИОТ для задачи {TaskId}", taskId);
                await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken);
            }
        }
    }

    private async Task<string?> ClaimNextJobAsync(CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

        var reports = await dbContext.AnalysisReports
            .FromSqlRaw("""
                SELECT *
                FROM analysis_reports
                WHERE status IN ('Queued', 'Retrying')
                  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
                ORDER BY created_at
                FOR UPDATE SKIP LOCKED
                LIMIT 1
                """)
            .ToListAsync(cancellationToken);
        var report = reports.SingleOrDefault();

        if (report == null)
        {
            await transaction.CommitAsync(cancellationToken);
            return null;
        }

        report.Status = "Processing";
        report.AttemptCount += 1;
        report.StartedAt = DateTime.UtcNow;
        report.UpdatedAt = DateTime.UtcNow;
        report.NextRetryAt = null;
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);

        logger.LogInformation("Задача {TaskId} взята из стойкой очереди, попытка {Attempt}", report.Id, report.AttemptCount);
        return report.Id;
    }
}
