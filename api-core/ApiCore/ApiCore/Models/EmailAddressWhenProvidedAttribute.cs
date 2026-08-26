using System.ComponentModel.DataAnnotations;

namespace ApiCore.Models;

public class EmailAddressWhenProvidedAttribute : ValidationAttribute
{
    private static readonly EmailAddressAttribute EmailValidator = new();

    public override bool IsValid(object? value)
    {
        if (value is not string stringValue || string.IsNullOrWhiteSpace(stringValue))
        {
            return true;
        }

        return EmailValidator.IsValid(stringValue);
    }
}
