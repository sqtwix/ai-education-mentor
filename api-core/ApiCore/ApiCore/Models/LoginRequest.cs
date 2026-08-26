using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace ApiCore.Models;

public class LoginRequest
{
    [Required(ErrorMessage = "Укажите email.")]
    [EmailAddressWhenProvided(ErrorMessage = "Укажите корректный email.")]
    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Укажите пароль.")]
    [MaxLength(128, ErrorMessage = "Пароль не должен превышать 128 символов.")]
    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;
}
