using System.IO.Compression;
using System.Security;
using System.Text;
using ApiCore.Models;
using ApiCore.Services;
using ApiCore.Controllers;
using Microsoft.Extensions.Options;

var testRoot = Path.Combine(Path.GetTempPath(), $"iot-contract-tests-{Guid.NewGuid():N}");
Directory.CreateDirectory(testRoot);

try
{
    var parser = new FileParser();
    var validator = new ValidationService();

    var expected = new EmployeeProfileDto
    {
        Fio = "Тестовый профиль",
        Position = "Главный специалист",
        Department = "Тестовое ведомство",
        ExperienceYears = 7,
        CareerGoal = "Проверка форматов загрузки",
        LearningHistory =
        [
            new CourseHistoryItemDto
            {
                CourseName = "Основы анализа данных",
                CourseType = "ЭК",
                Status = "Пройден"
            }
        ]
    };

    var jsonPath = Path.Combine(testRoot, "profile.json");
    await File.WriteAllTextAsync(jsonPath, System.Text.Json.JsonSerializer.Serialize(new { employee = expected }), Encoding.UTF8);

    var csvPath = Path.Combine(testRoot, "profile.csv");
    await File.WriteAllTextAsync(
        csvPath,
        "ФИО;Должность;ИОГВ;Стаж;Цель обучения;Тип;Курс;Статус\n" +
        "Тестовый профиль;Главный специалист;Тестовое ведомство;7;Проверка форматов загрузки;ЭК;Основы анализа данных;Пройден\n",
        Encoding.UTF8);

    var xlsxPath = Path.Combine(testRoot, "profile.xlsx");
    CreateMinimalXlsx(xlsxPath,
    [
        ["ФИО", "Должность", "ИОГВ", "Стаж", "Цель обучения", "Тип", "Курс", "Статус"],
        ["Тестовый профиль", "Главный специалист", "Тестовое ведомство", "7", "Проверка форматов загрузки", "ЭК", "Основы анализа данных", "Пройден"]
    ]);

    var xlsPath = Path.Combine(testRoot, "profile.xls");
    CreateLegacyXls(xlsPath);

    var zipSource = Path.Combine(testRoot, "zip-source");
    Directory.CreateDirectory(zipSource);
    File.Copy(jsonPath, Path.Combine(zipSource, "profile.json"));
    var zipPath = Path.Combine(testRoot, "profile.zip");
    ZipFile.CreateFromDirectory(zipSource, zipPath);

    foreach (var path in new[] { jsonPath, csvPath, xlsxPath, xlsPath, zipPath })
    {
        var fileValidation = validator.ValidateFiles([path]);
        Assert(fileValidation.IsValid, $"{Path.GetExtension(path)} validation failed: {string.Join("; ", fileValidation.Errors)}");

        var profiles = parser.ParseHistoryFiles([path]);
        var profileValidation = validator.ValidateEmployeeProfiles(profiles);
        Assert(profileValidation.IsValid, $"{Path.GetExtension(path)} profile validation failed: {string.Join("; ", profileValidation.Errors)}");
        Assert(profiles.Count == 1, $"{Path.GetExtension(path)} must contain exactly one profile");
        AssertProfile(profiles[0], expected, Path.GetExtension(path));
    }

    var incompleteCsvPath = Path.Combine(testRoot, "incomplete.csv");
    await File.WriteAllTextAsync(
        incompleteCsvPath,
        "ФИО;Курс;Статус\nТестовый профиль;Основы анализа данных;Пройден\n",
        Encoding.UTF8);
    var incompleteProfiles = parser.ParseHistoryFiles([incompleteCsvPath]);
    Assert(incompleteProfiles.Count == 1, "Incomplete CSV must still expose its source profile for validation");
    Assert(string.IsNullOrEmpty(incompleteProfiles[0].Position), "Parser must not invent a position");
    Assert(string.IsNullOrEmpty(incompleteProfiles[0].Department), "Parser must not invent a department");
    Assert(incompleteProfiles[0].ExperienceYears == 0, "Parser must not invent experience");
    Assert(string.IsNullOrEmpty(incompleteProfiles[0].CareerGoal), "Parser must not invent a career goal");
    Assert(!validator.ValidateEmployeeProfiles(incompleteProfiles).IsValid, "Incomplete profile must be rejected");

    var ambiguousHeadersCsvPath = Path.Combine(testRoot, "ambiguous-headers.csv");
    await File.WriteAllTextAsync(
        ambiguousHeadersCsvPath,
        "ФИО;Наименование должности;ИОГВ;Статус программы;Наименование программы;Цель обучения\n" +
        "Тестовый профиль;Главный специалист;Тестовое ведомство;Пройден;Основы анализа данных;Проверка точного сопоставления\n",
        Encoding.UTF8);
    var ambiguousProfiles = parser.ParseHistoryFiles([ambiguousHeadersCsvPath]);
    Assert(ambiguousProfiles.Count == 1, "Exact header mapping must preserve the profile");
    Assert(ambiguousProfiles[0].Position == "Главный специалист", "Position must come from 'Наименование должности'");
    Assert(ambiguousProfiles[0].LearningHistory.Single().CourseName == "Основы анализа данных", "Course must come from 'Наименование программы'");
    Assert(ambiguousProfiles[0].LearningHistory.Single().Status == "Пройден", "Status must come from 'Статус программы'");

    var unknownLayoutCsvPath = Path.Combine(testRoot, "unknown-layout.csv");
    await File.WriteAllTextAsync(
        unknownLayoutCsvPath,
        "Колонка 1;Колонка 2;Колонка 3;Колонка 4;Колонка 5;Колонка 6\n" +
        "Тестовый профиль;Главный специалист;Тестовое ведомство;ЭК;Основы анализа данных;Пройден\n",
        Encoding.UTF8);
    Assert(parser.ParseHistoryFiles([unknownLayoutCsvPath]).Count == 0, "Unknown column order must not be guessed");

    var oversizedBatch = Enumerable.Range(1, 16)
        .Select(index => new EmployeeProfileDto
        {
            Fio = $"Профиль {index}",
            Position = expected.Position,
            Department = expected.Department,
            CareerGoal = expected.CareerGoal
        })
        .ToList();
    Assert(!validator.ValidateEmployeeProfiles(oversizedBatch).IsValid, "A batch larger than 15 profiles must be rejected");

    const string batchResultJson = """
        {
          "batch_id": "batch-contract",
          "total_profiles_processed": 15,
          "batch_selection_required": true,
          "batch_limit": 15,
          "quality_status": "verified",
          "courses_analysis": []
        }
        """;
    var batchResult = System.Text.Json.JsonSerializer.Deserialize<CourseBatchAnalysisResult>(batchResultJson)
        ?? throw new InvalidOperationException("Batch result contract must deserialize");
    Assert(batchResult.TotalProfilesProcessed == 15, "Batch result must preserve total_profiles_processed");
    Assert(batchResult.BatchSelectionRequired == true, "Batch result must preserve batch_selection_required");
    Assert(batchResult.BatchLimit == 15, "Batch result must preserve batch_limit");

    var secondProfile = new EmployeeProfileDto
    {
        Fio = "Второй тестовый профиль",
        Position = expected.Position,
        Department = expected.Department,
        ExperienceYears = expected.ExperienceYears,
        CareerGoal = expected.CareerGoal,
        LearningHistory = []
    };
    var secondJsonPath = Path.Combine(testRoot, "second-profile.json");
    await File.WriteAllTextAsync(secondJsonPath, System.Text.Json.JsonSerializer.Serialize(new { employee = secondProfile }), Encoding.UTF8);
    var multipleProfiles = parser.ParseHistoryFiles([jsonPath, secondJsonPath]);
    Assert(multipleProfiles.Count == 2, "Multiple input files must preserve both profiles");
    Assert(validator.ValidateEmployeeProfiles(multipleProfiles).IsValid, "Multiple complete input files must pass profile validation");

    var emptyJsonPath = Path.Combine(testRoot, "empty.json");
    await File.WriteAllTextAsync(emptyJsonPath, string.Empty, Encoding.UTF8);
    AssertInvalidFile(validator, emptyJsonPath, "empty JSON");

    var malformedJsonPath = Path.Combine(testRoot, "malformed.json");
    await File.WriteAllTextAsync(malformedJsonPath, "{not-json", Encoding.UTF8);
    AssertInvalidFile(validator, malformedJsonPath, "malformed JSON");

    var unsupportedPath = Path.Combine(testRoot, "profile.txt");
    await File.WriteAllTextAsync(unsupportedPath, "unsupported", Encoding.UTF8);
    AssertInvalidFile(validator, unsupportedPath, "unsupported extension");

    var headerOnlyCsvPath = Path.Combine(testRoot, "header-only.csv");
    await File.WriteAllTextAsync(headerOnlyCsvPath, "ФИО;Должность;ИОГВ;Курс;Статус\n", Encoding.UTF8);
    AssertInvalidFile(validator, headerOnlyCsvPath, "header-only CSV");

    var headerOnlyXlsxPath = Path.Combine(testRoot, "header-only.xlsx");
    CreateMinimalXlsx(headerOnlyXlsxPath, [["ФИО", "Должность", "ИОГВ", "Курс", "Статус"]]);
    AssertInvalidFile(validator, headerOnlyXlsxPath, "header-only XLSX");

    var corruptXlsPath = Path.Combine(testRoot, "corrupt.xls");
    await File.WriteAllBytesAsync(corruptXlsPath, [0x01, 0x02, 0x03]);
    AssertInvalidFile(validator, corruptXlsPath, "corrupt XLS");

    var corruptZipPath = Path.Combine(testRoot, "corrupt.zip");
    await File.WriteAllBytesAsync(corruptZipPath, [0x50, 0x4B, 0x01]);
    AssertInvalidFile(validator, corruptZipPath, "corrupt ZIP");

    var emptyZipPath = Path.Combine(testRoot, "empty.zip");
    using (ZipFile.Open(emptyZipPath, ZipArchiveMode.Create)) { }
    AssertInvalidFile(validator, emptyZipPath, "empty ZIP");

    var nestedZipPath = Path.Combine(testRoot, "nested.zip");
    using (var archive = ZipFile.Open(nestedZipPath, ZipArchiveMode.Create))
    {
        archive.CreateEntryFromFile(zipPath, "nested.zip");
    }
    AssertInvalidFile(validator, nestedZipPath, "nested ZIP");

    var unsupportedZipPath = Path.Combine(testRoot, "unsupported-entry.zip");
    using (var archive = ZipFile.Open(unsupportedZipPath, ZipArchiveMode.Create))
    {
        WriteEntry(archive, "payload.exe", "not executable test content");
    }
    AssertInvalidFile(validator, unsupportedZipPath, "ZIP with unsupported entry");

    var malformedContentZipPath = Path.Combine(testRoot, "malformed-content.zip");
    using (var archive = ZipFile.Open(malformedContentZipPath, ZipArchiveMode.Create))
    {
        WriteEntry(archive, "profile.json", "{not-json");
    }
    AssertInvalidFile(validator, malformedContentZipPath, "ZIP with malformed content");

    var strictUploadValidator = new ValidationService(Options.Create(new UploadOptions
    {
        MaxFileBytes = 1024,
        MaxRequestBytes = 1536,
        MaxFileCount = 2,
        MaxArchiveEntries = 2,
        MaxArchiveUncompressedBytes = 1024,
        MaxArchiveCompressionRatio = 5
    }));
    var oversizedFilePath = Path.Combine(testRoot, "oversized.json");
    await File.WriteAllTextAsync(oversizedFilePath, new string('x', 2048), Encoding.UTF8);
    AssertInvalidFile(strictUploadValidator, oversizedFilePath, "oversized upload");

    var highRatioZipPath = Path.Combine(testRoot, "high-ratio.zip");
    using (var archive = ZipFile.Open(highRatioZipPath, ZipArchiveMode.Create))
    {
        WriteEntry(archive, "profile.json", new string(' ', 900));
    }
    AssertInvalidFile(strictUploadValidator, highRatioZipPath, "high compression ratio ZIP");

    var tooManyEntriesZipPath = Path.Combine(testRoot, "too-many-entries.zip");
    using (var archive = ZipFile.Open(tooManyEntriesZipPath, ZipArchiveMode.Create))
    {
        WriteEntry(archive, "one.json", "{}");
        WriteEntry(archive, "two.json", "{}");
        WriteEntry(archive, "three.json", "{}");
    }
    AssertInvalidFile(strictUploadValidator, tooManyEntriesZipPath, "ZIP with too many entries");

    _ = parser.ParseHistoryFiles([zipPath]);
    Assert(!Directory.GetDirectories(testRoot, "unzipped_*", SearchOption.TopDirectoryOnly).Any(), "Successful ZIP parsing must clean extraction directories");

    try
    {
        _ = parser.ParseHistoryFiles([malformedContentZipPath]);
        throw new InvalidOperationException("Malformed ZIP content must fail parsing");
    }
    catch (System.Text.Json.JsonException)
    {
        Assert(!Directory.GetDirectories(testRoot, "unzipped_*", SearchOption.TopDirectoryOnly).Any(), "Failed ZIP parsing must clean extraction directories");
    }

    var emptyLoginErrors = ValidateModel(new LoginRequest());
    Assert(emptyLoginErrors.Any(error => error.ErrorMessage == "Укажите email."), "Login must return a localized required-email error");
    Assert(emptyLoginErrors.Any(error => error.ErrorMessage == "Укажите пароль."), "Login must return a localized required-password error");

    var invalidLoginErrors = ValidateModel(new LoginRequest { Email = "not-an-email", Password = "password" });
    Assert(invalidLoginErrors.Any(error => error.ErrorMessage == "Укажите корректный email."), "Login must reject an invalid email format");

    var invalidRegistrationErrors = ValidateModel(new RegisterRequest
    {
        Username = new string('Я', 101),
        Email = "not-an-email",
        Password = "12345678901"
    });
    Assert(invalidRegistrationErrors.Any(error => error.ErrorMessage == "Имя пользователя не должно превышать 100 символов."), "Registration username must match the database length limit");
    Assert(invalidRegistrationErrors.Any(error => error.ErrorMessage == "Невалидный формат почты"), "Registration must reject an invalid email format");
    Assert(invalidRegistrationErrors.Any(error => error.ErrorMessage == "Пароль должен содержать от 12 до 128 символов."), "Registration must reject a short password");

    var oversizedRenameErrors = ValidateModel(new RenameReportRequest { Name = new string('Я', 256) });
    Assert(oversizedRenameErrors.Count > 0, "Report rename must match the database length limit");

    Console.WriteLine("Contract tests passed: JSON, CSV, XLSX, XLS and ZIP preserve complete profiles; multiple files work; invalid inputs are rejected and ZIP extraction is cleaned; auth DTO validation matches UI and database constraints.");
    return 0;
}
finally
{
    if (Directory.Exists(testRoot)) Directory.Delete(testRoot, recursive: true);
}

