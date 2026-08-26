using System.Text;
using System.Text.Json;
using System.Diagnostics;
using System.Threading.RateLimiting;
using ApiCore.Data;
using ApiCore.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication.JwtBearer; // Добавить этот using
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.Models;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Http.Features;
using ApiCore.Models;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

// 1. Подключение PostgreSQL
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddControllers();
builder.Services.AddMemoryCache();
builder.Services.AddDataProtection()
    .SetApplicationName("AiEducationMentor")
    .PersistKeysToFileSystem(new DirectoryInfo("/var/lib/api-core/dataprotection-keys"));

var uploadOptions = builder.Configuration
    .GetSection(UploadOptions.SectionName)
    .Get<UploadOptions>() ?? new UploadOptions();
if (uploadOptions.MaxFileBytes <= 0 ||
    uploadOptions.MaxRequestBytes < uploadOptions.MaxFileBytes ||
    uploadOptions.MaxFileCount <= 0 ||
    uploadOptions.MaxArchiveEntries <= 0 ||
    uploadOptions.MaxArchiveUncompressedBytes <= 0 ||
    uploadOptions.MaxArchiveCompressionRatio <= 0)
{
    throw new InvalidOperationException("UploadLimits configuration contains invalid values.");
}
builder.Services.Configure<UploadOptions>(builder.Configuration.GetSection(UploadOptions.SectionName));
builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = uploadOptions.MaxRequestBytes;
});
builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = uploadOptions.MaxRequestBytes;
});

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.ContentType = "application/json";
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            error = "Слишком много запросов. Подождите и повторите действие.",
            correlation_id = context.HttpContext.TraceIdentifier
        }, cancellationToken);
    };

    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 10,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));
    options.AddPolicy("analysis", context => RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            ?? context.Connection.RemoteIpAddress?.ToString()
            ?? "unknown",
        factory: _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 6,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0,
            AutoReplenishment = true
        }));
    options.AddPolicy("upload", context => RateLimitPartition.GetConcurrencyLimiter(
        partitionKey: context.User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
            ?? context.Connection.RemoteIpAddress?.ToString()
            ?? "unknown",
        factory: _ => new ConcurrencyLimiterOptions
        {
            PermitLimit = 2,
            QueueLimit = 0
        }));
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins("http://localhost:5173", "http://127.0.0.1:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .WithExposedHeaders("X-Correlation-ID");
    });
});

// 2. НАСТРОЙКА JWT ВАЛИДАЦИИ (Этого блока не хватало)
var jwtSettings = builder.Configuration.GetSection("JwtSettings");
var secretKey = jwtSettings["Secret"] ?? throw new InvalidOperationException("JWT Secret is missing.");
if (Encoding.UTF8.GetByteCount(secretKey) < 32)
{
    throw new InvalidOperationException("JWT Secret must contain at least 32 bytes.");
}

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings["Issuer"],
        ValidAudience = jwtSettings["Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey)),
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddAuthorization();

// 3. НАСТРОЙКА OPENAPI / SWAGGER
builder.Services.AddOpenApi(options =>
{
    // ТРАНСФОРМЕР ОПЕРАЦИЙ: Логика для конкретных ручек (файлы + вешаем замочки)
    options.AddOperationTransformer((operation, context, cancellationToken) =>
    {
        // Кастомная схема для multipart/form-data (ручка загрузки файлов)
        if (context.Description.RelativePath != null &&
            context.Description.RelativePath.Contains("api/v1/analysis/upload", StringComparison.OrdinalIgnoreCase))
        {
            operation.RequestBody ??= new OpenApiRequestBody();
            operation.RequestBody.Content.Clear();

            var formSchema = new OpenApiSchema
            {
                Type = "object",
                Required = new HashSet<string> { "userResponseFiles" }
            };

            formSchema.Properties.Add("userResponseFiles", new OpenApiSchema
            {
                Type = "array",
                Items = new OpenApiSchema { Type = "string", Format = "binary" },
                Description = "Профили и история обучения ИОТ (.json / .xlsx / .xls / .csv / .zip)"
            });

            formSchema.Properties.Add("modelType", new OpenApiSchema
            {
                Type = "string",
                Default = new OpenApiString("deepseek"),
                Description = "Модель ИИ (deepseek, gigachat или qwen_local)"
            });

            formSchema.Properties.Add("requestId", new OpenApiSchema
            {
                Type = "string",
                Description = "Идемпотентный идентификатор отправки (повтор с тем же значением не создаёт новую задачу)"
            });

            operation.RequestBody.Content.Add("multipart/form-data", new OpenApiMediaType
            {
                Schema = formSchema
            });
        }

        // АВТО-ПРИВЯЗКА ЗАМОЧКА: Если ручка закрыта авторизацией, добавляем требование JWT
        var allowsAnonymous = context.Description.ActionDescriptor.EndpointMetadata
            .OfType<IAllowAnonymous>()
            .Any();
        if (!allowsAnonymous)
        {
            operation.Security ??= new List<OpenApiSecurityRequirement>();
            var securityScheme = new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            };
            operation.Security.Add(new OpenApiSecurityRequirement { [securityScheme] = Array.Empty<string>() });
        }

        return Task.CompletedTask;
    });

    // ТРАНСФОРМЕР ДОКУМЕНТА: схема авторизации для Swagger UI
    options.AddDocumentTransformer((document, context, cancellationToken) =>
    {
        // Регистрируем саму схему авторизации "Bearer" в компонентах OpenAPI
        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes.Add("Bearer", new OpenApiSecurityScheme
        {
            Name = "Authorization",
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            In = ParameterLocation.Header,
            Description = "Введите ваш JWT токен. Слово 'Bearer' подставится автоматически."
        });

        return Task.CompletedTask;
    });
});

