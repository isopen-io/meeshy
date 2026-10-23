package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.call.FrameLuminance
import me.meeshy.sdk.model.media.ThumbHashImage

/** Le schéma que le chrome d'un média épingle : glyphe blanc (Dark) ou encre sombre (Light). */
enum class ChromeScheme { Dark, Light }

/**
 * Le média sur lequel un contrôle se pose : son empreinte (dans le modèle, sans réseau) et, à
 * défaut, l'adresse du bitmap que la surface a peut-être déjà en mémoire. [key] identifie le
 * MÉDIA — elle borne la mesure à une fois. Miroir de `MediaChromeBackdrop` (iOS).
 */
class MediaChromeBackdrop private constructor(
    val key: String,
    val thumbHash: String?,
    val bitmapUrl: String?,
) {
    override fun equals(other: Any?): Boolean =
        other is MediaChromeBackdrop && key == other.key && thumbHash == other.thumbHash && bitmapUrl == other.bitmapUrl

    override fun hashCode(): Int = (key.hashCode() * 31 + (thumbHash?.hashCode() ?: 0)) * 31 + (bitmapUrl?.hashCode() ?: 0)

    companion object {
        /** `null` quand il n'y a rien à échantillonner : le schéma reste le défaut, jamais une luminance inventée. */
        fun of(key: String, thumbHash: String?, bitmapUrl: String?): MediaChromeBackdrop? {
            val hash = thumbHash?.takeIf { it.isNotEmpty() }
            val url = bitmapUrl?.takeIf { it.isNotEmpty() }
            if (hash == null && url == null) return null
            return MediaChromeBackdrop(key, hash, url)
        }

        /** La page de la galerie : la pièce affichée. */
        fun attachment(attachment: ApiMessageAttachment): MediaChromeBackdrop? =
            of(
                key = attachment.id,
                thumbHash = attachment.thumbHash,
                bitmapUrl = attachment.thumbnailUrl ?: attachment.fileUrl.takeIf { isImage(attachment.mimeType) },
            )

        /** Un média de post : carte Réel du fil, lecteur de Réels, slide de story. */
        fun postMedia(media: ApiPostMedia): MediaChromeBackdrop? =
            of(
                key = media.id,
                thumbHash = media.thumbHash,
                bitmapUrl = media.thumbnailUrl ?: media.fileUrl.takeIf { isImage(media.mimeType) },
            )

        /**
         * La slide du lecteur de story : l'empreinte de la slide d'abord, celle du média de fond
         * ensuite ; la clé joint la slide et son fond.
         */
        fun storySlide(slideId: String, backgroundMediaId: String, slideThumbHash: String?, background: ApiPostMedia?): MediaChromeBackdrop? =
            of(
                key = "$slideId#$backgroundMediaId",
                thumbHash = slideThumbHash?.takeIf { it.isNotEmpty() } ?: background?.thumbHash,
                bitmapUrl = background?.let { it.thumbnailUrl ?: it.fileUrl.takeIf { _ -> isImage(it.mimeType) } },
            )

        private fun isImage(mimeType: String?): Boolean = mimeType?.startsWith("image/") == true
    }
}

/** Une luminance mesurée, et le média (ou la cellule) auquel elle appartient. */
data class MediaChromeSample(val key: String, val luminance: Double)

/**
 * Les lois de teinte du chrome posé sur un média. Miroir de `CanvasChromeScheme` +
 * `MediaChromeScheme` (iOS) : seuil média 0,35 (le verre ajoute du contraste), seuil du glyphe
 * NU 0,179 (équilibre WCAG), défaut Dark sans mesure.
 */
object MediaChromeScheme {
    /** Point d'équilibre des ratios WCAG blanc-vs-noir. */
    const val DARK_THRESHOLD: Double = 0.179

    /** Seuil d'un contrôle sur VERRE : au-dessus de l'équilibre pur, le verre frosté ajoute du contraste. */
    const val MEDIA_DARK_THRESHOLD: Double = 0.35

    /** Le schéma d'un contrôle sur verre, d'après la luminance du média entier. */
    fun forMedia(luminance: Double?): ChromeScheme =
        if (luminance == null || luminance < MEDIA_DARK_THRESHOLD) ChromeScheme.Dark else ChromeScheme.Light

    /** Le schéma d'un glyphe NU, d'après ce qu'il a sous lui. */
    fun forBareGlyph(luminance: Double?): ChromeScheme =
        if (luminance == null || luminance < DARK_THRESHOLD) ChromeScheme.Dark else ChromeScheme.Light

    /**
     * Le schéma d'un média : une mesure faite pour un AUTRE média n'entre pas (pendant un
     * feuilletage, la page qui arrive ne peint pas avec la luminance de la précédente).
     */
    fun scheme(backdrop: MediaChromeBackdrop?, sample: MediaChromeSample?): ChromeScheme =
        forMedia(sample?.takeIf { backdrop != null && it.key == backdrop.key }?.luminance)

    /** Le schéma d'un glyphe nu : une mesure faite pour une autre cellule n'entre pas. */
    fun glyphScheme(probe: MediaChromeProbe?, sample: MediaChromeSample?): ChromeScheme =
        forBareGlyph(sample?.takeIf { probe != null && it.key == probe.key }?.luminance)

    /** Luminance relative moyenne d'un raster RGBA, rééchantillonné en 8×8 (comme iOS). */
    fun averageRelativeLuminance(image: ThumbHashImage): Double? {
        if (image.width <= 0 || image.height <= 0 || image.rgba.size < image.width * image.height * 4) return null
        val side = 8
        var total = 0.0
        for (j in 0 until side) for (i in 0 until side) {
            total += pixelLuminance(image, (i + 0.5) / side, (j + 0.5) / side, 1.0)
        }
        return total / (side * side)
    }

    internal fun pixelLuminance(image: ThumbHashImage, u: Double, v: Double, keep: Double): Double {
        val x = (u * image.width).toInt().coerceIn(0, image.width - 1)
        val y = (v * image.height).toInt().coerceIn(0, image.height - 1)
        val o = (y * image.width + x) * 4
        fun channel(k: Int): Int = ((image.rgba[o + k].toInt() and 0xFF) * keep).toInt()
        return FrameLuminance.relativeLuminance(channel(0), channel(1), channel(2))
    }
}
