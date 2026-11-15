package me.meeshy.sdk.model.audioedit

/**
 * Les échecs typés d'une édition audio — miroir de `AudioEditError` (iOS). [code] est
 * l'identifiant stable que l'écran traduit en libellé localisé.
 */
public sealed class AudioEditError(public val code: String, message: String) : Exception(message) {
    public data object SourceUnreadable : AudioEditError("source_unreadable", "The audio file could not be read.")

    public data object NoAudioTrack : AudioEditError("no_audio_track", "The file contains no audio track.")

    public data object CompositionFailed : AudioEditError("composition_failed", "The edit could not be assembled.")

    public data object ResultTooShort : AudioEditError("result_too_short", "The result would be too short to keep.")

    public data object ExportUnavailable : AudioEditError("export_unavailable", "Audio export is unavailable on this device.")

    public class ExportFailed(public val reason: String) :
        AudioEditError("export_failed", "Audio export failed: $reason") {
        override fun equals(other: Any?): Boolean = other is ExportFailed && other.reason == reason
        override fun hashCode(): Int = reason.hashCode()
    }

    public data object Cancelled : AudioEditError("cancelled", "The edit was cancelled.")
}