// 4. Регистрация сервисов в DI
builder.Services.AddSingleton<ValidationService>();
builder.Services.AddScoped<FileParser>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<ReportsService>();
builder.Services.AddHttpClient<AnalysisService>(client =>
{
    var aiDriverUrl = builder.Configuration["AiDriver:Url"] ?? "http://localhost:8000";
    client.BaseAddress = new Uri(aiDriverUrl.EndsWith("/") ? aiDriverUrl : aiDriverUrl + "/");
    client.Timeout = TimeSpan.FromMinutes(5); // Увеличиваем таймаут для медленных CPU запусков локальных моделей
});
builder.Services.AddHttpClient("AiDriverStatus", client =>
{
    var aiDriverUrl = builder.Configuration["AiDriver:Url"] ?? "http://localhost:8000";
    client.BaseAddress = new Uri(aiDriverUrl.EndsWith("/") ? aiDriverUrl : aiDriverUrl + "/");
    client.Timeout = TimeSpan.FromSeconds(5);
});
builder.Services.AddHostedService<AnalysisQueueWorker>();

var app = builder.Build();

var forwardedHeadersOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
};
// API публикуется только на loopback хоста и внутри compose-сети; единственный
// внешний HTTP-вход в production проходит через nginx этого же стека.
forwardedHeadersOptions.KnownNetworks.Clear();
forwardedHeadersOptions.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedHeadersOptions);

app.MapOpenApi();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/openapi/v1.json", "OpenAPI v1");
    options.RoutePrefix = "swagger";
});

