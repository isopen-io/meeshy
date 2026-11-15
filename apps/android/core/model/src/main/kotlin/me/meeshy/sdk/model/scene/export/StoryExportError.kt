package me.meeshy.sdk.model.scene.export

/** Erreurs typées de l'export (miroir de `StoryExporterError` iOS). */
public sealed class StoryExportError(message: String) : Exception(message) {
    public data object NoBackgroundVideo : StoryExportError("noBackgroundVideo")
    public data object InvalidMediaUrl : StoryExportError("invalidMediaURL")
    public data object BackgroundVideoTrackMissing : StoryExportError("backgroundAssetVideoTrackMissing")
    public data object SessionCreationFailed : StoryExportError("sessionCreationFailed")
    public data class ExportFailed(val reason: String) : StoryExportError("exportFailed: $reason")
    public data object ExportCancelled : StoryExportError("exportCancelled")
    public data class SyntheticAssetGenerationFailed(val reason: String) :
        StoryExportError("syntheticAssetGenerationFailed: $reason")
}
