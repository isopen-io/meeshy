package me.meeshy.sdk.media.scene

import java.io.File
import me.meeshy.sdk.model.scene.export.StoryExportOverlayFrame
import me.meeshy.sdk.model.scene.export.StoryExportOverlayTrack

/** Une source de ce que la vidéo rendue doit montrer à un instant : on en mesure la luminance avant de relire le rendu. */
internal sealed interface SceneContentProbe {
    val label: String

    /** Une image tenue (fond vierge d'une slide, dernière image d'une vidéo, carte d'intro ou de fin). */
    data class Picture(val file: File) : SceneContentProbe {
        override val label: String get() = "l'image ${file.name}"
    }

    /** L'image d'une vidéo de fond à [atMillis] de son propre fichier. */
    data class VideoFrame(val file: File, val atMillis: Long) : SceneContentProbe {
        override val label: String get() = "la vidéo ${file.name} à $atMillis ms"
    }

    /** Le calque des objets que le moteur pose à cet instant. */
    data class Layer(val overlay: SceneExportOverlay) : SceneContentProbe {
        override val label: String get() = "le calque des objets de ${overlay.startMillis} à ${overlay.endMillis} ms"
    }

    /** Une carte de marque à son opacité de l'instant. */
    data class Card(val file: File, val alpha: Float) : SceneContentProbe {
        override val label: String get() = "la carte ${file.name}"
    }
}

/**
 * Un instant relu : la luminance la plus haute que ses sources promettent ([expected], par [promisedBy]) et celle que la
 * vidéo rendue montre ([rendered] ; `null` : l'image ne se relit pas).
 */
internal data class SceneContentSample(val atMillis: Long, val expected: Int, val promisedBy: String?, val rendered: Int?)

/**
 * **UN EXPORT NE DIT « ENREGISTRÉ » QUE POUR UN FICHIER QUI MONTRE SA SCÈNE** (#13986) : le S8 a reçu une vidéo de 12 s
 * entièrement noire, annoncée enregistrée. La vidéo rendue se relit donc à quelques instants, et chaque instant est
 * confronté à ce que ses sources promettent — le fond, la vidéo de fond, le calque des objets, les cartes de marque.
 * Une story noire reste exportable ; un rendu noir là où une source se voit est un échec, qui se dit.
 */
internal object SceneExportContent {
    /** Sur 0–255 : au-dessus, un pixel se voit ; un noir encodé reste en dessous, un bleu nuit passe au-dessus. */
    const val VISIBLE_LUMA: Int = 8
    const val SAMPLES: Int = 6

    /** Les instants relus : le milieu de [count] tranches égales de la vidéo rendue. */
    fun sampleTimes(totalMillis: Long, count: Int = SAMPLES): List<Long> =
        if (totalMillis <= 0L) emptyList() else (0 until count).map { totalMillis * (2 * it + 1) / (2L * count) }

    /** Ce que la vidéo rendue doit montrer à [atMillis] de son horloge commune, comme le moteur le pose. */
    fun expectedAt(job: SceneExportJob, planned: SceneComposition, atMillis: Long): List<SceneContentProbe> =
        listOfNotNull(fillAt(planned.video, atMillis), layerAt(job.overlays, atMillis)) +
            planned.brandLayers.mapNotNull { layer -> layer.alphaAt(atMillis).takeIf { it > 0f }?.let { SceneContentProbe.Card(layer.file, it) } }

    /** Le pixel le plus lumineux, son opacité comprise (un calque transparent ne promet rien). */
    fun maxLuma(pixels: IntArray): Int = pixels.maxOfOrNull(::luma) ?: 0

    fun luma(argb: Int): Int {
        val alpha = argb ushr ALPHA_SHIFT and CHANNEL
        val red = argb shr RED_SHIFT and CHANNEL
        val green = argb shr GREEN_SHIFT and CHANNEL
        val blue = argb and CHANNEL
        return (RED_WEIGHT * red + GREEN_WEIGHT * green + BLUE_WEIGHT * blue) / WEIGHTS * alpha / CHANNEL
    }

    /**
     * `null` : le rendu montre ce que ses sources promettent ; sinon, la cause de l'échec. Chaque instant compte : une scène
     * noire au milieu d'autres qui se voient est un échec, pas un demi-succès. Un instant qui ne se relit pas n'accuse rien ;
     * aucun instant relu, et le contenu n'est pas garanti.
     */
    fun verdict(samples: List<SceneContentSample>): String? {
        val promised = samples.filter { it.expected > VISIBLE_LUMA }
        if (promised.isEmpty()) return null
        if (samples.none { it.rendered != null }) return "la vidéo rendue ne se relit pas (${samples.size} instants) : son contenu n'est pas garanti"
        val black = promised.filter { sample -> sample.rendered?.let { it <= VISIBLE_LUMA } == true }
        val first = black.firstOrNull() ?: return null
        return "la vidéo rendue est noire à ${black.size} instant(s) sur ${samples.size} : ${first.promisedBy} se voit à ${first.atMillis} ms " +
            "(luminance ${first.expected}), le rendu n'y montre rien"
    }

    private fun fillAt(items: List<SceneVideoItem>, atMillis: Long): SceneContentProbe? {
        val starts = items.runningFold(0L) { start, item -> start + spanOf(item) }
        val index = items.indices.lastOrNull { starts[it] <= atMillis } ?: return null
        val item = items[index]
        val clip = item.clip ?: return SceneContentProbe.Picture(item.file)
        return SceneContentProbe.VideoFrame(item.file, clip.startMillis + (atMillis - starts[index]).coerceAtMost(clip.durationMillis))
    }

    private fun spanOf(item: SceneVideoItem): Long = item.clip?.durationMillis ?: item.imageMillis ?: 0L

    /** Le calque que [TimedBitmapOverlay] sert à cet instant : celui qui le couvre, le dernier au-delà, le premier avant. */
    private fun layerAt(overlays: List<SceneExportOverlay>, atMillis: Long): SceneContentProbe? {
        if (overlays.isEmpty()) return null
        val index = StoryExportOverlayTrack(overlays.map { StoryExportOverlayFrame(it.startMillis, it.endMillis) }).indexAt(atMillis)
        return SceneContentProbe.Layer(overlays[index.coerceAtLeast(0)])
    }

    private const val CHANNEL = 0xFF
    private const val ALPHA_SHIFT = 24
    private const val RED_SHIFT = 16
    private const val GREEN_SHIFT = 8
    private const val RED_WEIGHT = 2126
    private const val GREEN_WEIGHT = 7152
    private const val BLUE_WEIGHT = 722
    private const val WEIGHTS = 10_000
}
