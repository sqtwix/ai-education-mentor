namespace ApiCore.Models;


public class ValidationResult
{
    public bool IsValid => !Errors.Any();
    public List<string> Errors { get; set; } = new();

    public void AddError(string error) => Errors.Add(error);
}

