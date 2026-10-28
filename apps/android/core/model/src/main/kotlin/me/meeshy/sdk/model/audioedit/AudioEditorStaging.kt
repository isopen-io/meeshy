package me.meeshy.sdk.model.audioedit

import kotlin.math.abs

/** La disposition de l'éditeur — miroir d'`AudioEditorMode` (iOS) : Simple (rogner, transcrire) ou Pro (tout). */
public enum class AudioEditorMode { SIMPLE, PRO }

/** Un outil contextuel de l'éditeur — miroir d'`AudioEditorTool` (iOS) ; chacun arme au plus une opération. */
public enum class AudioEditorTool(public val producesVersion: Boolean = true) {
    TRIM, SPLIT, FADE, SPEED, VOLUME, TRANSCRIBE(producesVersion = false);

    public companion object {
        private val SIMPLE_TOOLS = listOf(TRIM, TRANSCRIBE)

        public fun available(mode: AudioEditorMode): List<AudioEditorTool> =
            if (mode == AudioEditorMode.SIMPLE) SIMPLE_TOOLS else entries
    }
}

/** Le genre d'une version du journal, que l'écran traduit en libellé et en icône. */
public enum class AudioEditHistoryKind { ORIGINAL, TRIM, REMOVE_RANGE, FADE, SPEED, GAIN }

public val AudioEditOperation.historyKind: AudioEditHistoryKind
    get() = when (this) {
        AudioEditOperation.Original -> AudioEditHistoryKind.ORIGINAL
        is AudioEditOperation.Trim -> AudioEditHistoryKind.TRIM
        is AudioEditOperation.RemoveRange -> AudioEditHistoryKind.REMOVE_RANGE
        is AudioEditOperation.Fade -> AudioEditHistoryKind.FADE
        is AudioEditOperation.Speed -> AudioEditHistoryKind.SPEED
        is AudioEditOperation.Gain -> AudioEditHistoryKind.GAIN
    }

/**
 * Les paramètres armés par l'outil actif — la part pure de `AudioEditorController` (iOS). Valeur immuable :
 * chaque geste rend un nouvel état, l'opération à cuire se déduit sans effet de bord.
 */
public data class AudioEditorStaging(
    val mode: AudioEditorMode = AudioEditorMode.SIMPLE,
    val tool: AudioEditorTool? = null,
    val trimStart: Double = 0.0,
    val trimEnd: Double = 0.0,
    val splitStart: Double = 0.0,
    val splitEnd: Double = 0.0,
    val fadeIn: Boolean = false,
    val fadeOut: Boolean = false,
    val speed: Double = 1.0,
    val gain: Double = 1.0,
) {
    public val availableTools: List<AudioEditorTool> get() = AudioEditorTool.available(mode)

    /** Choisit (ou ferme, avec `null`) un outil et arme ses valeurs initiales sur la durée active. */
    public fun select(tool: AudioEditorTool?, duration: Double): AudioEditorStaging {
        if (tool == null) return copy(tool = null)
        val armed = resetFor(duration).copy(mode = mode)
        return armed.copy(tool = tool)
    }

    /** Toutes les valeurs ramenées à leur défaut sur [duration], outil fermé : après un changement de version. */
    public fun resetFor(duration: Double): AudioEditorStaging = AudioEditorStaging(
        mode = mode,
        tool = null,
        trimStart = 0.0,
        trimEnd = duration,
        splitStart = duration * SPLIT_FROM,
        splitEnd = duration * SPLIT_TO,
    )

    public fun withMode(next: AudioEditorMode): AudioEditorStaging {
        val stays = tool == null || tool in AudioEditorTool.available(next)
        return copy(mode = next, tool = if (stays) tool else null)
    }

    /** L'opération que l'outil actif cuirait, ou `null` quand rien de significatif n'est armé. */
    public fun pendingOperation(duration: Double): AudioEditOperation? = when (tool) {
        AudioEditorTool.TRIM -> AudioEditOperation.Trim(trimStart, trimEnd).takeIf { trimIsMeaningful(duration) }
        AudioEditorTool.SPLIT -> AudioEditOperation.RemoveRange(splitStart, splitEnd).takeIf { splitIsMeaningful(duration) }
        AudioEditorTool.FADE -> AudioEditOperation.Fade(fadeIn, fadeOut).takeIf { fadeIn || fadeOut }
        AudioEditorTool.SPEED -> AudioEditOperation.Speed(speed).takeIf { abs(speed - 1.0) > NEUTRAL_EPSILON }
        AudioEditorTool.VOLUME -> AudioEditOperation.Gain(gain).takeIf { abs(gain - 1.0) > NEUTRAL_EPSILON }
        AudioEditorTool.TRANSCRIBE, null -> null
    }

    public fun canApply(duration: Double, processing: Boolean): Boolean {
        if (processing) return false
        val operation = pendingOperation(duration) ?: return false
        return !operation.isIdentity
    }

    /** La fenêtre que l'aperçu boucle : la tranche gardée, seulement en rognant (couper s'écoute en entier). */
    public fun previewRegion(duration: Double): ClosedFloatingPointRange<Double>? =
        (trimStart..trimEnd).takeIf { tool == AudioEditorTool.TRIM && duration > 0 }

    /** La vitesse de l'aperçu : celle armée, seulement quand l'outil Vitesse est ouvert. */
    public val previewRate: Float get() = if (tool == AudioEditorTool.SPEED) speed.toFloat() else 1f

    /** Poignée de début déplacée à [fraction] (0..1) de [duration] ; sans effet hors rogner / couper. */
    public fun withSelectionStart(fraction: Double, duration: Double): AudioEditorStaging {
        if (duration <= 0) return this
        val value = fraction.coerceIn(0.0, 1.0) * duration
        return when (tool) {
            AudioEditorTool.TRIM -> copy(trimStart = minOf(value, trimEnd - MIN_TRIM))
            AudioEditorTool.SPLIT -> copy(splitStart = minOf(maxOf(0.0, value), splitEnd - MIN_SPLIT))
            else -> this
        }
    }

    /** Poignée de fin déplacée à [fraction] (0..1) de [duration] ; sans effet hors rogner / couper. */
    public fun withSelectionEnd(fraction: Double, duration: Double): AudioEditorStaging {
        if (duration <= 0) return this
        val value = fraction.coerceIn(0.0, 1.0) * duration
        return when (tool) {
            AudioEditorTool.TRIM -> copy(trimEnd = maxOf(value, trimStart + MIN_TRIM))
            AudioEditorTool.SPLIT -> copy(splitEnd = minOf(maxOf(value, splitStart + MIN_SPLIT), duration))
            else -> this
        }
    }

    private fun trimIsMeaningful(duration: Double): Boolean =
        trimEnd - trimStart >= MIN_TRIM && (trimStart > EDGE || trimEnd < duration - EDGE)

    private fun splitIsMeaningful(duration: Double): Boolean =
        splitEnd - splitStart >= MIN_SPLIT && splitStart >= 0 && splitEnd <= duration + 0.01

    public companion object {
        private const val SPLIT_FROM = 0.4
        private const val SPLIT_TO = 0.6
        private const val MIN_TRIM = 0.3
        private const val MIN_SPLIT = 0.2
        private const val EDGE = 0.05
        private const val NEUTRAL_EPSILON = 0.001

        public fun initial(duration: Double): AudioEditorStaging = AudioEditorStaging().resetFor(duration)
    }
}
