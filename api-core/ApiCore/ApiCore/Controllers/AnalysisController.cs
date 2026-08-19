using ApiCore.Services;
using ApiCore.Models;
using ApiCore.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace ApiCore.Controllers;

[ApiController]
[Route("api/v1/analysis")]
public class AnalysisController : ControllerBase
{
    private readonly AnalysisService _analysisService;
    private readonly AppDbContext _context;
    private readonly IServiceScopeFactory _serviceScopeFactory;
    private readonly ReportsService _reportsService;
    private readonly FileParser _fileParser;

    public AnalysisController(
        AnalysisService analysisService, 
        AppDbContext context, 
        IServiceScopeFactory serviceScopeFactory, 
        ReportsService reportsService,
        FileParser fileParser)
    {
        _analysisService = analysisService;
        _context = context;
        _serviceScopeFactory = serviceScopeFactory;
        _reportsService = reportsService;
        _fileParser = fileParser;
    }

    [HttpPost("generate-trajectory")]
    public async Task<IActionResult> GenerateTrajectory([FromBody] TrajectoryGenerateRequest request)
    {
        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { error = "Пользователь не авторизован." });
        }

        if (request.Employee == null || string.IsNullOrWhiteSpace(request.Employee.Position))
        {
            return BadRequest(new { error = "Необходимо указать должность государственного служащего." });
        }

        var taskId = string.IsNullOrWhiteSpace(request.RequestId) ? Guid.NewGuid().ToString() : request.RequestId;
        var courseName = $"ИОТ: {request.Employee.Fio} ({request.Employee.Position})";

        var report = new AnalysisReport
        {
            Id = taskId,
            UserId = userId,
            CourseName = courseName,
            Status = "Processing",
            CreatedAt = DateTime.UtcNow
        };
        _context.AnalysisReports.Add(report);
        await _context.SaveChangesAsync();

        _ = Task.Run(async () =>
        {
            using var scope = _serviceScopeFactory.CreateScope();
            var scopedService = scope.ServiceProvider.GetRequiredService<AnalysisService>();
            await scopedService.ProcessTrajectoryAsync(taskId, userId, request.Employee, request.ModelType);
        });

        return Accepted(new
        {
            task_id = taskId,
            message = "Запрос на формирование индивидуальной траектории обучения успешно принят в обработку группой ИИ-агентов."
        });
    }

    [HttpPost("upload")]
    [DisableRequestSizeLimit]
    public async Task<IActionResult> UploadFiles(
        [FromForm] List<IFormFile> userResponseFiles,
        [FromForm] string modelType = "deepseek")
    {
        if (userResponseFiles == null || !userResponseFiles.Any())
            return BadRequest(new { error = "Необходимо загрузить хотя бы один файл (.xlsx, .csv или .zip)." });

        var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { error = "Пользователь не авторизован." });
        }

        var taskId = Guid.NewGuid().ToString();
        var tempDir = Path.Combine(Directory.GetCurrentDirectory(), "temp_uploads", taskId);
        Directory.CreateDirectory(tempDir);

        var filePaths = new List<string>();
        foreach (var file in userResponseFiles)
        {
            var path = Path.Combine(tempDir, file.FileName);
            using (var stream = new FileStream(path, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }
            filePaths.Add(path);
        }

        var courseName = FileParser.ExtractCourseName(userResponseFiles[0].FileName);
        var report = new AnalysisReport
        {
            Id = taskId,
            UserId = userId,
            CourseName = $"ИОТ из файла: {courseName}",
            Status = "Processing",
            CreatedAt = DateTime.UtcNow
        };
        _context.AnalysisReports.Add(report);
        await _context.SaveChangesAsync();

        _ = Task.Run(async () =>
        {
            using var scope = _serviceScopeFactory.CreateScope();
            var scopedService = scope.ServiceProvider.GetRequiredService<AnalysisService>();
            await scopedService.ProcessAnalysisAsync(taskId, userId, filePaths, modelType, tempDir);
        });

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

    [HttpGet("users")]
    public IActionResult GetUsers()
    {
        var users = _fileParser.GetDefaultUsersHistory();
        return Ok(users);
    }

    [HttpGet("benchmarks")]
    public IActionResult GetBenchmarks()
    {
        var dataPath = Path.Combine(Directory.GetCurrentDirectory(), "Data", "learning_history_dataset.json");
        if (System.IO.File.Exists(dataPath))
        {
            var json = System.IO.File.ReadAllText(dataPath, System.Text.Encoding.UTF8);
            return Content(json, "application/json");
        }
        return Ok(new { benchmarks_by_position = new Dictionary<string, object>() });
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

            return Ok(new
            {
                status = report.Status,
                result = result,
                error = report.Error
            });
        }

        if (AnalysisService.TaskTracker.TryGetValue(taskId, out var task))
        {
            return Ok(new
            {
                status = task.Status,
                result = task.Result,
                error = task.Error
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
}

public class RenameReportRequest
{
    public string Name { get; set; } = string.Empty;
}