// 5. Инициализация СУБД с ретраями
for (int retry = 0; retry < 5; retry++)
{
    try
    {
        using (var scope = app.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            dbContext.Database.Migrate();

            // Возвращаем прерванные задания в стойкую очередь после применения версионируемой схемы.
            dbContext.Database.ExecuteSqlRaw(@"
                UPDATE analysis_reports
                SET status = 'Retrying',
                    next_retry_at = NOW(),
                    updated_at = NOW(),
                    error = 'Обработка была прервана перезапуском API и поставлена на повтор.'
                WHERE status = 'Processing' AND payload_json IS NOT NULL;
                UPDATE analysis_reports
                SET status = 'Failed',
                    updated_at = NOW(),
                    error = 'Старая задача была прервана перезапуском API и не содержит входного снимка для восстановления.'
                WHERE status = 'Processing' AND payload_json IS NULL;
            ");
        }
        Console.WriteLine(">>>> [УСПЕХ] Успешное подключение к PostgreSQL.");
        break;
    }
    catch
    {
        if (retry == 4) throw;
        Console.WriteLine($">>>> [ОЖИДАНИЕ] База данных еще создается (Попытка {retry + 1}/5)...");
        Thread.Sleep(2000);
    }
}

// 6. MIDDLEWARE (Порядок строго критичен!)
app.Use(async (context, next) =>
{
    var suppliedCorrelationId = context.Request.Headers["X-Correlation-ID"].FirstOrDefault();
    var correlationId = !string.IsNullOrWhiteSpace(suppliedCorrelationId)
        && suppliedCorrelationId.Length <= 128
        && suppliedCorrelationId.All(character => char.IsLetterOrDigit(character) || character is '-' or '_' or '.')
            ? suppliedCorrelationId
            : Guid.NewGuid().ToString("N");
    context.TraceIdentifier = correlationId;
    context.Response.Headers["X-Correlation-ID"] = correlationId;

    var requestLogger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("ApiRequest");
    var stopwatch = Stopwatch.StartNew();
    using (requestLogger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = correlationId }))
    {
        try
        {
            await next();
        }
        finally
        {
            stopwatch.Stop();
            requestLogger.LogInformation(
                "HTTP {Method} {Path} завершён со статусом {StatusCode} за {ElapsedMs} мс",
                context.Request.Method,
                context.Request.Path,
                context.Response.StatusCode,
                stopwatch.ElapsedMilliseconds);
        }
    }
});
app.UseCors("AllowFrontend");
app.UseAuthentication(); // СНАЧАЛА: Расшифровываем токен и узнаем кто это
app.UseRateLimiter();
app.UseAuthorization();  // ЗАТЕМ: Проверяем права доступа к методам

// Глобальная защита эндпоинтов
app.MapControllers().RequireAuthorization();
async Task<IResult> BuildHealthResponse(
    AppDbContext dbContext,
    IHttpClientFactory httpClientFactory,
    bool requireReady,
    CancellationToken cancellationToken)
{
    var databaseAvailable = false;
    var aiDriverAvailable = false;
    JsonElement? models = null;

    try
    {
        databaseAvailable = await dbContext.Database.CanConnectAsync(cancellationToken);
    }
    catch
    {
        databaseAvailable = false;
    }

    try
    {
        var client = httpClientFactory.CreateClient("AiDriverStatus");
        using var healthResponse = await client.GetAsync("health", cancellationToken);
        aiDriverAvailable = healthResponse.IsSuccessStatusCode;
        using var modelsResponse = await client.GetAsync("models/availability", cancellationToken);
        if (modelsResponse.IsSuccessStatusCode)
        {
            using var modelsDocument = JsonDocument.Parse(await modelsResponse.Content.ReadAsStringAsync(cancellationToken));
            models = modelsDocument.RootElement.Clone();
        }
    }
    catch
    {
        aiDriverAvailable = false;
    }

    var ready = databaseAvailable && aiDriverAvailable;
    var payload = new
    {
        status = ready ? "ok" : "degraded",
        service = "api-core",
        version = typeof(Program).Assembly.GetName().Version?.ToString(),
        dependencies = new
        {
            postgres = new { status = databaseAvailable ? "ok" : "unavailable" },
            ai_driver = new { status = aiDriverAvailable ? "ok" : "unavailable" },
            models
        }
    };
    return Results.Json(payload, statusCode: requireReady && !ready
        ? StatusCodes.Status503ServiceUnavailable
        : StatusCodes.Status200OK);
}

app.MapGet("/health", (
    AppDbContext dbContext,
    IHttpClientFactory httpClientFactory,
    CancellationToken cancellationToken) =>
    BuildHealthResponse(dbContext, httpClientFactory, false, cancellationToken)).AllowAnonymous();

app.MapGet("/health/ready", (
    AppDbContext dbContext,
    IHttpClientFactory httpClientFactory,
    CancellationToken cancellationToken) =>
    BuildHealthResponse(dbContext, httpClientFactory, true, cancellationToken)).AllowAnonymous();

app.Run();
