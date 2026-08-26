using ApiCore.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ApiCore.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("202608260001_AddProcessingCheckpoint")]
public sealed class AddProcessingCheckpoint : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS checkpoint_json JSONB;");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql("ALTER TABLE analysis_reports DROP COLUMN IF EXISTS checkpoint_json;");
    }
}
