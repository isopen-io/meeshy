package me.meeshy.sdk.model.audioedit

/**
 * La géométrie du rognage audio — pure, sans vue ni lecteur. Miroir d'`AudioTrimGeometry`
 * (iOS). [width] est la largeur VISIBLE de la bande ; [zoom] vaut 1 quand la durée entière
 * y tient. `offset` est toujours dans `[0, contentWidth - width]`.
 */
public class AudioTrimGeometry(duration: Double, width: Float, zoom: Float) {
    public val duration: Double = maxOf(0.001, duration)
    public val width: Float = maxOf(1f, width)
    public val zoom: Float = zoom.coerceIn(ZOOM_MIN, ZOOM_MAX)

    public val contentWidth: Float get() = this.width * this.zoom
    public val maximumOffset: Float get() = maxOf(0f, contentWidth - this.width)
    public val pointsPerSecond: Float get() = contentWidth / this.duration.toFloat()

    public fun x(time: Double, offset: Float): Float =
        time.coerceIn(0.0, duration).toFloat() * pointsPerSecond - offset

    public fun time(x: Float, offset: Float): Double =
        ((x + offset) / pointsPerSecond).toDouble().coerceIn(0.0, duration)

    public fun clampedOffset(offset: Float): Float = offset.coerceIn(0f, maximumOffset)

    /** Le décalage qui place [time] au centre de la bande. */
    public fun offsetCentering(time: Double): Float =
        clampedOffset(time.coerceIn(0.0, duration).toFloat() * pointsPerSecond - width / 2f)

    /** Applique un zoom en gardant l'instant du centre sous le centre. */
    public fun zoomed(to: Float, offset: Float): Pair<AudioTrimGeometry, Float> {
        val centre = time(width / 2f, offset)
        val next = AudioTrimGeometry(duration, width, to)
        return next to next.offsetCentering(centre)
    }

    /** Début déplacé : jamais au-delà de la fin moins le minimum, jamais avant zéro. */
    public fun movedStart(to: Double, end: Double): Double =
        to.coerceAtLeast(0.0).coerceAtMost(maxOf(0.0, end - MINIMUM_SEGMENT))

    /** Fin déplacée : jamais avant le début plus le minimum, jamais au-delà de la durée. */
    public fun movedEnd(to: Double, start: Double): Double =
        maxOf(minOf(duration, to), minOf(duration, start + MINIMUM_SEGMENT))

    /** Intervalle ramené dans la piste, dans l'ordre, jamais plus court que le minimum. */
    public fun clampedRange(range: ClosedFloatingPointRange<Double>): ClosedFloatingPointRange<Double> {
        if (duration <= MINIMUM_SEGMENT) return 0.0..duration
        val start = range.start.coerceIn(0.0, duration - MINIMUM_SEGMENT)
        val end = maxOf(minOf(duration, range.endInclusive), start + MINIMUM_SEGMENT)
        return start..end
    }

    override fun equals(other: Any?): Boolean =
        other is AudioTrimGeometry && other.duration == duration && other.width == width && other.zoom == zoom

    override fun hashCode(): Int = (duration.hashCode() * 31 + width.hashCode()) * 31 + zoom.hashCode()

    public companion object {
        public const val MINIMUM_SEGMENT: Double = 0.25
        public const val ZOOM_MIN: Float = 1f
        public const val ZOOM_MAX: Float = 40f
    }
}
