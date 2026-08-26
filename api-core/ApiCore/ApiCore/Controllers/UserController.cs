using System.Security.Claims;
using System.Text.Json;
using ApiCore.Data;
using ApiCore.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ApiCore.Controllers;

[ApiController]
[Route("api/v1/user")]
public class UserController : ControllerBase
{
    private readonly AppDbContext _context;

    public UserController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet("settings")]
    public async Task<IActionResult> GetSettings()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { error = "Пользователь не авторизован." });
        }

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
        {
            return NotFound(new { error = "Пользователь не найден." });
        }

        if (string.IsNullOrEmpty(user.SettingsJson))
        {
            return Content("{}", "application/json");
        }

        return Content(user.SettingsJson, "application/json");
    }

    [HttpGet("me")]
    [HttpGet("/api/v1/me")]
    public async Task<IActionResult> GetCurrentUser()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { error = "Пользователь не авторизован." });
        }

        var user = await _context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
        {
            return NotFound(new { error = "Пользователь не найден." });
        }

        return Ok(new
        {
            id = user.Id,
            username = user.Username,
            email = user.Email,
            role = user.Role
        });
    }

    [HttpPut("settings")]
    public async Task<IActionResult> SaveSettings([FromBody] JsonElement settings)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { error = "Пользователь не авторизован." });
        }

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
        {
            return NotFound(new { error = "Пользователь не найден." });
        }

        user.SettingsJson = settings.GetRawText();
        await _context.SaveChangesAsync();

        return Ok(settings);
    }
}
