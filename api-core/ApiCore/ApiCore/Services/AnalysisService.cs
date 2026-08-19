using ApiCore.Models;
using ApiCore.Data;
using System.Text;
using System.Text.Json;
using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using System.IO.Compression;

namespace ApiCore.Services;

public class AnalysisService
{
    public static readonly ConcurrentDictionary<string, (string Status, CourseBatchAnalysisResult? Result, string? Error)> TaskTracker = new();

    private readonly ValidationService _validationService;
    private readonly ILogger<AnalysisService> _logger;
    private readonly FileParser _fileParser;
    private readonly HttpClient _httpClient;
    private readonly AppDbContext _dbContext;

    public AnalysisService(ValidationService validationService, 
        ILogger<AnalysisService> logger,
        FileParser fileParser,
        HttpClient httpClient,
        AppDbContext dbContext)  
    {
        _validationService = validationService;
        _logger = logger;
        _httpClient = httpClient;
        _fileParser = fileParser;
        _dbContext = dbContext;
    }

    public async Task ProcessTrajectoryAsync(string taskId, Guid userId, EmployeeProfileDto employee, string modelType)
    {
        _logger.LogInformation($"[Task {taskId}] Начало формирования индивидуальной траектории обучения для {employee.Fio} ({employee.Position}).");
        TaskTracker[taskId] = ("Processing", null, null);

        var report = await _dbContext.AnalysisReports.FindAsync(taskId);

        try
        {
            var payload = new
            {
                request_id = taskId,
                employee = employee,
                model_type = modelType
            };

            var jsonSerializerOptions = new JsonSerializerOptions { WriteIndented = false };
            string jsonString = JsonSerializer.Serialize(payload, jsonSerializerOptions);
            var httpContent = new StringContent(jsonString, Encoding.UTF8, "application/json");

            string endpoint = modelType?.ToLowerInvariant() switch
            {
                "gigachat" or "sbergpt" => "agents/get_sbergpt_data_analysis",
                "qwen_local" or "qwen" or "local" => "agents/get_qwen_local_data_analysis",
                _ => "agents/get_deepseek_data_analysis"
            };

            _logger.LogInformation($"[Task {taskId}] Отправка запроса в ai-driver ({endpoint})...");
            var response = await _httpClient.PostAsync(endpoint, httpContent);

            if (response.IsSuccessStatusCode)
            {
                string responseBody = await response.Content.ReadAsStringAsync();
                var result = JsonSerializer.Deserialize<CourseBatchAnalysisResult>(responseBody, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                TaskTracker[taskId] = ("Completed", result, null);

                if (report != null)
                {
                    report.Status = "Completed";
                    report.ResultJson = responseBody;
                    await _dbContext.SaveChangesAsync();
                }
                _logger.LogInformation($"[Task {taskId}] Траектория успешно сформирована и сохранена.");
            }
            else
            {
                string errorContext = await response.Content.ReadAsStringAsync();
                _logger.LogError($"[Task {taskId}] ai-driver вернул ошибку {response.StatusCode}: {errorContext}");
                TaskTracker[taskId] = ("Failed", null, $"ai-driver error {response.StatusCode}: {errorContext}");

                if (report != null)
                {
                    report.Status = "Failed";
                    report.Error = $"ai-driver error {response.StatusCode}: {errorContext}";
                    await _dbContext.SaveChangesAsync();
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError($"[Task {taskId}] Ошибка при генерации траектории: {ex.Message}");
            TaskTracker[taskId] = ("Failed", null, ex.Message);

            if (report != null)
            {
                report.Status = "Failed";
                report.Error = ex.Message;
                await _dbContext.SaveChangesAsync();
            }
        }
    }

    public async Task ProcessAnalysisAsync(string taskId, Guid userId, List<string> filePaths, string modelType, string tempDir)
    {
        _logger.LogInformation($"[Task {taskId}] Начало обработки файлов пакета.");
        TaskTracker[taskId] = ("Processing", null, null);

        var report = await _dbContext.AnalysisReports.FindAsync(taskId);

        try
        {
            // 0. Распаковка ZIP архивов
            var expandedPaths = new List<string>();
            foreach (var path in filePaths)
            {
                var ext = Path.GetExtension(path).ToLowerInvariant();
                if (ext == ".zip")
                {
                    _logger.LogInformation($"[Task {taskId}] Обнаружен ZIP-архив: {Path.GetFileName(path)}. Распаковка...");
                    var zipExtractDir = Path.Combine(tempDir, "extracted_" + Path.GetFileNameWithoutExtension(path));
                    Directory.CreateDirectory(zipExtractDir);

                    using var archive = ZipFile.OpenRead(path);
                    foreach (var entry in archive.Entries)
                    {
                        if (string.IsNullOrEmpty(entry.Name)) continue;
                        if (entry.FullName.StartsWith("__MACOSX") || entry.Name.StartsWith("._") || entry.Name.Equals(".DS_Store", StringComparison.OrdinalIgnoreCase))
                            continue;

                        var nestedExt = Path.GetExtension(entry.Name).ToLowerInvariant();
                        if (nestedExt == ".xlsx" || nestedExt == ".xls" || nestedExt == ".csv" || nestedExt == ".json")
                        {
                            var destinationPath = Path.Combine(zipExtractDir, entry.Name);
                            int counter = 1;
                            while (File.Exists(destinationPath))
                            {
                                var nameWithoutExt = Path.GetFileNameWithoutExtension(entry.Name);
                                destinationPath = Path.Combine(zipExtractDir, $"{nameWithoutExt}_{counter++}{nestedExt}");
                            }
                            entry.ExtractToFile(destinationPath);
                            expandedPaths.Add(destinationPath);
                        }
                    }
                }
                else
                {
                    expandedPaths.Add(path);
                }
            }

            // 1. Извлекаем профиль пользователя из загруженного файла истории
            var users = _fileParser.ParseHistoryFiles(expandedPaths);
            var targetEmployee = users.FirstOrDefault() ?? new EmployeeProfileDto
            {
                Fio = "Государственный служащий",
                Position = "Главный специалист",
                Department = "Администрация Санкт-Петербурга",
                ExperienceYears = 3,
                CareerGoal = "Развитие ключевых служебных навыков"
            };

            await ProcessTrajectoryAsync(taskId, userId, targetEmployee, modelType);
        }
        catch (Exception ex)
        {
            _logger.LogError($"[Task {taskId}] Ошибка при обработке файлов: {ex.Message}");
            TaskTracker[taskId] = ("Failed", null, ex.Message);

            if (report != null)
            {
                report.Status = "Failed";
                report.Error = ex.Message;
                await _dbContext.SaveChangesAsync();
            }
        }
        finally
        {
            try
            {
                if (Directory.Exists(tempDir))
                {
                    Directory.Delete(tempDir, true);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning($"[Task {taskId}] Не удалось удалить временную директорию {tempDir}: {ex.Message}");
            }
        }
    }
}