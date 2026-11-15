package me.meeshy.sdk.model.fullscreen

/**
 * La ligne d'informations d'un média plein écran : `L × H · poids · durée`
 * (miroir de `MediaInfoLine.swift`, #9577). Un segment absent ne laisse aucun séparateur orphelin.
 */
public object MediaInfoLine {

    public sealed interface Segment {
        public data class Dimensions(val text: String) : Segment
        public data class FileSize(val text: String) : Segment

        /** La durée se rend par l'hôte : elle bouge, les deux autres non. */
        public data object Duration : Segment
    }

    public const val SEPARATOR: String = " · "

    public fun segments(width: Int?, height: Int?, fileSizeLabel: String?, hasDuration: Boolean): List<Segment> =
        buildList {
            if (width != null && height != null && width > 0 && height > 0) add(Segment.Dimensions("$width × $height"))
            if (!fileSizeLabel.isNullOrEmpty()) add(Segment.FileSize(fileSizeLabel))
            if (hasDuration) add(Segment.Duration)
        }

    public fun text(segments: List<Segment>, durationLabel: String?): String =
        segments.mapNotNull {
            when (it) {
                is Segment.Dimensions -> it.text
                is Segment.FileSize -> it.text
                Segment.Duration -> durationLabel
            }
        }.joinToString(SEPARATOR)

    /** Temps restant pendant la lecture, durée totale à l'arrêt. Jamais négatif. */
    public fun displayedDuration(total: Double, elapsed: Double, isPlaying: Boolean): Double {
        if (!isPlaying || !elapsed.isFinite()) return maxOf(0.0, total)
        return maxOf(0.0, total - maxOf(0.0, elapsed))
    }

    /** La durée du moteur dès qu'il la connaît ; d'ici là, celle que le média déclare. */
    public fun totalDuration(engine: Double, declared: Double): Double =
        if (engine.isFinite() && engine > 0) engine else maxOf(0.0, declared)
}
