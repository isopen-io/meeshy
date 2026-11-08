package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StorySourceWindow
import me.meeshy.sdk.model.StorySourceWindowMs
import me.meeshy.sdk.model.StoryMediaCrop
import me.meeshy.sdk.model.StoryMediaObject
import kotlin.math.ceil

/**
 * Les règles PURES du calque média de premier plan (miroir de `StoryMediaLayerRules`, iOS) : quelle source peindre,
 * quelle adresse est jouable sur CET appareil, rognage et fenêtre de source (non destructifs), volume effectif.
 */
public object SceneMediaLayerRules {

    /** Ce que la couche peint : le bitmap du composeur (retouche), l'adresse, ou rien. */
    public sealed interface ImageSource {
        public data object MemoryBitmap : ImageSource
        public data class Remote(val url: String) : ImageSource
        public data object None : ImageSource
    }

    /**
     * Le bitmap en mémoire (image retouchée du composeur) PRIME sur l'adresse : la nouvelle version remplace l'ancienne
     * sans trou et sans ancienne image. Sans bitmap, l'adresse ; sans adresse, rien ne se peint (élément ignoré).
     */
    public fun imageSource(media: StoryMediaObject, resolvedUrl: String?, hasMemoryBitmap: Boolean): ImageSource = when {
        hasMemoryBitmap -> ImageSource.MemoryBitmap
        resolvedUrl != null -> ImageSource.Remote(resolvedUrl)
        else -> ImageSource.None
    }

    /**
     * L'adresse jouable : celle du serveur d'abord, puis `mediaURL`. Chez le LECTEUR, un `file://` n'est honoré que s'il
     * existe sur CET appareil (sinon c'est le bac à sable de l'auteur) ; dans le composeur, il est le média voulu.
     */
    public fun playableUrl(serverUrl: String?, mediaUrl: String?, isReader: Boolean, fileExists: (String) -> Boolean): String? {
        serverUrl?.takeIf { it.isNotBlank() }?.let { return it }
        val url = mediaUrl?.takeIf { it.isNotBlank() } ?: return null
        if (isReader && url.startsWith(FILE_SCHEME) && !fileExists(url)) return null
        return url
    }

    /** Le rognage rectangulaire borné ; `null` (cadre entier) quand il n'y en a pas ou qu'il couvre tout. */
    public fun crop(media: StoryMediaObject): StoryMediaCrop? {
        val crop = media.crop ?: return null
        if (crop.isFull) return null
        return StoryMediaCrop.clamped(crop).takeUnless { it.isFull }
    }

    /** La fenêtre de lecture dans la source d'une VIDÉO ; `null` : la source entière. */
    public fun sourceWindow(media: StoryMediaObject): StorySourceWindowMs? {
        if (media.kind != me.meeshy.sdk.model.StoryMediaKind.VIDEO) return null
        return StorySourceWindow.clippingMs(media.sourceStart, media.sourceEnd)
    }

    /** Le gain appliqué au lecteur : volume d'auteur borné, ou silence sous le mute global / son verrou. */
    public fun playbackVolume(media: StoryMediaObject, globalMuted: Boolean, muteLocked: Boolean): Float =
        if (globalMuted || muteLocked) 0f else StoryVolume.clamp(media.volume)

    /** GIF et APNG se décodent par le décodeur animé. */
    public fun isAnimated(url: String?): Boolean {
        val path = url?.substringBefore('?')?.substringBefore('#')?.lowercase() ?: return false
        return ANIMATED_SUFFIXES.any(path::endsWith)
    }

    /** Le grand côté à décoder pour un cadre de [frameWidthPx] : la source entière derrière un rognage, jamais au-delà de 1080. */
    public fun decodeEdge(frameWidthPx: Int, crop: StoryMediaCrop?): Int {
        val fraction = crop?.width?.takeIf { it > 0.0 } ?: 1.0
        val needed = ceil(frameWidthPx / fraction).toInt().coerceAtLeast(1)
        return minOf(needed, SceneMediaLoader.MAX_DECODE_EDGE)
    }

    private const val FILE_SCHEME = "file:"
    private val ANIMATED_SUFFIXES = listOf(".gif", ".apng")
}
