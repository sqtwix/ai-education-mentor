using ApiCore.Data;
using ApiCore.Models;
using System.Collections.Concurrent;
using System.Text.Json;
using System.IO.Compression;
using System.Text;

namespace ApiCore.Services;

public class AnalysisService
{
    private readonly AppDbContext _dbContext;
    private readonly HttpClient _httpClient;
    private readonly FileParser _fileParser;
    private readonly ILogger<AnalysisService> _logger;

    public static readonly ConcurrentDictionary<string, (string Status, object? Result, string? Error)> TaskTracker = new();

    public AnalysisService(
        AppDbContext dbContext,
        HttpClient httpClient,
        FileParser fileParser,
        ILogger<AnalysisService> logger)
    {
        _dbContext = dbContext;
        _httpClient = httpClient;
        _fileParser = fileParser;
        _logger = logger;
    }

    public async Task ProcessTrajectoryAsync(string taskId, Guid userId, EmployeeProfileDto employee, string modelType)
    {
        _logger.LogInformation($"[Task {taskId}] Запуск генерации ИОТ для {employee.Fio} ({employee.Position}) через {modelType}");
        TaskTracker[taskId] = ("Processing", null, null);

        var report = await _dbContext.AnalysisReports.FindAsync(taskId);

        try
        {
            var requestPayload = new
            {
                request_id = taskId,
                employee = new
                {
                    fio = employee.Fio,
                    position = employee.Position,
                    department = employee.Department,
                    experience_years = employee.ExperienceYears,
                    career_goal = employee.CareerGoal,
                    learning_history = employee.LearningHistory?.Select(h => new
                    {
                        course_name = h.CourseName,
                        course_type = h.CourseType,
                        status = h.Status
                    }).ToList()
                },
                model_type = modelType.ToLowerInvariant()
            };

            string endpoint = modelType.ToLowerInvariant() switch
            {
                "sbergpt" or "gigachat" => "/agents/get_sbergpt_data_analysis",
                "qwen_local" => "/agents/get_qwen_local_data_analysis",
                _ => "/agents/get_deepseek_data_analysis"
            };

            var jsonContent = new StringContent(
                JsonSerializer.Serialize(requestPayload),
                Encoding.UTF8,
                "application/json"
            );

            _logger.LogInformation($"[Task {taskId}] Отправка запроса в ai-driver: {endpoint}");
            var response = await _httpClient.PostAsync(endpoint, jsonContent);

            if (!response.IsSuccessStatusCode)
            {
                var errorText = await response.Content.ReadAsStringAsync();
                throw new Exception($"ai-driver вернул ошибку ({response.StatusCode}): {errorText}");
            }

            var responseJson = await response.Content.ReadAsStringAsync();
            var resultDoc = JsonSerializer.Deserialize<JsonElement>(responseJson);

            TaskTracker[taskId] = ("Completed", resultDoc, null);

            if (report != null)
            {
                report.Status = "Completed";
                report.ResultJson = responseJson;
                await _dbContext.SaveChangesAsync();
            }

            _logger.LogInformation($"[Task {taskId}] Генерация ИОТ успешно завершена.");
        }
        catch (Exception ex)
        {
            _logger.LogError($"[Task {taskId}] Ошибка при генерации ИОТ: {ex.Message}");
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
            // 0. Распаковка архивов и чтение всех файлов
            var users = _fileParser.ParseHistoryFiles(filePaths);

            if (users.Count == 0)
            {
                // Если не найдено пользователей, создаем типовой профиль ГГС
                users.Add(new EmployeeProfileDto
                {
                    Fio = "Государственный гражданский служащий",
                    Position = "Главный специалист",
                    Department = "Администрация Губернатора Санкт-Петербурга",
                    ExperienceYears = 3,
                    CareerGoal = "Развитие управленческих и цифровых компетенций в сфере госуправления"
                });
            }

            // Обрабатываем пользователей: если передан 1 пользователь - генерируем для него, если несколько - генерируем для всех (до 15 за раз)
            var generatedTrajectories = new List<JsonElement>();

            int batchLimit = Math.Min(users.Count, 15);
            for (int i = 0; i < batchLimit; i++)
            {
                var emp = users[i];
                string singleTaskId = i == 0 ? taskId : $"{taskId}_user_{i + 1}";

                var requestPayload = new
                {
                    request_id = singleTaskId,
                    employee = new
                    {
                        fio = emp.Fio,
                        position = emp.Position,
                        department = emp.Department,
                        experience_years = emp.ExperienceYears,
                        career_goal = emp.CareerGoal,
                        learning_history = emp.LearningHistory?.Select(h => new
                        {
                            course_name = h.CourseName,
                            course_type = h.CourseType,
                            status = h.Status
                        }).ToList()
                    },
                    model_type = modelType.ToLowerInvariant()
                };

                string endpoint = modelType.ToLowerInvariant() switch
                {
                    "sbergpt" or "gigachat" => "/agents/get_sbergpt_data_analysis",
                    "qwen_local" => "/agents/get_qwen_local_data_analysis",
                    _ => "/agents/get_deepseek_data_analysis"
                };

                var jsonContent = new StringContent(
                    JsonSerializer.Serialize(requestPayload),
                    Encoding.UTF8,
                    "application/json"
                );

                var response = await _httpClient.PostAsync(endpoint, jsonContent);
                if (response.IsSuccessStatusCode)
                {
                    var respStr = await response.Content.ReadAsStringAsync();
                    var respDoc = JsonSerializer.Deserialize<JsonElement>(respStr);
                    if (respDoc.TryGetProperty("trajectory", out var trajProp))
                    {
                        generatedTrajectories.Add(trajProp);
                    }
                    else
                    {
                        generatedTrajectories.Add(respDoc);
                    }
                }
            }

            var primaryResult = generatedTrajectories.FirstOrDefault();
            var combinedResult = new
            {
                batch_id = taskId,
                total_profiles_processed = generatedTrajectories.Count,
                trajectory = primaryResult,
                courses_analysis = generatedTrajectories
            };

            var finalResultElement = JsonSerializer.Deserialize<JsonElement>(JsonSerializer.Serialize(combinedResult));
            TaskTracker[taskId] = ("Completed", finalResultElement, null);

            if (report != null)
            {
                report.Status = "Completed";
                report.ResultJson = JsonSerializer.Serialize(combinedResult);
                await _dbContext.SaveChangesAsync();
            }

            _logger.LogInformation($"[Task {taskId}] Пакетная обработка {generatedTrajectories.Count} профилей успешно завершена.");
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
            if (Directory.Exists(tempDir))
            {
                try { Directory.Delete(tempDir, true); } catch { /* ignore */ }
            }
        }
    }
}