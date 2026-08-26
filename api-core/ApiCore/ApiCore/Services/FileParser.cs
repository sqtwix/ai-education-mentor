using ApiCore.Models;
using System.Text;
using ExcelDataReader;
using System.Text.RegularExpressions;
using System.Text.Json;
using System.IO.Compression;

namespace ApiCore.Services;

public class FileParser
{
    public static List<List<string>> ReadExcelRows(string filePath)
    {
        System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
        var rows = new List<List<string>>();
        using var stream = File.Open(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        using var reader = ExcelReaderFactory.CreateReader(stream);
        while (reader.Read())
        {
            var row = new List<string>();
            for (int i = 0; i < reader.FieldCount; i++)
            {
                var val = reader.GetValue(i);
                row.Add(val?.ToString() ?? "");
            }
            rows.Add(row);
        }
        return rows;
    }

    public List<EmployeeProfileDto> ParseHistoryFiles(List<string> filePaths)
    {
        var usersMap = new Dictionary<string, EmployeeProfileDto>(StringComparer.OrdinalIgnoreCase);
        var flattenedPaths = new List<string>();
        var extractionDirectories = new List<string>();

        try
        {
            // ValidateFiles already checks archive entries and content before parsing.
            foreach (var path in filePaths)
            {
                var ext = Path.GetExtension(path).ToLowerInvariant();
                if (ext == ".zip")
                {
                    var extractDir = Path.Combine(Path.GetDirectoryName(path)!, "unzipped_" + Guid.NewGuid().ToString("N"));
                    Directory.CreateDirectory(extractDir);
                    ZipFile.ExtractToDirectory(path, extractDir);
                    extractionDirectories.Add(extractDir);
                    flattenedPaths.AddRange(Directory.GetFiles(extractDir, "*.*", SearchOption.AllDirectories));
                }
                else
                {
                    flattenedPaths.Add(path);
                }
            }

            foreach (var path in flattenedPaths)
            {
                ParseFile(path, usersMap);
            }

            return usersMap.Values.ToList();
        }
        finally
        {
            foreach (var directory in extractionDirectories)
            {
                if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
            }
        }
    }

    private static void ParseFile(string path, Dictionary<string, EmployeeProfileDto> usersMap)
    {
        var ext = Path.GetExtension(path).ToLowerInvariant();

        if (ext == ".json")
        {
            var json = File.ReadAllText(path, Encoding.UTF8);
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;

            if (root.ValueKind == JsonValueKind.Array)
            {
                var profiles = JsonSerializer.Deserialize<List<EmployeeProfileDto>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (profiles != null)
                {
                    foreach (var p in profiles)
                    {
                        if (!string.IsNullOrWhiteSpace(p.Fio)) usersMap[p.Fio] = p;
                    }
                }
            }
            else if (root.ValueKind == JsonValueKind.Object)
            {
                if (root.TryGetProperty("users", out var usersProp))
                {
                    var profiles = JsonSerializer.Deserialize<List<EmployeeProfileDto>>(usersProp.GetRawText(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (profiles != null)
                    {
                        foreach (var p in profiles)
                        {
                            if (!string.IsNullOrWhiteSpace(p.Fio)) usersMap[p.Fio] = p;
                        }
                    }
                }
                else if (root.TryGetProperty("employee", out var empProp))
                {
                    var profile = JsonSerializer.Deserialize<EmployeeProfileDto>(empProp.GetRawText(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (profile != null && !string.IsNullOrWhiteSpace(profile.Fio)) usersMap[profile.Fio] = profile;
                }
                else
                {
                    var profile = JsonSerializer.Deserialize<EmployeeProfileDto>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                    if (profile != null && !string.IsNullOrWhiteSpace(profile.Fio)) usersMap[profile.Fio] = profile;
                }
            }
            return;
        }

        List<List<string>> rows;
        if (ext == ".xlsx" || ext == ".xls") rows = ReadExcelRows(path);
        else if (ext == ".csv") rows = ReadCsvRows(path);
        else return;

        if (rows.Count < 2) return;

            var headers = rows[0];
            int fioIdx = FindColumnIndex(headers, new[] { "фио", "ф и о", "фамилия имя отчество", "пользователь", "служащий", "сотрудник", "имя сотрудника" });
            int posIdx = FindColumnIndex(headers, new[] { "должность", "наименование должности", "должность сотрудника", "позиция", "роль сотрудника" });
            int iogvIdx = FindColumnIndex(headers, new[] { "иогв", "наименование иогв", "ведомство", "орган власти", "организация", "подразделение" });
            int typeIdx = FindColumnIndex(headers, new[] { "тип", "тип программы", "тип курса", "вид", "вид программы", "формат", "формат обучения", "ппк эк" });
            int courseIdx = FindColumnIndex(headers, new[] { "курс", "программа", "название курса", "название программы", "наименование курса", "наименование программы" });
            int statusIdx = FindColumnIndex(headers, new[] { "статус", "статус курса", "статус программы", "статус прохождения", "результат прохождения", "состояние обучения", "итог обучения" });
            int experienceIdx = FindColumnIndex(headers, new[] { "стаж", "стаж лет", "experience years", "опыт", "опыт лет" });
            int goalIdx = FindColumnIndex(headers, new[] { "цель обучения", "карьерная цель", "целевой вектор", "career goal" });

        for (int r = 1; r < rows.Count; r++)
            {
                var row = rows[r];
                if (row.Count == 0 || row.All(string.IsNullOrWhiteSpace)) continue;

                string fio = GetValueSafely(row, fioIdx);
                if (string.IsNullOrWhiteSpace(fio)) continue;

                string pos = GetValueSafely(row, posIdx);
                string iogv = GetValueSafely(row, iogvIdx);
                string cType = GetValueSafely(row, typeIdx);
                string cName = GetValueSafely(row, courseIdx);
                string status = GetValueSafely(row, statusIdx);
                string experienceText = GetValueSafely(row, experienceIdx);
                string careerGoal = GetValueSafely(row, goalIdx);
                _ = int.TryParse(experienceText, out var experienceYears);

                if (!usersMap.TryGetValue(fio, out var emp))
                {
                    emp = new EmployeeProfileDto
                    {
                        Fio = fio,
                        Position = pos,
                        Department = iogv,
                        ExperienceYears = experienceYears,
                        CareerGoal = careerGoal,
                        LearningHistory = new List<CourseHistoryItemDto>()
                    };
                    usersMap[fio] = emp;
                }
                else
                {
                    if (string.IsNullOrWhiteSpace(emp.Position)) emp.Position = pos;
                    if (string.IsNullOrWhiteSpace(emp.Department)) emp.Department = iogv;
                    if (emp.ExperienceYears == 0 && experienceYears > 0) emp.ExperienceYears = experienceYears;
                    if (string.IsNullOrWhiteSpace(emp.CareerGoal)) emp.CareerGoal = careerGoal;
                }

                if (!string.IsNullOrWhiteSpace(cName))
                {
                    emp.LearningHistory.Add(new CourseHistoryItemDto
                    {
                        CourseName = cName,
                        CourseType = cType,
                        Status = status
                    });
                }
        }
    }

    public List<CourseCatalogItemDto> GetDefaultCatalog()
    {
        var dataPath = Path.Combine(Directory.GetCurrentDirectory(), "Data", "courses_catalog.json");
        if (File.Exists(dataPath))
        {
            var json = File.ReadAllText(dataPath, Encoding.UTF8);
            return JsonSerializer.Deserialize<List<CourseCatalogItemDto>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new();
        }
        return new List<CourseCatalogItemDto>();
    }

    public List<EmployeeProfileDto> GetDefaultUsersHistory()
    {
        var dataPath = Path.Combine(Directory.GetCurrentDirectory(), "Data", "learning_history_dataset.json");
        if (File.Exists(dataPath))
        {
            var json = File.ReadAllText(dataPath, Encoding.UTF8);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("users", out var usersProp))
            {
                return JsonSerializer.Deserialize<List<EmployeeProfileDto>>(usersProp.GetRawText(), new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new();
            }
        }
        return new List<EmployeeProfileDto>();
    }

    public Dictionary<string, object> GetDefaultBenchmarks()
    {
        var dataPath = Path.Combine(Directory.GetCurrentDirectory(), "Data", "learning_history_dataset.json");
        if (File.Exists(dataPath))
        {
            var json = File.ReadAllText(dataPath, Encoding.UTF8);
            using var doc = JsonDocument.Parse(json);
            var result = new Dictionary<string, object>();
            if (doc.RootElement.TryGetProperty("benchmarks_by_position", out var bp))
            {
                result["benchmarks_by_position"] = JsonSerializer.Deserialize<Dictionary<string, object>>(bp.GetRawText()) ?? new();
            }
            if (doc.RootElement.TryGetProperty("benchmarks_by_position_and_dept", out var bpd))
            {
                result["benchmarks_by_position_and_dept"] = JsonSerializer.Deserialize<Dictionary<string, object>>(bpd.GetRawText()) ?? new();
            }
            return result;
        }
        return new Dictionary<string, object>();
    }

    private static List<List<string>> ReadCsvRows(string filePath)
    {
        var rows = new List<List<string>>();
        var lines = File.ReadAllLines(filePath, Encoding.UTF8);
        if (lines.Length == 0) return rows;

        char delimiter = lines[0].Contains(';') ? ';' : ',';

        foreach (var line in lines)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var parts = ParseCsvLine(line, delimiter);
            rows.Add(parts);
        }

        return rows;
    }

    private static List<string> ParseCsvLine(string line, char delimiter)
    {
        var result = new List<string>();
        bool inQuotes = false;
        var current = new StringBuilder();

        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (c == '\"')
            {
                inQuotes = !inQuotes;
            }
            else if (c == delimiter && !inQuotes)
            {
                result.Add(current.ToString().Trim('\"', ' '));
                current.Clear();
            }
            else
            {
                current.Append(c);
            }
        }

        result.Add(current.ToString().Trim('\"', ' '));
        return result;
    }

    private static int FindColumnIndex(List<string> headers, string[] keywords)
    {
        var normalizedKeywords = keywords.Select(NormalizeHeader).ToHashSet(StringComparer.Ordinal);
        for (int i = 0; i < headers.Count; i++)
        {
            if (normalizedKeywords.Contains(NormalizeHeader(headers[i])))
            {
                return i;
            }
        }
        return -1;
    }

    private static string NormalizeHeader(string value)
    {
        var normalized = Regex.Replace(value.Trim().ToLowerInvariant(), @"[^\p{L}\p{Nd}]+", " ");
        return Regex.Replace(normalized, @"\s+", " ").Trim();
    }

    private static string GetValueSafely(List<string> row, int index)
    {
        if (index >= 0 && index < row.Count)
        {
            return row[index]?.Trim() ?? "";
        }
        return "";
    }

    public static string ExtractCourseName(string fileName)
    {
        var clean = Path.GetFileNameWithoutExtension(fileName);
        clean = Regex.Replace(clean, @"^\d{2}\.\d{2}-\d{2}\.\d{2}\s*", "");
        return string.IsNullOrWhiteSpace(clean) ? "Индивидуальная траектория обучения" : clean;
    }

    public static string AnonymizePii(string text)
    {
        if (string.IsNullOrEmpty(text)) return text;

        // Email
        text = Regex.Replace(text, @"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", "user_***@***.ru");
        // Phone
        text = Regex.Replace(text, @"(\+7|8)[\s\-]??\(?\d{3}\)?[\s\-]??\d{3}[\s\-]??\d{2}[\s\-]??\d{2}", "+7 (***) ***-**-**");
        // SNILS
        text = Regex.Replace(text, @"\b\d{3}-\d{3}-\d{3}\s\d{2}\b", "***-***-*** **");
        // Passport
        text = Regex.Replace(text, @"\b\d{4}\s\d{6}\b", "**** ******");

        return text;
    }
}