static void AssertProfile(EmployeeProfileDto actual, EmployeeProfileDto expected, string format)
{
    Assert(actual.Fio == expected.Fio, $"{format}: FIO mismatch");
    Assert(actual.Position == expected.Position, $"{format}: position mismatch");
    Assert(actual.Department == expected.Department, $"{format}: department mismatch");
    Assert(actual.ExperienceYears == expected.ExperienceYears, $"{format}: experience mismatch");
    Assert(actual.CareerGoal == expected.CareerGoal, $"{format}: career goal mismatch");
    Assert(actual.LearningHistory.Count == 1, $"{format}: learning history count mismatch");
    Assert(actual.LearningHistory[0].CourseName == expected.LearningHistory[0].CourseName, $"{format}: course mismatch");
    Assert(actual.LearningHistory[0].CourseType == expected.LearningHistory[0].CourseType, $"{format}: course type mismatch");
    Assert(actual.LearningHistory[0].Status == expected.LearningHistory[0].Status, $"{format}: status mismatch");
}

static void Assert(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException(message);
}

static List<System.ComponentModel.DataAnnotations.ValidationResult> ValidateModel(object model)
{
    var results = new List<System.ComponentModel.DataAnnotations.ValidationResult>();
    var context = new System.ComponentModel.DataAnnotations.ValidationContext(model);
    System.ComponentModel.DataAnnotations.Validator.TryValidateObject(model, context, results, validateAllProperties: true);
    return results;
}

