using System.Text;
using ApiCore.Models;
using System.Text.Json;
using System.IO.Compression;
using Microsoft.Extensions.Options;

namespace ApiCore.Services;

public class ValidationService
{
    private readonly string[] _allowedExtensions = { ".csv", ".json", ".xlsx", ".xls", ".zip" };
    private readonly UploadOptions _options;

    public ValidationService() : this(Options.Create(new UploadOptions()))
    {
    }

    public ValidationService(IOptions<UploadOptions> options)
    {
        _options = options.Value;
    }

    public ValidationResult ValidateFiles(List<string> filePaths)
    {
        var result = new ValidationResult();

        if (filePaths == null || filePaths.Count == 0)
        {
            result.AddError("Не передано ни одного файла для обработки.");
            return result;
        }

        if (filePaths.Count > _options.MaxFileCount)
        {
            result.AddError($"За один раз допускается загрузить не более {_options.MaxFileCount} файлов.");
            return result;
        }

        long totalBytes = 0;
        foreach (var path in filePaths)
        {
            var length = new FileInfo(path).Length;
            totalBytes += length;
            if (length > _options.MaxFileBytes)
            {
                result.AddError($"Файл '{Path.GetFileName(path)}' превышает допустимый размер {FormatMegabytes(_options.MaxFileBytes)} МБ.");
            }
        }
        if (totalBytes > _options.MaxRequestBytes)
        {
            result.AddError($"Общий размер файлов превышает допустимые {FormatMegabytes(_options.MaxRequestBytes)} МБ.");
        }

        if (!result.IsValid) return result;

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

    public ValidationResult ValidateEmployeeProfiles(List<EmployeeProfileDto> profiles, int maxProfiles = 15)
    {
        var result = new ValidationResult();
        if (profiles.Count == 0)
        {
            result.AddError("В файлах не найден ни один профиль сотрудника.");
            return result;
        }

        if (profiles.Count > maxProfiles)
        {
            result.AddError($"В одном пакете допускается не более {maxProfiles} профилей; найдено: {profiles.Count}.");
        }

        for (var index = 0; index < profiles.Count; index++)
        {
            var profile = profiles[index];
            var missing = new List<string>();
            if (string.IsNullOrWhiteSpace(profile.Fio)) missing.Add("ФИО");
            if (string.IsNullOrWhiteSpace(profile.Position)) missing.Add("должность");
            if (string.IsNullOrWhiteSpace(profile.Department)) missing.Add("ИОГВ");
            if (string.IsNullOrWhiteSpace(profile.CareerGoal)) missing.Add("цель обучения");

            if (missing.Count > 0)
            {
                result.AddError($"Профиль {index + 1}: отсутствуют обязательные поля — {string.Join(", ", missing)}.");
            }

            var learningHistory = profile.LearningHistory ?? new List<CourseHistoryItemDto>();
            for (var historyIndex = 0; historyIndex < learningHistory.Count; historyIndex++)
            {
                var item = learningHistory[historyIndex];
                if (string.IsNullOrWhiteSpace(item.CourseName))
                {
                    result.AddError($"Профиль {index + 1}, запись истории {historyIndex + 1}: отсутствует название программы.");
                }
                if (string.IsNullOrWhiteSpace(item.Status))
                {
                    result.AddError($"Профиль {index + 1}, запись истории {historyIndex + 1}: отсутствует статус прохождения.");
                }
            }
        }

        return result;
    }

    private void ValidateExtension(string filePath, string fileLabel, ValidationResult result)
    {
        var ext = Path.GetExtension(filePath).ToLowerInvariant();
        if (!_allowedExtensions.Contains(ext))
        {
            result.AddError($"{fileLabel} имеет недопустимое расширение '{ext}'. Допускаются форматы: .json, .xlsx, .xls, .csv, .zip");
        }
    }

    private void ValidateFileStructure(string filePath, ValidationResult result, string? displayName = null)
    {
        var fileName = displayName ?? Path.GetFileName(filePath);
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
                if (ext == ".xlsx")
                {
                    using var workbookArchive = ZipFile.OpenRead(filePath);
                    if (!ValidateArchiveLimits(workbookArchive, fileName, result)) return;
                }
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
            else if (ext == ".zip")
            {
                using var archive = ZipFile.OpenRead(filePath);
                var dataEntries = archive.Entries
                    .Where(entry => !string.IsNullOrWhiteSpace(entry.Name))
                    .ToList();

                if (dataEntries.Count == 0)
                {
                    result.AddError($"ZIP-архив '{fileName}' не содержит файлов данных.");
                    return;
                }

                if (!ValidateArchiveLimits(archive, fileName, result)) return;

                var unsupportedEntries = dataEntries
                    .Where(entry => !_allowedExtensions.Contains(Path.GetExtension(entry.Name).ToLowerInvariant()) || Path.GetExtension(entry.Name).Equals(".zip", StringComparison.OrdinalIgnoreCase))
                    .Select(entry => entry.FullName)
                    .ToList();

                if (unsupportedEntries.Count > 0)
                {
                    result.AddError($"ZIP-архив '{fileName}' содержит неподдерживаемые файлы: {string.Join(", ", unsupportedEntries)}. Внутри архива допустимы .xlsx, .xls, .csv и .json.");
                    return;
                }

                var validationRoot = Path.Combine(Path.GetTempPath(), $"iot-zip-validation-{Guid.NewGuid():N}");
                Directory.CreateDirectory(validationRoot);
                try
                {
                    for (var index = 0; index < dataEntries.Count; index++)
                    {
                        var entry = dataEntries[index];
                        var safeName = Path.GetFileName(entry.Name);
                        var extractedPath = Path.Combine(validationRoot, $"{index:D4}_{safeName}");
                        entry.ExtractToFile(extractedPath);
                        ValidateFileStructure(extractedPath, result, $"{fileName}:{entry.FullName}");
                    }
                }
                finally
                {
                    if (Directory.Exists(validationRoot)) Directory.Delete(validationRoot, recursive: true);
                }
            }
        }
        catch
        {
            result.AddError($"Не удалось проверить файл '{fileName}': файл поврежден или его содержимое не соответствует формату {ext}.");
        }
    }

    private bool ValidateArchiveLimits(ZipArchive archive, string fileName, ValidationResult result)
    {
        var entries = archive.Entries.Where(entry => !string.IsNullOrWhiteSpace(entry.Name)).ToList();
        if (entries.Count > _options.MaxArchiveEntries)
        {
            result.AddError($"Архив '{fileName}' содержит слишком много файлов: {entries.Count}; допускается не более {_options.MaxArchiveEntries}.");
            return false;
        }

        var uncompressedBytes = entries.Sum(entry => entry.Length);
        if (uncompressedBytes > _options.MaxArchiveUncompressedBytes)
        {
            result.AddError($"Распакованный размер архива '{fileName}' превышает допустимые {FormatMegabytes(_options.MaxArchiveUncompressedBytes)} МБ.");
            return false;
        }

        var compressedBytes = entries.Sum(entry => Math.Max(1L, entry.CompressedLength));
        if (entries.Count > 0 && (double)uncompressedBytes / compressedBytes > _options.MaxArchiveCompressionRatio)
        {
            result.AddError($"Архив '{fileName}' имеет небезопасно высокую степень сжатия.");
            return false;
        }

        return true;
    }

    private static long FormatMegabytes(long bytes) => Math.Max(1, bytes / (1024 * 1024));
}
