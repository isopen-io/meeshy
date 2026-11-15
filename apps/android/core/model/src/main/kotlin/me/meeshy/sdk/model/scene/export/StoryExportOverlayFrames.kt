package me.meeshy.sdk.model.scene.export

import kotlin.math.ceil
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryKeyframe

/** Un instant peint de la scène : le calque des objets tel qu'il est à [startMillis], tenu jusqu'à [endMillis]. */
public data class StoryExportOverlayFrame(val startMillis: Long, val endMillis: Long)

/** Les calques peints d'un export, bout à bout sur la timeline commune : lequel couvre un instant ? */
public class StoryExportOverlayTrack(public val frames: List<StoryExportOverlayFrame>) {

    /** L'index du calque qui couvre [timeMillis] ; au-delà du dernier, le dernier ; `-1` sans calque. */
    public fun indexAt(timeMillis: Long): Int {
        if (frames.isEmpty()) return -1
        var low = 0
        var high = frames.lastIndex
        while (low < high) {
            val middle = (low + high + 1) / 2
            if (frames[middle].startMillis <= timeMillis) low = middle else high = middle - 1
        }
        return low
    }
}

/**
 * **LES INSTANTS À PEINDRE D'UNE SLIDE** (#13872) — le calque des objets (textes, émojis, stickers, médias posés, lieux,
 * pastilles audio, dessin) ne change qu'aux bords des fenêtres de temps ; il se peint donc une fois par intervalle, et image
 * par image (au pas [MOTION_STEP_MILLIS]) seulement là où quelque chose BOUGE : fondus, images clés, stickers animés. Le
 * nombre de calques d'une slide reste borné ([MAX_FRAMES_PER_SLIDE]) : une longue animation s'échantillonne plus lâche.
 */
public object StoryExportOverlayFrames {
    public const val MOTION_STEP_MILLIS: Long = 125L
    public const val MAX_FRAMES_PER_SLIDE: Int = 240

    public fun of(effects: StoryEffects?, slideDurationMillis: Long): List<StoryExportOverlayFrame> {
        if (slideDurationMillis <= 0L) return emptyList()
        val windows = StoryExportMotion.windows(effects)
        val cuts = (listOf(0.0) + windows.flatMap { listOfNotNull(it.start, it.end) }).map(::millis)
        val ranges = windows.flatMap { it.motion(slideDurationMillis / MILLIS) }
            .map { millis(it.start).coerceIn(0L, slideDurationMillis) to millis(it.endInclusive).coerceIn(0L, slideDurationMillis) }
            .filter { (from, to) -> to > from }
        val motion = ranges.sumOf { (from, to) -> to - from }
        var step = maxOf(MOTION_STEP_MILLIS, ceil(motion / maxOf(1, MAX_FRAMES_PER_SLIDE - cuts.size).toDouble()).toLong())
        var starts = starts(cuts, ranges, step, slideDurationMillis)
        while (starts.size > MAX_FRAMES_PER_SLIDE) {
            step *= 2
            starts = starts(cuts, ranges, step, slideDurationMillis)
        }
        return starts.mapIndexed { index, start -> StoryExportOverlayFrame(start, starts.getOrElse(index + 1) { slideDurationMillis }) }
    }

    private fun starts(cuts: List<Long>, ranges: List<Pair<Long, Long>>, step: Long, duration: Long): List<Long> {
        val sampled = ranges.flatMap { (from, to) -> generateSequence(from) { it + step }.takeWhile { it <= to }.toList() }
        return (cuts + sampled).filter { it in 0 until duration }.distinct().sorted()
    }

    private fun millis(seconds: Double): Long = Math.round(seconds * MILLIS)

    private const val MILLIS = 1000.0
}

/** Ce qui, dans une slide, a une fenêtre de temps ou bouge — lu une fois pour la durée, l'image fixe et les instants peints. */
internal object StoryExportMotion {

    internal class Window(
        val start: Double,
        val end: Double?,
        private val fadeIn: Double,
        private val fadeOut: Double,
        private val keyframes: ClosedFloatingPointRange<Double>?,
        private val animated: Boolean,
    ) {
        val timed: Boolean get() = start > 0.0 || end != null || fadeIn > 0.0 || fadeOut > 0.0 || keyframes != null || animated

        fun motion(slideSeconds: Double): List<ClosedFloatingPointRange<Double>> = listOfNotNull(
            (start..start + fadeIn).takeIf { fadeIn > 0.0 },
            end?.let { (it - fadeOut)..it }?.takeIf { fadeOut > 0.0 },
            keyframes?.let { (start + it.start)..(start + it.endInclusive) },
            (start..(end ?: slideSeconds)).takeIf { animated },
        )
    }

    fun windows(effects: StoryEffects?): List<Window> {
        if (effects == null) return emptyList()
        val texts = effects.textObjects.map { window(it.startTime, it.duration, it.fadeIn, it.fadeOut, it.keyframes) }
        val stickers = effects.stickerObjects.orEmpty()
            .map { window(it.startTime, it.duration, it.fadeIn, it.fadeOut, null, animated = it.stickerAnimation != null) }
        val media = effects.mediaObjects.orEmpty().filterNot { it.isBackground }
            .map { window(it.startTime, it.duration, it.fadeIn, it.fadeOut, it.keyframes) }
        val places = effects.locationObjects.map { window(it.startTime, it.duration, null, null, null) }
        val chips = effects.audioPlayerObjects.orEmpty().filter { it.isBackground != true }
            .map { window(it.startTime?.toDouble(), it.duration?.toDouble(), it.fadeIn?.toDouble(), it.fadeOut?.toDouble(), null) }
        return texts + stickers + media + places + chips
    }

    /** La fin du dernier objet temporisé, en secondes de slide (0 sans objet borné). */
    fun timedEnd(effects: StoryEffects?): Double = windows(effects).mapNotNull { it.end }.maxOrNull() ?: 0.0

    /** La slide bouge : un objet temporisé, animé, ou une vidéo. */
    fun moves(effects: StoryEffects?): Boolean = effects != null &&
        (windows(effects).any { it.timed } || effects.mediaObjects.orEmpty().any { it.mediaType.equals("video", ignoreCase = true) })

    private fun window(
        start: Double?,
        duration: Double?,
        fadeIn: Double?,
        fadeOut: Double?,
        keyframes: List<StoryKeyframe>?,
        animated: Boolean = false,
    ): Window {
        val from = start?.takeIf { it.isFinite() }?.coerceAtLeast(0.0) ?: 0.0
        val visual = keyframes.orEmpty().filter { it.x != null || it.y != null || it.scale != null || it.opacity != null }
        val span = visual.takeIf { it.size > 1 }?.let { points -> points.minOf { it.time.toDouble() }..points.maxOf { it.time.toDouble() } }
        return Window(
            start = from,
            end = duration?.takeIf { it.isFinite() && it > 0.0 }?.let { from + it },
            fadeIn = fadeIn?.takeIf { it.isFinite() }?.coerceAtLeast(0.0) ?: 0.0,
            fadeOut = fadeOut?.takeIf { it.isFinite() }?.coerceAtLeast(0.0) ?: 0.0,
            keyframes = span?.takeIf { it.endInclusive > it.start },
            animated = animated,
        )
    }
}