static void AssertInvalidFile(ValidationService validator, string path, string scenario)
{
    var validation = validator.ValidateFiles([path]);
    Assert(!validation.IsValid, $"{scenario} must be rejected");
    Assert(validation.Errors.Count > 0, $"{scenario} must return a safe user-facing error");
    Assert(validation.Errors.All(error => !error.Contains(Path.GetDirectoryName(path)!, StringComparison.Ordinal)), $"{scenario} error must not expose the server path");
    Assert(validation.Errors.All(error => !error.Contains(" at ", StringComparison.OrdinalIgnoreCase)), $"{scenario} error must not expose a stack trace");
}

static void CreateLegacyXls(string path)
{
    const string compressedFixture = """
        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
        """;

    var compressedBytes = Convert.FromBase64String(compressedFixture);
    using var compressedStream = new MemoryStream(compressedBytes);
    using var gzip = new GZipStream(compressedStream, CompressionMode.Decompress);
    using var output = File.Create(path);
    gzip.CopyTo(output);
}

static void CreateMinimalXlsx(string path, IReadOnlyList<IReadOnlyList<string>> rows)
{
    using var archive = ZipFile.Open(path, ZipArchiveMode.Create);
    WriteEntry(archive, "[Content_Types].xml", """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
          <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
          <Default Extension="xml" ContentType="application/xml"/>
          <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
          <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
        </Types>
        """);
    WriteEntry(archive, "_rels/.rels", """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
        </Relationships>
        """);
    WriteEntry(archive, "xl/workbook.xml", """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <sheets><sheet name="Профиль" sheetId="1" r:id="rId1"/></sheets>
        </workbook>
        """);
    WriteEntry(archive, "xl/_rels/workbook.xml.rels", """
        <?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
        </Relationships>
        """);

    var sheet = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>");
    for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
    {
        sheet.Append($"<row r=\"{rowIndex + 1}\">");
        for (var columnIndex = 0; columnIndex < rows[rowIndex].Count; columnIndex++)
        {
            var reference = $"{ColumnName(columnIndex)}{rowIndex + 1}";
            var value = SecurityElement.Escape(rows[rowIndex][columnIndex]) ?? string.Empty;
            sheet.Append($"<c r=\"{reference}\" t=\"inlineStr\"><is><t>{value}</t></is></c>");
        }
        sheet.Append("</row>");
    }
    sheet.Append("</sheetData></worksheet>");
    WriteEntry(archive, "xl/worksheets/sheet1.xml", sheet.ToString());
}

static string ColumnName(int zeroBasedIndex)
{
    var value = zeroBasedIndex + 1;
    var result = string.Empty;
    while (value > 0)
    {
        value--;
        result = (char)('A' + value % 26) + result;
        value /= 26;
    }
    return result;
}

static void WriteEntry(ZipArchive archive, string name, string content)
{
    var entry = archive.CreateEntry(name, CompressionLevel.Fastest);
    using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(encoderShouldEmitUTF8Identifier: false));
    writer.Write(content);
}
