using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace ApiCore.Models;

/*
Моедль для регистрации нового пользователя. 
Содержит обязательные поля "username", "password", "email".
Пароль должен содержать от 12 до 128 символов.
*/

public class RegisterRequest
{
    [Required(ErrorMessage = "Укажите имя пользователя.")]
    [MaxLength(100, ErrorMessage = "Имя пользователя не должно превышать 100 символов.")]
    [JsonPropertyName("username")]
    public string Username { get; set; } = string.Empty;

    [Required(ErrorMessage = "Укажите email.")]
    [EmailAddressWhenProvided(ErrorMessage = "Невалидный формат почты")]
    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    [Required(ErrorMessage = "Укажите пароль.")]
    [StringLength(128, MinimumLength = 12, ErrorMessage = "Пароль должен содержать от 12 до 128 символов.")]
    [JsonPropertyName("password")]
    public string Password { get; set; } = string.Empty;
}
