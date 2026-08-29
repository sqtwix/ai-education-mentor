using ApiCore.Services;
using ApiCore.Models;
using ApiCore.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Memory;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace ApiCore.Controllers;

[ApiController]
[Route("api/v1/analysis")]
public class AnalysisController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly ReportsService _reportsService;
    private readonly FileParser _fileParser;
    private readonly ValidationService _validationService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IMemoryCache _memoryCache;
    private readonly UploadOptions _uploadOptions;

    public AnalysisController(
        AppDbContext context, 
        ReportsService reportsService,
        FileParser fileParser,
        ValidationService validationService,
        IHttpClientFactory httpClientFactory,
        IMemoryCache memoryCache,
        IOptions<UploadOptions> uploadOptions)
    {
        _context = context;
        _reportsService = reportsService;
        _fileParser = fileParser;
        _validationService = validationService;
        _httpClientFactory = httpClientFactory;
        _memoryCache = memoryCache;
        _uploadOptions = uploadOptions.Value;
    }

    [HttpPost("generate-trajectory")]
    [EnableRateLimiting("analysis")]
    public async Task<IActionResult> GenerateTrajectory([FromBody] TrajectoryGenerateRequest request)
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { error = "Пользователь не авторизован." });
        }

        if (request.Employee == null ||
            string.IsNullOrWhiteSpace(request.Employee.Fio) ||
            string.IsNullOrWhiteSpace(request.Employee.Position) ||
            string.IsNullOrWhiteSpace(request.Employee.Department) ||
            string.IsNullOrWhiteSpace(request.Employee.CareerGoal))
        {
            return BadRequest(new { error = "Необходимо указать ФИО, должность, ИОГВ и цель обучения." });
        }
        if (!TryNormalizeModelType(request.ModelType, out var modelType))
        {
            return BadRequest(new { error = "Неизвестная модель. Допустимые значения: deepseek, sbergpt, qwen_local." });
        }
        var taskId = string.IsNullOrWhiteSpace(request.RequestId) ? Guid.NewGuid().ToString() : request.RequestId;
        if (taskId.Length > 128 || taskId.Any(character => !char.IsLetterOrDigit(character) && character is not '-' and not '_'))
        {
            return BadRequest(new { error = "Идентификатор запроса может содержать только буквы, цифры, дефис и подчеркивание (до 128 символов)." });
        }
        var payloadJson = JsonSerializer.Serialize(new QueuedAnalysisPayload { Employees = [request.Employee] });
        var existingReport = await _context.AnalysisReports.FirstOrDefaultAsync(report => report.Id == taskId);
        if (existingReport != null)
        {
            if (existingReport.UserId != userId
                || existingReport.ModelType != modelType
                || !JsonPayloadEquals(existingReport.PayloadJson, payloadJson))
            {
                return Conflict(new { error = "Идентификатор запроса уже используется для другого задания." });
            }
            return Accepted(new
            {
                task_id = existingReport.Id,
                message = "Повторный запрос распознан; используется уже созданная задача.",
                deduplicated = true
            });
        }
        if (!await IsModelAvailableAsync(modelType, HttpContext.RequestAborted))
        {
            return ModelUnavailable();
        }
        var courseName = $"ИОТ: {request.Employee.Fio} ({request.Employee.Position})";

        var report = new AnalysisReport
        {
            Id = taskId,
            UserId = userId,
            CourseName = courseName,
            Status = "Queued",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            JobType = "trajectory",
            ModelType = modelType,
            PayloadJson = payloadJson
        };
        _context.AnalysisReports.Add(report);
        await _context.SaveChangesAsync();

        return Accepted(new
        {
            task_id = taskId,
            message = "Запрос на формирование индивидуальной траектории обучения успешно принят в обработку группой ИИ-агентов."
        });
    }

    private static bool JsonPayloadEquals(string? storedPayload, string requestedPayload)
    {
        if (string.IsNullOrWhiteSpace(storedPayload)) return false;

        try
        {
            using var storedDocument = JsonDocument.Parse(storedPayload);
            using var requestedDocument = JsonDocument.Parse(requestedPayload);
            return JsonElement.DeepEquals(storedDocument.RootElement, requestedDocument.RootElement);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    [HttpPost("upload")]
    [EnableRateLimiting("upload")]
    public async Task<IActionResult> UploadFiles(
        [FromForm] List<IFormFile> userResponseFiles,
        [FromForm] string modelType = "deepseek",
        [FromForm] string? requestId = null)
    {
        if (userResponseFiles == null || !userResponseFiles.Any())
            return BadRequest(new { error = "Необходимо загрузить хотя бы один файл (.json, .xlsx, .xls, .csv или .zip)." });

        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { error = "Пользователь не авторизован." });
        }
        if (!TryNormalizeModelType(modelType, out var normalizedModelType))
        {
            return BadRequest(new { error = "Неизвестная модель. Допустимые значения: deepseek, sbergpt, qwen_local." });
        }
        var taskId = string.IsNullOrWhiteSpace(requestId) ? Guid.NewGuid().ToString() : requestId;
        if (taskId.Length > 128 || taskId.Any(character => !char.IsLetterOrDigit(character) && character is not '-' and not '_'))
        {
            return BadRequest(new { error = "Идентификатор запроса может содержать только буквы, цифры, дефис и подчеркивание (до 128 символов)." });
        }
        var existingReport = await _context.AnalysisReports.FirstOrDefaultAsync(report => report.Id == taskId);
        if (existingReport != null)
        {
            if (existingReport.UserId != userId || existingReport.ModelType != normalizedModelType)
            {
                return Conflict(new { error = "Идентификатор запроса уже используется для другого задания." });
            }
        }

        if (userResponseFiles.Count > _uploadOptions.MaxFileCount)
            return BadRequest(new { error = $"За один раз допускается загрузить не более {_uploadOptions.MaxFileCount} файлов." });
        if (userResponseFiles.Any(file => file.Length <= 0))
            return BadRequest(new { error = "Пустые файлы не допускаются." });
        if (userResponseFiles.Any(file => file.Length > _uploadOptions.MaxFileBytes))
            return BadRequest(new { error = $"Размер одного файла не должен превышать {Math.Max(1, _uploadOptions.MaxFileBytes / (1024 * 1024))} МБ." });
        if (userResponseFiles.Sum(file => file.Length) > _uploadOptions.MaxRequestBytes)
            return BadRequest(new { error = $"Общий размер файлов не должен превышать {Math.Max(1, _uploadOptions.MaxRequestBytes / (1024 * 1024))} МБ." });
        var tempDir = Path.Combine(Directory.GetCurrentDirectory(), "temp_uploads", taskId);
        Directory.CreateDirectory(tempDir);
        using var tempDirectoryCleanup = new TemporaryDirectoryCleanup(tempDir);

        var filePaths = new List<string>();
        foreach (var file in userResponseFiles)
        {
            var safeFileName = Path.GetFileName(file.FileName);
            if (string.IsNullOrWhiteSpace(safeFileName) || safeFileName.Length > 180)
            {
                try { Directory.Delete(tempDir, true); } catch { /* ignore cleanup errors */ }
                return BadRequest(new { error = "Имя одного из загруженных файлов некорректно или превышает 180 символов." });
            }

            var path = Path.Combine(tempDir, $"{Guid.NewGuid():N}_{safeFileName}");
            using (var stream = new FileStream(path, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }
            filePaths.Add(path);
        }

        var validation = _validationService.ValidateFiles(filePaths);
        if (!validation.IsValid)
        {
            try { Directory.Delete(tempDir, true); } catch { /* ignore cleanup errors */ }
            return BadRequest(new
            {
                error = "Файлы не соответствуют схеме ИОТ.",
                details = validation.Errors
            });
        }

        var parsedProfiles = _fileParser.ParseHistoryFiles(filePaths);
        var profileValidation = _validationService.ValidateEmployeeProfiles(parsedProfiles);
        if (!profileValidation.IsValid)
        {
            try { Directory.Delete(tempDir, true); } catch { /* ignore cleanup errors */ }
            return BadRequest(new
            {
                error = "Профили не соответствуют схеме ИОТ.",
                details = profileValidation.Errors
            });
        }

        var payloadJson = JsonSerializer.Serialize(new QueuedAnalysisPayload { Employees = parsedProfiles });
        if (existingReport != null)
        {
            try { Directory.Delete(tempDir, true); } catch { /* temporary upload cleanup is best-effort */ }
            if (!JsonPayloadEquals(existingReport.PayloadJson, payloadJson))
            {
                return Conflict(new { error = "Идентификатор запроса уже используется для другого содержимого файлов." });
            }
            return Accepted(new
            {
                task_id = existingReport.Id,
                message = "Повторная загрузка распознана; используется уже созданная задача.",
                deduplicated = true
            });
        }

        if (!await IsModelAvailableAsync(normalizedModelType, HttpContext.RequestAborted))
        {
            return ModelUnavailable();
        }

        var courseName = FileParser.ExtractCourseName(userResponseFiles[0].FileName);
        var report = new AnalysisReport
        {
            Id = taskId,
            UserId = userId,
            CourseName = $"ИОТ из файла: {courseName}",
            Status = "Queued",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            JobType = "batch",
            ModelType = normalizedModelType,
            PayloadJson = payloadJson
        };
        _context.AnalysisReports.Add(report);
        await _context.SaveChangesAsync();
        try { Directory.Delete(tempDir, true); } catch { /* temporary upload cleanup is best-effort */ }

        return Accepted(new
        {
            task_id = taskId,
            message = "Файлы успешно загружены и переданы на анализ группе ИИ-агентов."
        });
    }

    [HttpGet("catalog")]
    public IActionResult GetCatalog()
    {
        var catalog = _fileParser.GetDefaultCatalog();
        return Ok(catalog);
    }

    private async Task<bool> IsModelAvailableAsync(string modelType, CancellationToken cancellationToken)
    {
        try
        {
            var client = _httpClientFactory.CreateClient("AiDriverStatus");
            using var response = await client.GetAsync("models/availability", cancellationToken);
            if (!response.IsSuccessStatusCode) return false;

            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            if (!document.RootElement.TryGetProperty("models", out var models) ||
                models.ValueKind != JsonValueKind.Array)
            {
                return false;
            }

            foreach (var model in models.EnumerateArray())
            {
                if (model.TryGetProperty("id", out var id) &&
                    string.Equals(id.GetString(), modelType, StringComparison.OrdinalIgnoreCase) &&
                    model.TryGetProperty("configured", out var configured) &&
                    configured.ValueKind is JsonValueKind.True or JsonValueKind.False)
                {
                    return configured.GetBoolean();
                }
            }
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            // Таймаут проверки трактуется как недоступность модели.
        }
        catch (Exception exception) when (exception is HttpRequestException or JsonException)
        {
            // Отсутствие AI-driver или повреждённый ответ не должны нарушать
            // каталог, аналитику и остальные функции платформы.
        }

        return false;
    }

    private ObjectResult ModelUnavailable()
    {
        return StatusCode(StatusCodes.Status503ServiceUnavailable, new
        {
            error = "Выбранная модель ИИ не настроена или временно недоступна. Платформа продолжает работать без генерации траекторий.",
            code = "MODEL_UNAVAILABLE"
        });
    }

    [HttpGet("models")]
    public async Task<IActionResult> GetModelAvailability(CancellationToken cancellationToken)
    {
        try
        {
            var client = _httpClientFactory.CreateClient("AiDriverStatus");
            using var response = await client.GetAsync("models/availability", cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "Не удалось получить состояние моделей ИИ." });
            }

            return Content(body, "application/json");
        }
        catch (Exception)
        {
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { error = "AI-драйвер недоступен; состояние моделей неизвестно." });
        }
    }

    [HttpGet("users")]
    [Authorize(Roles = "Admin")]
    public IActionResult GetUsers()
    {
        var users = _fileParser.GetDefaultUsersHistory();
        return Ok(users);
    }

    [HttpGet("benchmarks")]
    public IActionResult GetBenchmarks()
    {
        const string cacheKey = "analysis-benchmarks-v1";
        if (_memoryCache.TryGetValue<object>(cacheKey, out var cached) && cached != null)
        {
            Response.Headers["X-Benchmark-Cache"] = "HIT";
            return Ok(cached);
        }

        var response = LoadBenchmarks();
        _memoryCache.Set(cacheKey, response, TimeSpan.FromMinutes(5));
        Response.Headers["X-Benchmark-Cache"] = "MISS";
        return Ok(response);
    }

    private static object LoadBenchmarks()
    {
        var dataPath = Path.Combine(Directory.GetCurrentDirectory(), "Data", "learning_history_dataset.json");
        if (System.IO.File.Exists(dataPath))
        {
            var json = System.IO.File.ReadAllText(dataPath, System.Text.Encoding.UTF8);
            using var document = JsonDocument.Parse(json);
            var root = document.RootElement;
            return new
            {
                total_records = root.TryGetProperty("total_records", out var totalRecords)
                    ? totalRecords.GetInt32()
                    : 0,
                benchmarks_by_position = root.TryGetProperty("benchmarks_by_position", out var byPosition)
                    ? byPosition.Clone()
                    : JsonSerializer.SerializeToElement(new Dictionary<string, object>()),
                benchmarks_by_position_and_dept = root.TryGetProperty("benchmarks_by_position_and_dept", out var byPair)
                    ? byPair.Clone()
                    : JsonSerializer.SerializeToElement(new Dictionary<string, object>())
            };
        }
        return new
        {
            total_records = 0,
            benchmarks_by_position = new Dictionary<string, object>(),
            benchmarks_by_position_and_dept = new Dictionary<string, object>()
        };
    }

    [HttpGet("status/{taskId}")]
    public async Task<IActionResult> GetStatus(string taskId)
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { error = "Пользователь не авторизован." });
        }

        var report = await _context.AnalysisReports
            .FirstOrDefaultAsync(r => r.Id == taskId && r.UserId == userId);

        if (report != null)
        {
            CourseBatchAnalysisResult? result = null;
            if (!string.IsNullOrEmpty(report.ResultJson))
            {
                result = JsonSerializer.Deserialize<CourseBatchAnalysisResult>(
                    report.ResultJson, 
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
                );
            }

            var progressStage = report.Status switch
            {
                "Queued" => "queued",
                "Retrying" => "queued",
                "Completed" or "CompletedWithLimitations" => "completed",
                "Failed" => "failed",
                _ => "profile_analysis"
            };
            var progressMessage = report.Status switch
            {
                "Queued" => "Задача ожидает запуска в очереди.",
                "Retrying" => "Задача ожидает повторной попытки.",
                "Completed" => "Траектория сформирована.",
                "CompletedWithLimitations" => "Резервная траектория сформирована и требует проверки.",
                "Failed" => report.Error ?? "Не удалось сформировать траекторию.",
                _ => "Анализируем профиль и историю обучения."
            };
            int? progressPercent = report.Status switch
            {
                "Queued" => null,
                "Retrying" => null,
                "Completed" or "CompletedWithLimitations" or "Failed" => 100,
                _ => null
            };

            if (report.Status == "Processing")
            {
                try
                {
                    var client = _httpClientFactory.CreateClient("AiDriverStatus");
                    using var progressResponse = await client.GetAsync($"agents/progress/{Uri.EscapeDataString(taskId)}");
                    if (progressResponse.IsSuccessStatusCode)
                    {
                        using var progressDocument = JsonDocument.Parse(await progressResponse.Content.ReadAsStringAsync());
                        var progressRoot = progressDocument.RootElement;
                        var isCurrentAttempt = !report.StartedAt.HasValue;
                        if (progressRoot.TryGetProperty("updated_at", out var updatedAt) &&
                            DateTimeOffset.TryParse(updatedAt.GetString(), out var progressUpdatedAt))
                        {
                            isCurrentAttempt = !report.StartedAt.HasValue || progressUpdatedAt.UtcDateTime >= report.StartedAt.Value;
                        }
                        if (isCurrentAttempt)
                        {
                            if (progressRoot.TryGetProperty("stage", out var stage))
                                progressStage = stage.GetString() ?? progressStage;
                            if (progressRoot.TryGetProperty("message", out var message))
                                progressMessage = message.GetString() ?? progressMessage;
                            if (progressRoot.TryGetProperty("percent", out var percent) && percent.TryGetInt32(out var parsedPercent))
                                progressPercent = Math.Clamp(parsedPercent, 0, 100);
                        }
                    }
                }
                catch
                {
                    // Статус самой задачи остаётся доступным, даже если детализация AI-driver временно недоступна.
                }
            }

            return Ok(new
            {
                status = report.Status,
                result = result,
                error = report.Error,
                progress_stage = progressStage,
                progress_message = progressMessage,
                progress_percent = progressPercent,
                attempt_count = report.AttemptCount,
                next_retry_at = report.NextRetryAt,
                updated_at = report.UpdatedAt
            });
        }

        return NotFound(new { error = $"Задача с ID {taskId} не найдена." });
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory([FromQuery] bool includeArchived = false, [FromQuery] bool onlyArchived = false)
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { error = "Пользователь не авторизован." });
        }

        var reports = await _reportsService.GetHistoryAsync(userId, includeArchived, onlyArchived);
        return Ok(reports);
    }

    [HttpPut("rename/{taskId}")]
    public async Task<IActionResult> RenameReport(string taskId, [FromBody] RenameReportRequest request)
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { error = "Пользователь не авторизован." });
        }

        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new { error = "Название не может быть пустым." });
        }

        if (request.Name.Trim().Length > 255)
        {
            return BadRequest(new { error = "Название не может быть длиннее 255 символов." });
        }

        var success = await _reportsService.RenameReportAsync(taskId, userId, request.Name);
        if (!success)
        {
            return NotFound(new { error = "Отчет не найден." });
        }

        return Ok(new { message = "Отчет успешно переименован.", courseName = request.Name.Trim() });
    }

    [HttpPut("archive/{taskId}")]
    public async Task<IActionResult> ArchiveReport(string taskId)
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { error = "Пользователь не авторизован." });
        }

        var success = await _reportsService.ArchiveReportAsync(taskId, userId);
        if (!success)
        {
            return NotFound(new { error = "Отчет не найден." });
        }

        return Ok(new { message = "Отчет успешно архивирован." });
    }

    [HttpPut("unarchive/{taskId}")]
    public async Task<IActionResult> UnarchiveReport(string taskId)
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { error = "Пользователь не авторизован." });
        }

        var success = await _reportsService.UnarchiveReportAsync(taskId, userId);
        if (!success)
        {
            return NotFound(new { error = "Отчет не найден." });
        }

        return Ok(new { message = "Отчет успешно разархивирован." });
    }

    private static bool TryNormalizeModelType(string? value, out string normalized)
    {
        normalized = (value ?? string.Empty).Trim().ToLowerInvariant() switch
        {
            "deepseek" => "deepseek",
            "sbergpt" or "gigachat" => "sbergpt",
            "qwen_local" => "qwen_local",
            _ => string.Empty
        };
        return normalized.Length > 0;
    }
}

public class RenameReportRequest
{
    [System.ComponentModel.DataAnnotations.StringLength(255)]
    public string Name { get; set; } = string.Empty;
}

internal sealed class TemporaryDirectoryCleanup(string path) : IDisposable
{
    public void Dispose()
    {
        try
        {
            if (Directory.Exists(path)) Directory.Delete(path, recursive: true);
        }
        catch
        {
            // Временные данные не должны менять результат уже завершенного запроса.
        }
    }
}
