package me.meeshy.sdk.model.scene.export

/** Où lire un visuel à l'export. */
public sealed class StoryExportVisualSource {
    /** Bitmap déjà en mémoire (retouches comprises) : prime sur toute adresse. */
    public data class InMemory(val key: String) : StoryExportVisualSource()
    public data class Remote(val url: String) : StoryExportVisualSource()
    public data class Local(val path: String) : StoryExportVisualSource()
    public data object Unresolvable : StoryExportVisualSource()
}

/**
 * Ce que le moteur d'export reçoit À CÔTÉ de la slide (miroir de `StoryExportInputs` iOS) :
 * adresses des stickers, clés des images en mémoire, fichiers audio de session, clés des octets
 * animés. Les bitmaps eux-mêmes restent côté plateforme.
 */
public data class StoryExportInputs(
    val stickerImageSources: Map<String, String> = emptyMap(),
    val inMemoryImageKeys: Set<String> = emptySet(),
    val audioFiles: Map<String, String> = emptyMap(),
    val animationKeys: Set<String> = emptySet(),
) {
    public fun audioFile(audioId: String): String? = audioFiles[audioId]

    public fun resolveVisual(
        key: String,
        rawAddress: String?,
        serverBase: String?,
        fileExists: (String) -> Boolean,
    ): StoryExportVisualSource {
        if (key in inMemoryImageKeys) return StoryExportVisualSource.InMemory(key)
        return resolveAddress(rawAddress, serverBase, fileExists)
    }

    public companion object {
        public val None: StoryExportInputs = StoryExportInputs()
        private const val FILE_SCHEME = "file://"
        private const val RELATIVE_PREFIX = "/api/v1/"

        public fun resolveAddress(
            rawAddress: String?,
            serverBase: String?,
            fileExists: (String) -> Boolean,
        ): StoryExportVisualSource {
            val raw = rawAddress?.trim().orEmpty()
            return when {
                raw.isEmpty() -> StoryExportVisualSource.Unresolvable
                raw.startsWith(FILE_SCHEME, ignoreCase = true) -> {
                    val path = raw.substring(FILE_SCHEME.length)
                    if (path.isNotEmpty() && fileExists(path)) StoryExportVisualSource.Local(path)
                    else StoryExportVisualSource.Unresolvable
                }
                raw.startsWith("https://", ignoreCase = true) || raw.startsWith("http://", ignoreCase = true) ->
                    StoryExportVisualSource.Remote(raw)
                raw.startsWith(RELATIVE_PREFIX) -> {
                    val base = serverBase?.trim()?.trimEnd('/').orEmpty()
                    if (base.startsWith("http", ignoreCase = true)) StoryExportVisualSource.Remote(base + raw)
                    else StoryExportVisualSource.Unresolvable
                }
                else -> StoryExportVisualSource.Unresolvable
            }
        }
    }
}
