using ApiCore.Models;
using Microsoft.EntityFrameworkCore;

namespace ApiCore.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options)
    {
    }

    // Таблица пользователей
    public DbSet<User> Users => Set<User>();

    // Таблица отчетов
    public DbSet<AnalysisReport> AnalysisReports => Set<AnalysisReport>();

    /// <summary>
    /// Конфигурация схемы базы данных при помощи Fluent API
    /// </summary>
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Настраиваем правила для сущности User в PostgreSQL
        modelBuilder.Entity<User>(entity =>
        {
            entity.Property(u => u.SettingsJson)
                .HasColumnType("jsonb");
        });

        // Настраиваем правила для сущности AnalysisReport
        modelBuilder.Entity<AnalysisReport>(entity =>
        {
            entity.Property(r => r.ResultJson)
                .HasColumnType("jsonb");
            entity.Property(r => r.CheckpointJson)
                .HasColumnType("jsonb");
            entity.Property(r => r.PayloadJson)
                .HasColumnType("jsonb");
            entity.HasIndex(r => r.UserId)
                .HasDatabaseName("ix_analysis_reports_user_id");
            entity.HasIndex(r => new { r.Status, r.NextRetryAt, r.CreatedAt })
                .HasDatabaseName("ix_analysis_reports_queue");
            entity.HasOne<User>()
                .WithMany()
                .HasForeignKey(r => r.UserId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("fk_analysis_reports_users");
        });
    }
}
