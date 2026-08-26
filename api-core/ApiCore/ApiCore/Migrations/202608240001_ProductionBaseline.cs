using ApiCore.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ApiCore.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("202608240001_ProductionBaseline")]
public sealed class ProductionBaseline : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY,
                username VARCHAR(100) NOT NULL,
                email TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                settings_json JSONB,
                role VARCHAR(20) NOT NULL DEFAULT 'Employee'
            );

            ALTER TABLE users ADD COLUMN IF NOT EXISTS settings_json JSONB;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'Employee';
            CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email_normalized ON users (LOWER(email));

            CREATE TABLE IF NOT EXISTS analysis_reports (
                id VARCHAR(255) PRIMARY KEY,
                user_id UUID NOT NULL,
                course_name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                status VARCHAR(50) NOT NULL,
                result_json JSONB,
                checkpoint_json JSONB,
                error TEXT,
                is_archived BOOLEAN NOT NULL DEFAULT FALSE,
                job_type VARCHAR(30),
                payload_json JSONB,
                model_type VARCHAR(30),
                attempt_count INTEGER NOT NULL DEFAULT 0,
                next_retry_at TIMESTAMP WITH TIME ZONE,
                started_at TIMESTAMP WITH TIME ZONE,
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
            );

            ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
            ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS job_type VARCHAR(30);
            ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS payload_json JSONB;
            ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS model_type VARCHAR(30);
            ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0;
            ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;
            ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
            ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS checkpoint_json JSONB;

            CREATE INDEX IF NOT EXISTS ix_analysis_reports_user_id ON analysis_reports (user_id);
            CREATE INDEX IF NOT EXISTS ix_analysis_reports_queue ON analysis_reports (status, next_retry_at, created_at);

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'fk_analysis_reports_users'
                ) THEN
                    ALTER TABLE analysis_reports
                    ADD CONSTRAINT fk_analysis_reports_users
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
                END IF;
            END $$;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("""
            DROP TABLE IF EXISTS analysis_reports;
            DROP TABLE IF EXISTS users;
            """);
    }
}
