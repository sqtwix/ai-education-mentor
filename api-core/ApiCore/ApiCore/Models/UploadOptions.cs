namespace ApiCore.Models;

public class UploadOptions
{
    public const string SectionName = "UploadLimits";

    public long MaxFileBytes { get; set; } = 26_214_400;
    public long MaxRequestBytes { get; set; } = 52_428_800;
    public int MaxFileCount { get; set; } = 20;
    public int MaxArchiveEntries { get; set; } = 100;
    public long MaxArchiveUncompressedBytes { get; set; } = 104_857_600;
    public double MaxArchiveCompressionRatio { get; set; } = 100;
}
