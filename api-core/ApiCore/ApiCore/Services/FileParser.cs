using ApiCore.Models;
using System.Text;
using ExcelDataReader;
using System.Text.RegularExpressions;
using System.Text.Json;

namespace ApiCore.Services;

public class FileParser
{
    private readonly IWebHostEnvironment _env;

    public FileParser(IWebHostEnvironment env)
    {
        _env = env;
    }

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
        var usersMap = new Dictionary<string, EmployeeProfileDto>();

        foreach (var path in filePaths)
        {
            var ext = Path.GetExtension(path).ToLowerInvariant();
            List<List<string>> rows;

            if (ext == ".xlsx" || ext == ".xls")
            {
                rows = ReadExcelRows(path);
            }
            else
            {
                rows = ReadCsvRows(path);
            }

            if (rows.Count < 2) continue;

            var headers = rows[0];
            int fioIdx = FindColumnIndex(headers, new[] { "фио", "пользователь", "служащий", "сотрудник", "имя" });
            int posIdx = FindColumnIndex(headers, new[] { "должность", "должност", "позиция", "роль" });
            int iogvIdx = FindColumnIndex(headers, new[] { "иогв", "ведомство", "орган", "администрация", "комитет", "организация" });
            int typeIdx = FindColumnIndex(headers, new[] { "тип", "вид", "ппк", "эк", "формат" });
            int courseIdx = FindColumnIndex(headers, new[] { "курс", "программа", "название", "наименование" });
            int statusIdx = FindColumnIndex(headers, new[] { "статус", "результат", "состояние", "итог" });

            if (courseIdx == -1 && headers.Count >= 5)
            {
                // Позиционная привязка по умолчанию для выгрузки ГГС: 0:ФИО, 1:Должность, 2:ИОГВ, 3:Тип, 4:Курс, 5:Статус
                fioIdx = 0;
                posIdx = 1;
                iogvIdx = 2;
                typeIdx = 3;
                courseIdx = 4;
                statusIdx = 5;
            }

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

                if (string.IsNullOrWhiteSpace(cType)) cType = "ППК";
                if (string.IsNullOrWhiteSpace(status)) status = "Пройден";

                if (!usersMap.TryGetValue(fio, out var emp))
                {
                    emp = new EmployeeProfileDto
                    {
                        Fio = fio,
                        Position = string.IsNullOrWhiteSpace(pos) ? "Специалист" : pos,
                        Department = string.IsNullOrWhiteSpace(iogv) ? "ИОГВ Санкт-Петербурга" : iogv,
                        ExperienceYears = 3,
                        CareerGoal = "Развитие ключевых компетенций и повышение эффективности",
                        LearningHistory = new List<CourseHistoryItemDto>()
                    };
                    usersMap[fio] = emp;
                }

                if (!string.IsNullOrWhiteSpace(cName))
                {
                    emp.LearningHistory.Add(new CourseHistoryItemDto
                    {
                        CourseName = cName,
                        CourseType = cType.ToUpperInvariant().Contains("ЭК") ? "ЭК" : "ППК",
                        Status = status
                    });
                }
            }
        }

        return usersMap.Values.ToList();
    }

    public List<CourseCatalogItemDto> ParseCatalogFiles(List<string> filePaths)
    {
        var catalog = new List<CourseCatalogItemDto>();
        int idCounter = 1;

        foreach (var path in filePaths)
        {
            var ext = Path.GetExtension(path).ToLowerInvariant();
            List<List<string>> rows;

            if (ext == ".xlsx" || ext == ".xls")
            {
                rows = ReadExcelRows(path);
            }
            else
            {
                rows = ReadCsvRows(path);
            }

            if (rows.Count < 2) continue;

            var headers = rows[0];
            int nameIdx = FindColumnIndex(headers, new[] { "название", "наименование", "курс", "программа" });
            int annotIdx = FindColumnIndex(headers, new[] { "аннотация", "описание", "содержание" });
            int targetIdx = FindColumnIndex(headers, new[] { "цель", "задачи", "цели" });
            int resultsIdx = FindColumnIndex(headers, new[] { "результаты", "знать", "уметь", "владеть", "компетенции" });

            if (nameIdx == -1) nameIdx = 0;
            if (annotIdx == -1 && headers.Count > 1) annotIdx = 1;
            if (targetIdx == -1 && headers.Count > 2) targetIdx = 2;
            if (resultsIdx == -1 && headers.Count > 3) resultsIdx = 3;

            for (int r = 1; r < rows.Count; r++)
            {
                var row = rows[r];
                if (row.Count == 0 || row.All(string.IsNullOrWhiteSpace)) continue;

                string name = GetValueSafely(row, nameIdx);
                if (string.IsNullOrWhiteSpace(name)) continue;

                string annot = GetValueSafely(row, annotIdx);
                string target = GetValueSafely(row, targetIdx);
                string results = GetValueSafely(row, resultsIdx);

                var comps = ExtractCompetenciesFromName(name);

                catalog.Add(new CourseCatalogItemDto
                {
                    Id = $"CRS_{idCounter++:03d}",
                    Name = name,
                    Type = name.Contains("электрон", StringComparison.OrdinalIgnoreCase) || annot.Contains("электрон", StringComparison.OrdinalIgnoreCase) ? "ЭК" : "ППК",
                    Category = "Программа обучения",
                    Annotation = annot,
                    Target = target,
                    Results = results,
                    DurationHours = 16,
                    Competencies = comps
                });
            }
        }

        return catalog;
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
            using var doc = JsonDocument.Parse(File.ReadAllText(dataPath, Encoding.UTF8));
            if (doc.RootElement.TryGetProperty("users", out var usersEl))
            {
                var usersList = new List<EmployeeProfileDto>();
                foreach (var u in usersEl.EnumerateArray())
                {
                    var emp = new EmployeeProfileDto
                    {
                        Fio = u.GetProperty("fio").GetString() ?? "Служащий",
                        Position = u.GetProperty("position").GetString() ?? "Специалист",
                        Department = u.GetProperty("department").GetString() ?? "ИОГВ",
                        ExperienceYears = 3,
                        CareerGoal = "Развитие служебных навыков"
                    };
                    if (u.TryGetProperty("courses", out var coursesEl))
                    {
                        foreach (var c in coursesEl.EnumerateArray())
                        {
                            emp.LearningHistory.Add(new CourseHistoryItemDto
                            {
                                CourseName = c.GetProperty("course_name").GetString() ?? "",
                                CourseType = c.GetProperty("course_type").GetString() ?? "ППК",
                                Status = c.GetProperty("status").GetString() ?? "Пройден"
                            });
                        }
                    }
                    usersList.Add(emp);
                }
                return usersList;
            }
        }
        return new List<EmployeeProfileDto>();
    }

    public CourseBatchAnalysisRequest ParseToBatchRequest(List<string> filePaths)
    {
        var users = ParseHistoryFiles(filePaths);
        var req = new CourseBatchAnalysisRequest
        {
            BatchId = Guid.NewGuid().ToString()
        };

        if (users.Any())
        {
            req.Employee = users.First();
        }

        return req;
    }

    private static List<string> ExtractCompetenciesFromName(string name)
    {
        var comps = new List<string>();
        var nameLower = name.ToLowerInvariant();

        if (nameLower.Contains("данн") || nameLower.Contains("цифр") || nameLower.Contains("ии") || nameLower.Contains("информ"))
            comps.Add("Управление на основе данных");
        if (nameLower.Contains("проект") || nameLower.Contains("процесс") || nameLower.Contains("менеджмент"))
            comps.Add("Проектное управление");
        if (nameLower.Contains("коррупц") || nameLower.Contains("закон") || nameLower.Contains("прав") || nameLower.Contains("обращен"))
            comps.Add("Нормативная грамотность");
        if (nameLower.Contains("коммуникац") || nameLower.Contains("язык") || nameLower.Contains("переговор") || nameLower.Contains("клиент"))
            comps.Add("Деловые коммуникации и клиентоцентричность");

        if (!comps.Any())
            comps.Add("Профессиональные навыки");

        return comps;
    }

    private static List<List<string>> ReadCsvRows(string filePath)
    {
        var rows = new List<List<string>>();
        using var stream = File.OpenRead(filePath);
        var encoding = DetectEncoding(stream);
        using var reader = new StreamReader(stream, encoding);

        string? line;
        char delimiter = ',';
        bool isFirst = true;
        while ((line = reader.ReadLine()) != null)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            if (isFirst)
            {
                delimiter = line.Contains(';') ? ';' : ',';
                isFirst = false;
            }
            rows.Add(ParseCsvLine(line, delimiter));
        }
        return rows;
    }

    private static string GetValueSafely(List<string> row, int index)
    {
        if (index >= 0 && index < row.Count)
        {
            return AnonymizeText(row[index]);
        }
        return string.Empty;
    }

    private static string AnonymizeText(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        var text = input.Trim();

        // Очистка персональных данных в соответствии с требованиями безопасности
        text = Regex.Replace(text, @"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", "[email]");
        text = Regex.Replace(text, @"(?:\+7|8)[\s\-\(\)]*\d{3}[\s\-\(\)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}", "[телефон]");
        text = Regex.Replace(text, @"\b\d{3}[\s\-]?\d{3}[\s\-]?\d{3}[\s\-]?\d{2}\b", "[СНИЛС]");
        text = Regex.Replace(text, @"\b\d{4}\s?\d{6}\b", "[паспорт]");

        return text;
    }

    private static int FindColumnIndex(List<string> headers, string[] keywords, int startIdx = 0)
    {
        if (startIdx < 0) startIdx = 0;
        for (int i = startIdx; i < headers.Count; i++)
        {
            var header = headers[i].ToLowerInvariant();
            if (keywords.Any(k => header.Contains(k)))
            {
                return i;
            }
        }
        return -1;
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

    private static Encoding DetectEncoding(Stream stream)
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

        return Encoding.UTF8;
    }

    public static string ExtractCourseName(string fileName)
    {
        string nameWithoutExt = Path.GetFileNameWithoutExtension(fileName);
        return nameWithoutExt.Replace('_', ' ').Trim();
    }
}