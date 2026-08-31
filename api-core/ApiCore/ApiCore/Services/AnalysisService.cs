using System.Text;
using System.Text.Json;
using ApiCore.Data;
using ApiCore.Models;

namespace ApiCore.Services;

public sealed class AnalysisService
{
    private const int DefaultMaxAttempts = 5;

    private readonly AppDbContext _dbContext;
    private readonly HttpClient _httpClient;
    private readonly ILogger<AnalysisService> _logger;
    private readonly int _maxAttempts;

    public AnalysisService(
        AppDbContext dbContext,
        HttpClient httpClient,
        ILogger<AnalysisService> logger,
        IConfiguration configuration)
    {
        _dbContext = dbContext;
        _httpClient = httpClient;
        _logger = logger;
        _maxAttempts = configuration.GetValue<int?>("AnalysisQueue:MaxAttempts") is >= 1 and <= 10
            ? configuration.GetValue<int>("AnalysisQueue:MaxAttempts")
            : DefaultMaxAttempts;
    }

    public async Task ProcessQueuedJobAsync(string taskId, CancellationToken cancellationToken)
    {
        var report = await _dbContext.AnalysisReports.FindAsync([taskId], cancellationToken);
        if (report == null)
        {
            _logger.LogWarning("Задача {TaskId} исчезла после получения из очереди", taskId);
            return;
        }

        try
        {
            if (string.IsNullOrWhiteSpace(report.PayloadJson) || string.IsNullOrWhiteSpace(report.ModelType))
            {
                throw new InvalidDataException("Задача не содержит сохраненного входного профиля или модели.");
            }

            var payload = JsonSerializer.Deserialize<QueuedAnalysisPayload>(
                report.PayloadJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (payload?.Employees == null || payload.Employees.Count == 0)
            {
                throw new InvalidDataException("Задача не содержит профилей для обработки.");
            }

            var result = await ProcessEmployeesAsync(report, payload.Employees, report.ModelType, cancellationToken);
            report.Status = result.Status;
            report.ResultJson = result.ResultJson;
            report.CheckpointJson = null;
            report.Error = null;
            report.NextRetryAt = null;
            report.UpdatedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Задача {TaskId} завершена со статусом {Status}", taskId, result.Status);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Остановка приложения не является неудачной попыткой: входные данные
            // уже сохранены, и задача должна продолжиться после следующего запуска.
            report.AttemptCount = Math.Max(0, report.AttemptCount - 1);
            report.Status = "Retrying";
            report.Error = "Обработка прервана остановкой worker и будет продолжена после запуска.";
            report.NextRetryAt = DateTime.UtcNow;
            report.UpdatedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(CancellationToken.None);
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Ошибка обработки задачи ИОТ {TaskId}, попытка {Attempt}", taskId, report.AttemptCount);
            report.ResultJson = null;
            report.UpdatedAt = DateTime.UtcNow;

            if (report.AttemptCount < _maxAttempts && exception is not InvalidDataException)
            {
                report.Status = "Retrying";
                report.Error = "Сервис ИИ временно недоступен. Задача ожидает повторной попытки.";
                report.NextRetryAt = DateTime.UtcNow.AddSeconds(Math.Min(30, report.AttemptCount * 5));
            }
            else
            {
                report.Status = "Failed";
                report.Error = exception is InvalidDataException
                    ? exception.Message
                    : "Не удалось сформировать траекторию после повторных попыток. Проверьте выбранную модель и повторите запуск.";
                report.NextRetryAt = null;
            }

            await _dbContext.SaveChangesAsync(CancellationToken.None);
        }
    }

    private async Task<ProcessingResult> ProcessEmployeesAsync(
        AnalysisReport report,
        IReadOnlyList<EmployeeProfileDto> employees,
        string modelType,
        CancellationToken cancellationToken)
    {
        if (employees.Count == 1)
        {
            var responseJson = await RequestTrajectoryAsync(report.Id, employees[0], modelType, cancellationToken);
            var root = JsonSerializer.Deserialize<JsonElement>(responseJson);
            ValidateAiResponse(root);
            return new ProcessingResult(GetCompletionStatus(root), responseJson);
        }

        var checkpoint = ReadCheckpoint(report, employees.Count);
        var trajectories = checkpoint.Trajectories;
        var degraded = checkpoint.Degraded;

        for (var index = checkpoint.NextEmployeeIndex; index < employees.Count; index++)
        {
            var responseJson = await RequestTrajectoryAsync(report.Id, employees[index], modelType, cancellationToken);
            var root = JsonSerializer.Deserialize<JsonElement>(responseJson);
            ValidateAiResponse(root);

            if (root.TryGetProperty("quality_status", out var quality) &&
                string.Equals(quality.GetString(), "degraded", StringComparison.OrdinalIgnoreCase))
            {
                degraded = true;
            }

            trajectories.Add(root.GetProperty("trajectory").Clone());
            report.CheckpointJson = JsonSerializer.Serialize(new BatchProcessingCheckpoint
            {
                NextEmployeeIndex = index + 1,
                Degraded = degraded,
                Trajectories = trajectories
            });
            report.UpdatedAt = DateTime.UtcNow;
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        var combinedResult = new
        {
            batch_id = report.Id,
            total_profiles_processed = trajectories.Count,
            batch_selection_required = true,
            batch_limit = employees.Count,
            generation_mode = degraded ? "fallback" : "llm",
            quality_status = degraded ? "degraded" : "verified",
            trajectory = (object?)null,
            courses_analysis = trajectories
        };

        return new ProcessingResult(
            degraded ? "CompletedWithLimitations" : "Completed",
            JsonSerializer.Serialize(combinedResult));
    }

    private static BatchProcessingCheckpoint ReadCheckpoint(AnalysisReport report, int employeeCount)
    {
        if (string.IsNullOrWhiteSpace(report.CheckpointJson)) return new BatchProcessingCheckpoint();

        BatchProcessingCheckpoint? checkpoint;
        try
        {
            checkpoint = JsonSerializer.Deserialize<BatchProcessingCheckpoint>(
                report.CheckpointJson,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        }
        catch (JsonException exception)
        {
            throw new InvalidDataException("Сохраненная контрольная точка пакетной задачи повреждена.", exception);
        }

        if (checkpoint == null ||
            checkpoint.NextEmployeeIndex < 0 ||
            checkpoint.NextEmployeeIndex > employeeCount ||
            checkpoint.Trajectories.Count != checkpoint.NextEmployeeIndex)
        {
            throw new InvalidDataException("Сохраненная контрольная точка пакетной задачи не соответствует входным профилям.");
        }

        return checkpoint;
    }

    private async Task<string> RequestTrajectoryAsync(
        string requestId,
        EmployeeProfileDto employee,
        string modelType,
        CancellationToken cancellationToken)
    {
        var requestPayload = new
        {
            request_id = requestId,
            employee = new
            {
                fio = employee.Fio,
                position = employee.Position,
                department = employee.Department,
                experience_years = employee.ExperienceYears,
                career_goal = employee.CareerGoal,
                learning_history = employee.LearningHistory.Select(history => new
                {
                    course_name = history.CourseName,
                    course_type = history.CourseType,
                    status = history.Status
                })
            },
            model_type = modelType
        };

        using var content = new StringContent(
            JsonSerializer.Serialize(requestPayload),
            Encoding.UTF8,
            "application/json");
        using var request = new HttpRequestMessage(HttpMethod.Post, GetEndpoint(modelType))
        {
            Content = content
        };
        request.Headers.TryAddWithoutValidation("X-Correlation-ID", requestId);
        using var response = await _httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException($"ai-driver returned HTTP {(int)response.StatusCode}");
        }

        return await response.Content.ReadAsStringAsync(cancellationToken);
    }

    private static void ValidateAiResponse(JsonElement root)
    {
        if (root.TryGetProperty("quality_status", out var quality) &&
            string.Equals(quality.GetString(), "failed", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Сервис ИИ вернул неуспешный результат.");
        }

        if (!root.TryGetProperty("trajectory", out var trajectory) ||
            trajectory.ValueKind != JsonValueKind.Object ||
            !trajectory.TryGetProperty("stages", out var stages) ||
            stages.ValueKind != JsonValueKind.Array)
        {
            throw new InvalidOperationException("Сервис ИИ вернул некорректную структуру траектории.");
        }
    }

    private static string GetEndpoint(string modelType) => modelType switch
    {
        "sbergpt" => "/agents/get_sbergpt_data_analysis",
        "local_llm" => "/agents/get_local_llm_data_analysis",
        "qwen_local" => "/agents/get_qwen_local_data_analysis",
        _ => "/agents/get_deepseek_data_analysis"
    };

    private static string GetCompletionStatus(JsonElement result)
    {
        if (result.TryGetProperty("quality_status", out var quality) &&
            string.Equals(quality.GetString(), "degraded", StringComparison.OrdinalIgnoreCase))
        {
            return "CompletedWithLimitations";
        }

        return "Completed";
    }

    private sealed record ProcessingResult(string Status, string ResultJson);
}

public sealed class QueuedAnalysisPayload
{
    public List<EmployeeProfileDto> Employees { get; set; } = [];
}

public sealed class BatchProcessingCheckpoint
{
    public int NextEmployeeIndex { get; set; }
    public bool Degraded { get; set; }
    public List<JsonElement> Trajectories { get; set; } = [];
}
