package me.meeshy.sdk.model.media

/**
 * **Le fichier qu'un export Media3 écrit** (#14567).
 *
 * - [ensureStartsOnVideoFrame] : une vidéo commence sur une image ; le son qui la devancerait est retiré, sinon le
 *   lecteur d'iOS montre du noir jusqu'à la première image (androidx/media #829).
 * - [streamable] : un fichier publié porte son index en tête et se lit pendant qu'il arrive.
 * - [platformDiagnostics] : jamais, tant que la décision du porteur (#14584) ne l'autorise pas — Media3 rapporte sinon
 *   les sessions d'édition à `MediaMetricsManager` dès Android 15.
 */
public data class ExportContainerPolicy(
    val ensureStartsOnVideoFrame: Boolean,
    val platformDiagnostics: Boolean,
    val streamable: Boolean,
) {
    public companion object {
        public fun of(hasVideo: Boolean, publishes: Boolean): ExportContainerPolicy = ExportContainerPolicy(
            ensureStartsOnVideoFrame = hasVideo,
            platformDiagnostics = false,
            streamable = publishes,
        )
    }
}
