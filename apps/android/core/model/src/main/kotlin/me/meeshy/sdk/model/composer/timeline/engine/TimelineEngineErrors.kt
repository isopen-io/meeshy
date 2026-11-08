package me.meeshy.sdk.model.composer.timeline.engine

/** Les échecs du moteur de montage (miroir de `StoryTimelineEngineError`). */
sealed class TimelineEngineError(message: String) : Exception(message) {
    data class AssetLoadFailed(val clipId: String, val reason: String) : TimelineEngineError("asset $clipId: $reason")
    data class AudioEngineUnavailable(val reason: String) : TimelineEngineError("audio: $reason")
    data class ConfigurationFailed(val reason: String) : TimelineEngineError("configuration: $reason")
    data object NoProjectConfigured : TimelineEngineError("aucun projet configuré")
}
