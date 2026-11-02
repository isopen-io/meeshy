package me.meeshy.sdk.model.audioedit

import kotlin.math.abs

/** Ce que le doigt a saisi sur la forme d'onde : une poignée de sélection ou la tête de lecture. */
public enum class AudioEditorWaveformGrab { SELECTION_START, SELECTION_END, SCRUB }

/**
 * Les lois pures de la forme d'onde de l'éditeur audio : sous-échantillonnage des niveaux en barres, saisie
 * des poignées, et couleur de chaque barre. Aucune vue, aucun lecteur — l'écran ne fait que dessiner.
 */
public object AudioEditorWaveformLaw {

    /** Barres d'un relevé vide : une ligne plate lisible, comme iOS (80 barres à 0,18). */
    public const val FALLBACK_BARS: Int = 80
    public const val FALLBACK_LEVEL: Float = 0.18f

    /**
     * Ramène [levels] (0..1, linéaires) à [barCount] barres : chaque barre prend le PIC de sa tranche, pour
     * qu'une consonne brève reste visible. Moins de niveaux que de barres : étirés sans interpolation.
     */
    public fun bars(levels: List<Float>, barCount: Int): FloatArray {
        val count = barCount.coerceAtLeast(1)
        val source = if (levels.isEmpty()) List(FALLBACK_BARS) { FALLBACK_LEVEL } else levels
        return FloatArray(count) { index ->
            val from = index * source.size / count
            val to = maxOf(from + 1, (index + 1) * source.size / count).coerceAtMost(source.size)
            var peak = 0f
            for (i in from until to) peak = maxOf(peak, source[i].coerceIn(0f, 1f))
            peak
        }
    }

    /**
     * Qui saisit le toucher à [fraction] ? La poignée la plus proche dans [slop] (fraction de la largeur) ;
     * à égalité, celle dont le côté éloigne le moins de l'autre ; sinon la tête de lecture. Sans sélection
     * ([start] ou [end] nuls), on ne fait que déplacer la tête.
     */
    public fun grab(fraction: Double, start: Double?, end: Double?, slop: Double): AudioEditorWaveformGrab {
        if (start == null || end == null) return AudioEditorWaveformGrab.SCRUB
        val toStart = abs(fraction - start)
        val toEnd = abs(fraction - end)
        if (minOf(toStart, toEnd) > slop) return AudioEditorWaveformGrab.SCRUB
        if (toStart == toEnd) {
            return if (fraction <= start) AudioEditorWaveformGrab.SELECTION_START else AudioEditorWaveformGrab.SELECTION_END
        }
        return if (toStart < toEnd) AudioEditorWaveformGrab.SELECTION_START else AudioEditorWaveformGrab.SELECTION_END
    }

    /** Le rôle d'une barre à la fraction [position], selon la sélection et la tête de lecture. */
    public fun role(position: Double, progress: Double, selection: AudioEditorSelection?): AudioEditorBarRole {
        val played = position <= progress
        if (selection == null) return if (played) AudioEditorBarRole.PLAYED else AudioEditorBarRole.IDLE
        val inside = position >= selection.start && position <= selection.end
        return when {
            selection.isRemoval -> if (inside) AudioEditorBarRole.REMOVED else if (played) AudioEditorBarRole.PLAYED else AudioEditorBarRole.IDLE
            !inside -> AudioEditorBarRole.OUTSIDE
            else -> if (played) AudioEditorBarRole.PLAYED else AudioEditorBarRole.KEPT
        }
    }
}

/** La sélection dessinée sur la forme d'onde, en fractions 0..1 ; [isRemoval] pour la section qu'on retire. */
public data class AudioEditorSelection(val start: Double, val end: Double, val isRemoval: Boolean)

/** La teinte d'une barre que l'écran traduit en couleur de jeton. */
public enum class AudioEditorBarRole { IDLE, PLAYED, KEPT, OUTSIDE, REMOVED }

/** La sélection que l'outil actif dessine, ou `null` hors rogner / couper. */
public fun AudioEditorStaging.selection(duration: Double): AudioEditorSelection? {
    if (duration <= 0) return null
    return when (tool) {
        AudioEditorTool.TRIM -> AudioEditorSelection(trimStart / duration, trimEnd / duration, isRemoval = false)
        AudioEditorTool.SPLIT -> AudioEditorSelection(splitStart / duration, splitEnd / duration, isRemoval = true)
        else -> null
    }
}
