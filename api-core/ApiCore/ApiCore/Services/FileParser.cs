using ApiCore.Models;
using System.Text;
using ExcelDataReader;
using System.Text.RegularExpressions;

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

    public CourseBatchAnalysisRequest ParseToBatchRequest(List<string> surveyPaths)
    {
        var batchRequest = new CourseBatchAnalysisRequest
        {
            BatchId = Guid.NewGuid().ToString()
        };

        foreach (var path in surveyPaths)
        {
            var courseSurvey = ParseSurveyFile(path);
            if (courseSurvey != null)
            {
                batchRequest.Courses.Add(courseSurvey);
            }
        }

        return batchRequest;
    }

    private CourseSurveyDto? ParseSurveyFile(string filePath)
    {
        var ext = Path.GetExtension(filePath).ToLowerSuffix();
        List<List<string>> rows;

        if (ext == ".xlsx" || ext == ".xls")
        {
            rows = ReadExcelRows(filePath);
        }
        else
        {
            rows = new List<List<string>>();
            using var stream = File.OpenRead(filePath);
            var encoding = GetEncoding(stream);
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
        }

        if (rows.Count < 2) return null;

        var headers = rows[0];

        // Динамическое сопоставление колонок
        int posCategoryIdx = FindColumnIndex(headers, new[] { "должность", "категори", "должност", "роль" });
        int motivationIdx = FindColumnIndex(headers, new[] { "почему вы решили", "решили пройти", "почему решили", "мотивация" });
        
        int usefulnessScoreIdx = FindColumnIndex(headers, new[] { "полезность программы", "полезность по 10", "программа полезна", "полезность", "полезн" });
        int usefulnessCommentIdx = FindColumnIndex(headers, new[] { "наиболее актуальны", "актуальны и почему", "актуальн" });
        int appliedSkillsIdx = FindColumnIndex(headers, new[] { "сможете применить", "применить в своей", "примен" });
        
        int expectedEffectIdx = FindColumnIndex(headers, new[] { "эффект от обучения", "ожидаемый эффект", "эффект" });
        int expectedEffectReasonIdx = FindColumnIndex(headers, new[] { "почему", "причины" }, expectedEffectIdx + 1);
        
        int topicsExcludeIdx = FindColumnIndex(headers, new[] { "исключить" });
        int topicsAddIdx = FindColumnIndex(headers, new[] { "дополнить" });
        
        int practicalityScoreIdx = FindColumnIndex(headers, new[] { "практическую часть", "практико-ориентированность", "практичность", "практическая", "практик" });
        int practicalityCommentIdx = FindColumnIndex(headers, new[] { "достаточно ли практических" });
        int practiceTuningIdx = FindColumnIndex(headers, new[] { "требуют большей практической" });
        int practiceChangeIdx = FindColumnIndex(headers, new[] { "изменить в организации" });
        
        int accessibilityScoreIdx = FindColumnIndex(headers, new[] { "доступность материала", "доступность изложения", "доступность", "доступност" });
        int accessibilityCommentIdx = FindColumnIndex(headers, new[] { "последовательность тем", "логика изложения", "последовательн" });
        int logicSequenceReasonIdx = FindColumnIndex(headers, new[] { "в чем это заключается" }, accessibilityCommentIdx + 1);
        
        int askQuestionsIdx = FindColumnIndex(headers, new[] { "задать интересующие", "задать вопросы", "вопросы" });
        int askQuestionsReasonIdx = FindColumnIndex(headers, new[] { "подробнее" }, askQuestionsIdx + 1);
        
        int isDetachedIdx = FindColumnIndex(headers, new[] { "отстраненность от процесса", "отстраненность", "отстранен", "вовлеченность", "вовлечен" });
        int detachmentReasonIdx = FindColumnIndex(headers, new[] { "обучения они возникали", "моменты обучения" });
        int involvementIdx = FindColumnIndex(headers, new[] { "повысить вашу вовлеченность", "вовлеченность в обучение" });
        
        int formatIdx = FindColumnIndex(headers, new[] { "формат обучения", "формат" });
        int interactionScoreIdx = FindColumnIndex(headers, new[] { "взаимодействие по 10", "взаимодействие с командой", "взаимодействие", "взаимодействи" });
        int interactionCommentIdx = FindColumnIndex(headers, new[] { "прокомментируйте", "комментарий" }, interactionScoreIdx + 1);

        // Извлечение имени и периода курса из названия файла
        string fileName = Path.GetFileNameWithoutExtension(filePath);
        string period = "";
        string courseName = fileName;

        // Поиск паттерна даты: например "28.05-10.06" или "28.05-10.06.2026"
        var periodMatch = Regex.Match(fileName, @"^\d{2}\.\d{2}-\d{2}\.\d{2}(\.\d{4})?");
        if (periodMatch.Success)
        {
            period = periodMatch.Value;
            courseName = fileName.Substring(period.Length).Trim(' ', '_', '-');
        }

        // Дополнительная чистка названия курса
        courseName = Regex.Replace(courseName, @"_\d+_(ДОТ|очно|дист)", "", RegexOptions.IgnoreCase).Trim();
        courseName = courseName.Replace("Вопросы функционирования контрактной системы_40_ДОТ", "Вопросы функционирования контрактной системы").Trim();

        var courseSurvey = new CourseSurveyDto
        {
            CourseName = courseName,
            Period = string.IsNullOrEmpty(period) ? "Не указан" : period,
            StudentsCount = 0
        };

        int studentCounter = 1;
        for (int r = 1; r < rows.Count; r++)
        {
            var fields = rows[r];
            if (fields.Count == 0 || fields.All(string.IsNullOrWhiteSpace)) continue;

            // Если колонка с должностью пуста и все остальные пусты, пропускаем
            string pos = GetValueSafely(fields, posCategoryIdx);
            if (string.IsNullOrWhiteSpace(pos) && fields.Count > usefulnessScoreIdx && string.IsNullOrWhiteSpace(GetValueSafely(fields, usefulnessScoreIdx)))
                continue;

            var response = new SurveyResponseDto
            {
                StudentId = $"student_{studentCounter++}",
                PositionCategory = pos,
                MotivationComment = GetValueSafely(fields, motivationIdx),
                UsefulnessScore = ParseScore(GetValueSafely(fields, usefulnessScoreIdx)),
                UsefulnessComment = GetValueSafely(fields, usefulnessCommentIdx),
                AppliedSkillsComment = GetValueSafely(fields, appliedSkillsIdx),
                ExpectedEffect = GetValueSafely(fields, expectedEffectIdx),
                ExpectedEffectReason = GetValueSafely(fields, expectedEffectReasonIdx),
                TopicsToExcludeComment = GetValueSafely(fields, topicsExcludeIdx),
                TopicsToAddComment = GetValueSafely(fields, topicsAddIdx),
                PracticalityScore = ParseScore(GetValueSafely(fields, practicalityScoreIdx)),
                PracticalityComment = GetValueSafely(fields, practicalityCommentIdx),
                PracticeTuningComment = GetValueSafely(fields, practiceTuningIdx),
                PracticeChangeComment = GetValueSafely(fields, practiceChangeIdx),
                AccessibilityScore = ParseScore(GetValueSafely(fields, accessibilityScoreIdx)),
                AccessibilityComment = GetValueSafely(fields, accessibilityCommentIdx),
                LogicSequenceReason = GetValueSafely(fields, logicSequenceReasonIdx),
                AskQuestionsComment = GetValueSafely(fields, askQuestionsIdx),
                AskQuestionsReason = GetValueSafely(fields, askQuestionsReasonIdx),
                IsDetached = ParseIsDetached(GetValueSafely(fields, isDetachedIdx)),
                DetachmentReasonComment = GetValueSafely(fields, detachmentReasonIdx),
                InvolvementComment = GetValueSafely(fields, involvementIdx),
                PreferredFormat = GetValueSafely(fields, formatIdx),
                InteractionScore = ParseScore(GetValueSafely(fields, interactionScoreIdx)),
                InteractionComment = GetValueSafely(fields, interactionCommentIdx)
            };

            courseSurvey.Responses.Add(response);
        }

        courseSurvey.StudentsCount = courseSurvey.Responses.Count;
        return courseSurvey;
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

        // Strip email addresses
        text = Regex.Replace(text, @"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", "[email]");

        // Strip phone numbers (+7, 8-9xx, etc.)
        text = Regex.Replace(text, @"(?:\+7|8)[\s\-\(\)]*\d{3}[\s\-\(\)]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}", "[телефон]");

        // Strip SNILS (11 digits: xxx-xxx-xxx xx)
        text = Regex.Replace(text, @"\b\d{3}[\s\-]?\d{3}[\s\-]?\d{3}[\s\-]?\d{2}\b", "[СНИЛС]");

        // Strip Russian Passport (4 digits + 6 digits)
        text = Regex.Replace(text, @"\b\d{4}\s?\d{6}\b", "[паспорт]");

        // Strip Credit Card numbers (16 digits)
        text = Regex.Replace(text, @"\b(?:\d[ -]*?){13,16}\b", "[карта]");

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

    private static int ParseScore(string text, int defaultValue = 10)
    {
        if (string.IsNullOrWhiteSpace(text)) return defaultValue;
        var match = Regex.Match(text, @"\d+");
        if (match.Success && int.TryParse(match.Value, out int score))
        {
            if (score < 1) return 1;
            if (score > 10) return 10;
            return score;
        }
        return defaultValue;
    }

    private static bool ParseIsDetached(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return false;
        var clean = text.Trim().ToLowerInvariant();
        return clean == "да" || clean == "yes" || clean == "1" || clean == "true";
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

    public static string ExtractCourseName(string fileName)
    {
        string nameWithoutExt = Path.GetFileNameWithoutExtension(fileName);
        var periodMatch = Regex.Match(nameWithoutExt, @"^\d{2}\.\d{2}-\d{2}\.\d{2}(\.\d{4})?");
        string courseName = nameWithoutExt;
        if (periodMatch.Success)
        {
            courseName = nameWithoutExt.Substring(periodMatch.Value.Length).Trim(' ', '_', '-');
        }
        courseName = Regex.Replace(courseName, @"_\d+_(ДОТ|очно|дист)", "", RegexOptions.IgnoreCase).Trim();
        courseName = courseName.Replace("Вопросы функционирования контрактной системы_40_ДОТ", "Вопросы функционирования контрактной системы").Trim();
        return courseName;
    }
}