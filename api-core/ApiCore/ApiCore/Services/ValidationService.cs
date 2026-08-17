using System.Text;
using ApiCore.Models;

namespace ApiCore.Services;

public class ValidationService
{
    private readonly string[] _allowedExtensions = { ".csv", ".json", ".xlsx", ".xls" };

    private readonly string[][] _requiredKeywordGroups = 
    {
        new[] { "должность", "должност", "категори", "роль" },
        new[] { "полезность", "полезн" },
        new[] { "практико", "практич", "практическая" },
        new[] { "доступность", "доступн" },
        new[] { "отстраненность", "отстранен", "вовлеченность", "вовлечен" },
        new[] { "формат" },
        new[] { "взаимодействие", "взаимодействи", "куратор", "команд" }
    };

    public ValidationResult ValidateFiles(List<string> userResponsePaths)
    {
        var result = new ValidationResult();

        // 1. Проверка расширений файлов
        foreach (var path in userResponsePaths)
        {
            ValidateExtension(path, $"Файл опроса '{Path.GetFileName(path)}'", result);
        }

        if (!result.IsValid) return result; // Если расширения битые, дальше проверять нет смысла

        // 2. Валидация структуры файлов с ответами студентов
        foreach (var path in userResponsePaths)
        {
            ValidateSurveyStructure(path, result);
        }

        return result;
    }

    private void ValidateExtension(string filePath, string fileLabel, ValidationResult result)
    {
        var ext = Path.GetExtension(filePath).ToLowerSuffix();
        if (!_allowedExtensions.Contains(ext))
        {
            result.AddError($"{fileLabel} имеет недопустимое расширение '{ext}'. Допускаются только: .csv, .xlsx, .xls");
        }
    }

    private void ValidateSurveyStructure(string filePath, ValidationResult result)
    {
        var fileName = Path.GetFileName(filePath);
        var ext = Path.GetExtension(filePath).ToLowerSuffix();

        List<string> headers = new();

        try
        {
            if (ext == ".xlsx" || ext == ".xls")
            {
                var rows = FileParser.ReadExcelRows(filePath);
                if (rows.Count < 2)
                {
                    result.AddError($"Файл опроса '{fileName}' пуст или содержит недостаточно строк.");
                    return;
                }
                headers = rows[0];
            }
            else
            {
                using var stream = File.OpenRead(filePath);
                var encoding = GetEncoding(stream);
                using var reader = new StreamReader(stream, encoding);

                var headerLine = reader.ReadLine();
                if (string.IsNullOrWhiteSpace(headerLine))
                {
                    result.AddError($"Файл опроса '{fileName}' пуст.");
                    return;
                }

                char delimiter = headerLine.Contains(';') ? ';' : ',';
                headers = ParseCsvLine(headerLine, delimiter);
            }

            // Проверяем наличие ключевых слов во всех заголовках вместе
            var combinedHeaders = string.Join(" ", headers).ToLowerInvariant();

            foreach (var group in _requiredKeywordGroups)
            {
                if (!group.Any(k => combinedHeaders.Contains(k)))
                {
                    result.AddError($"В файле '{fileName}' не найдена колонка, отвечающая теме '{group[0]}'.");
                }
            }
        }
        catch (Exception ex)
        {
            result.AddError($"Не удалось прочитать файл опроса '{fileName}': {ex.Message}");
        }
    }

    private static List<string> ParseCsvLine(string line, char delimiter = ',')
    {
        var result = new List<string>();
        var currentField = new StringBuilder();
        bool inQuotes = false;

        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    currentField.Append('"');
                    i++;
                }
                else
                {
                    inQuotes = !inQuotes;
                }
            }
            else if (c == delimiter && !inQuotes)
            {
                result.Add(currentField.ToString().Trim());
                currentField.Clear();
            }
            else
            {
                currentField.Append(c);
            }
        }
        result.Add(currentField.ToString().Trim());
        return result;
    }

    private Encoding GetEncoding(Stream stream)
    {
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        var cp1251 = System.Text.Encoding.GetEncoding(1251);

        byte[] buffer = new byte[1024];
        int bytesRead = stream.Read(buffer, 0, buffer.Length);
        if (stream.CanSeek) stream.Position = 0;

        string utf8String = Encoding.UTF8.GetString(buffer, 0, bytesRead);
        if (utf8String.Contains("\uFFFD"))
        {
            return cp1251;
        }

        string cp1251String = cp1251.GetString(buffer, 0, bytesRead);
        if (cp1251String.Contains("должность") || cp1251String.Contains("полезность") || cp1251String.Contains("формат") || cp1251String.Contains("практико"))
        {
            return cp1251;
        }

        return Encoding.UTF8;
    }
}

public static class StringExtensions
{
    public static string ToLowerSuffix(this string? value) => value?.ToLowerInvariant() ?? string.Empty;
}