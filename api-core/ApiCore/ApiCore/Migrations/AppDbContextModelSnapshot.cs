using ApiCore.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

#nullable disable

namespace ApiCore.Migrations;

[DbContext(typeof(AppDbContext))]
public sealed class AppDbContextModelSnapshot : ModelSnapshot
{
    protected override void BuildModel(ModelBuilder modelBuilder)
    {
        modelBuilder
            .HasAnnotation("ProductVersion", "9.0.0")
            .HasAnnotation("Relational:MaxIdentifierLength", 63);

        modelBuilder.Entity("ApiCore.Models.User", entity =>
        {
            entity.Property<Guid>("Id")
                .ValueGeneratedNever()
                .HasColumnType("uuid")
                .HasColumnName("id");
            entity.Property<string>("Email")
                .IsRequired()
                .HasColumnType("text")
                .HasColumnName("email");
            entity.Property<string>("PasswordHash")
                .IsRequired()
                .HasColumnType("text")
                .HasColumnName("password_hash");
            entity.Property<string>("Role")
                .IsRequired()
                .HasMaxLength(20)
                .HasColumnType("character varying(20)")
                .HasColumnName("role");
            entity.Property<string>("SettingsJson")
                .HasColumnType("jsonb")
                .HasColumnName("settings_json");
            entity.Property<string>("Username")
                .IsRequired()
                .HasMaxLength(100)
                .HasColumnType("character varying(100)")
                .HasColumnName("username");
            entity.HasKey("Id");
            entity.ToTable("users");
        });

        modelBuilder.Entity("ApiCore.Models.AnalysisReport", entity =>
        {
            entity.Property<string>("Id")
                .HasMaxLength(255)
                .HasColumnType("character varying(255)")
                .HasColumnName("id");
            entity.Property<int>("AttemptCount")
                .HasColumnType("integer")
                .HasColumnName("attempt_count");
            entity.Property<string>("CourseName")
                .IsRequired()
                .HasMaxLength(255)
                .HasColumnType("character varying(255)")
                .HasColumnName("course_name");
            entity.Property<string>("CheckpointJson")
                .HasColumnType("jsonb")
                .HasColumnName("checkpoint_json");
            entity.Property<DateTime>("CreatedAt")
                .HasColumnType("timestamp with time zone")
                .HasColumnName("created_at");
            entity.Property<string>("Error")
                .HasColumnType("text")
                .HasColumnName("error");
            entity.Property<bool>("IsArchived")
                .HasColumnType("boolean")
                .HasColumnName("is_archived");
            entity.Property<string>("JobType")
                .HasMaxLength(30)
                .HasColumnType("character varying(30)")
                .HasColumnName("job_type");
            entity.Property<string>("ModelType")
                .HasMaxLength(30)
                .HasColumnType("character varying(30)")
                .HasColumnName("model_type");
            entity.Property<DateTime?>("NextRetryAt")
                .HasColumnType("timestamp with time zone")
                .HasColumnName("next_retry_at");
            entity.Property<string>("PayloadJson")
                .HasColumnType("jsonb")
                .HasColumnName("payload_json");
            entity.Property<string>("ResultJson")
                .HasColumnType("jsonb")
                .HasColumnName("result_json");
            entity.Property<DateTime?>("StartedAt")
                .HasColumnType("timestamp with time zone")
                .HasColumnName("started_at");
            entity.Property<string>("Status")
                .IsRequired()
                .HasMaxLength(50)
                .HasColumnType("character varying(50)")
                .HasColumnName("status");
            entity.Property<DateTime>("UpdatedAt")
                .HasColumnType("timestamp with time zone")
                .HasColumnName("updated_at");
            entity.Property<Guid>("UserId")
                .HasColumnType("uuid")
                .HasColumnName("user_id");
            entity.HasKey("Id");
            entity.HasIndex("UserId")
                .HasDatabaseName("ix_analysis_reports_user_id");
            entity.HasIndex("Status", "NextRetryAt", "CreatedAt")
                .HasDatabaseName("ix_analysis_reports_queue");
            entity.ToTable("analysis_reports");
        });

        modelBuilder.Entity("ApiCore.Models.AnalysisReport", entity =>
        {
            entity.HasOne("ApiCore.Models.User", null)
                .WithMany()
                .HasForeignKey("UserId")
                .OnDelete(DeleteBehavior.Cascade)
                .IsRequired()
                .HasConstraintName("fk_analysis_reports_users");
        });
    }
}
