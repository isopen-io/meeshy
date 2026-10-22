package me.meeshy.sdk.model.media

/** Miroir d'[AudioAvailability] pour la vidéo (iOS `VideoAvailability`). */
public sealed interface VideoAvailability {
    public data object Ready : VideoAvailability
    public data object NeedsDownload : VideoAvailability

    public data class Downloading(
        val progress: Double,
        val downloadedBytes: Long = 0L,
        val totalBytes: Long = 0L,
    ) : VideoAvailability

    public companion object {
        public fun resolve(
            isLocalFile: Boolean,
            localFileExists: Boolean,
            isServerCached: Boolean,
        ): VideoAvailability =
            if (restingReady(isLocalFile, localFileExists, isServerCached)) Ready else NeedsDownload
    }
}
