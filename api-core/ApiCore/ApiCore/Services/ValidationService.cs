using System.Text;
using ApiCore.Models;
using System.Text.Json;

namespace ApiCore.Services;

public class ValidationService
{
    private readonly string[] _allowedExtensions = { ".csv", ".json", ".xlsx", ".xls", ".zip" };

    public ValidationResult ValidateFiles(List<string> filePaths)
    {
        var result = new ValidationResult();

        if (filePaths == null || filePaths.Count == 0)
        {
            result.AddError("Не передано ни одного файла для обработки.");
            return result;
        }

        // 1. Проверка расширений файлов
        foreach (var path in filePaths)
        {
            ValidateExtension(path, $"Файл '{Path.GetFileName(path)}'", result);
        }

        if (!result.IsValid) return result;

        // 2. Валидация структуры файлов
        foreach (var path in filePaths)
        {
            ValidateFileStructure(path, result);
        }

        return result;
    }

    private void ValidateExtension(string filePath, string fileLabel, ValidationResult result)
    {
        var ext = Path.GetExtension(filePath).ToLowerInvariant();
        if (!_allowedExtensions.Contains(ext))
        {
            result.AddError($"{fileLabel} имеет недопустимое расширение '{ext}'. Допускаются форматы: .xlsx, .csv, .json, .zip");
        }
    }

    private void ValidateFileStructure(string filePath, ValidationResult result)
    {
        var fileName = Path.GetFileName(filePath);
        var ext = Path.GetExtension(filePath).ToLowerInvariant();

        try
        {
            if (ext == ".json")
            {
                var content = File.ReadAllText(filePath, Encoding.UTF8);
                if (string.IsNullOrWhiteSpace(content))
                {
                    result.AddError($"JSON-файл '{fileName}' пуст.");
                    return;
                }

                using var doc = JsonDocument.Parse(content);
                var root = doc.RootElement;

                // Проверяем валидность JSON структуры (профиль ГГС, массив пользователей или каталог)
                bool isProfile = root.ValueKind == JsonValueKind.Object && (root.TryGetProperty("employee", out _) || root.TryGetProperty("fio", out _) || root.TryGetProperty("position", out _));
                bool isUsersList = root.ValueKind == JsonValueKind.Array || (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("users", out _));
                bool isCatalog = root.ValueKind == JsonValueKind.Array || (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("courses", out _));

                if (!isProfile && !isUsersList && !isCatalog)
                {
                    result.AddError($"JSON-файл '{fileName}' не содержит обязательных полей профиля ГГС ('employee' / 'fio' / 'position'), реестра истории ('users') или каталога курсов.");
                }
            }
            else if (ext == ".xlsx" || ext == ".xls")
            {
                var rows = FileParser.ReadExcelRows(filePath);
                if (rows.Count < 2)
                {
                    result.AddError($"Таблица '{fileName}' пуста или содержит только строку заголовков.");
                    return;
                }

                var headers = string.Join(" ", rows[0]).ToLowerInvariant();
                bool isHistory = headers.Contains("фио") || headers.Contains("должност") || headers.Contains("курс") || headers.Contains("статус") || headers.Contains("пользователь");
                bool isCatalog = headers.Contains("назван") || headers.Contains("аннотац") || headers.Contains("цел") || headers.Contains("результат");

                if (!isHistory && !isCatalog && rows[0].Count < 3)
                {
                    result.AddError($"В файле '{fileName}' не обнаружены стандартные заголовки реестра истории обучения (ФИО, Должность, Курс, Статус) или каталога программ (Название, Аннотация, Цель, Результаты).");
                }
            }
            else if (ext == ".csv")
            {
                var lines = File.ReadAllLines(filePath, Encoding.UTF8);
                if (lines.Length < 2)
                {
                    result.AddError($"CSV-файл '{fileName}' пуст или содержит недостаточно строк.");
                    return;
                }

                var headers = lines[0].ToLowerInvariant();
                bool isHistory = headers.Contains("фио") || headers.Contains("должност") || headers.Contains("курс") || headers.Contains("статус") || headers.Contains("пользователь");
                bool isCatalog = headers.Contains("назван") || headers.Contains("аннотац") || headers.Contains("цел") || headers.Contains("результат");

                if (!isHistory && !isCatalog)
                {
                    result.AddError($"В CSV-файле '{fileName}' не обнаружены обязательные колонки профиля/истории или каталога программ.");
                }
            }
        }
        catch (Exception ex)
        {
            result.AddError($"Ошибка при проверке файла '{fileName}': {ex.Message}");
        }
    }
}