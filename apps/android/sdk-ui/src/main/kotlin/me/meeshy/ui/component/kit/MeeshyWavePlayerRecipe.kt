package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable
import java.util.Locale
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.pow

/** Les deux tailles du lecteur : `Row` (60 / 40) et `Compact` (44 / 28) (K35). */
public enum class MeeshyWavePlayerSize { Row, Compact }

/** Les phases que l'hôte déclare ; la lecture et le glissement viennent des valeurs. */
public enum class MeeshyWavePlayerPhase { Ready, Buffering, Unavailable }

/** Ce que la durée montre pendant la lecture. Au repos, toujours le total. */
public enum class MeeshyWavePlayerClock { Remaining, Elapsed, Total }

/** Les sept états lisibles : la forme ne change pas, le glyphe et un mot le disent. */
public enum class MeeshyWavePlayerState { Rest, Playing, Paused, Buffering, Scrubbing, Finished, Unavailable }

/** Le glyphe du disque : lire, mettre en pause, rejouer. */
public enum class MeeshyWavePlayerGlyph { Play, Pause, Replay }

/**
 * **La loi des barres** (K35) : l'UNE mesure de l'onde, partagée par le lecteur des vocaux, l'échantillon de voix et les
 * sons de story. Une barre tous les 6 dp au plus, jamais de barre sous 3 de haut, une courbe perceptive qui relève les
 * passages calmes. Miroir de `MeeshyWaveBarsLaw` (iOS).
 */
public object MeeshyWaveBarsLaw {
    public const val BAR_WIDTH_DP: Float = 3f
    public const val BAR_GAP_DP: Float = 3f
    public const val PITCH_DP: Float = BAR_WIDTH_DP + BAR_GAP_DP
    public const val MINIMUM_BAR_HEIGHT_DP: Float = 3f
    public const val UPCOMING_OPACITY: Float = 0.3f
    private const val CURVE: Double = 0.5
    private const val ROUND_HALF: Double = 0.5
    private const val EPSILON: Double = 1e-9

    /** Le nombre de barres : une par pas de 6 dp, une au moins. */
    public fun barCount(widthDp: Float): Int = if (!widthDp.isFinite()) 1 else max(1, floor(widthDp / PITCH_DP).toInt())

    /**
     * Les niveaux ramenés au nombre de barres, de 0 à 1. Sans niveaux : barres plates, jamais une onde inventée. Plus de
     * niveaux que de barres : la moyenne du paquet.
     */
    public fun resample(samples: List<Float>, widthDp: Float): List<Double> {
        val count = barCount(widthDp)
        if (samples.isEmpty()) return List(count) { 0.0 }
        return List(count) { bar ->
            val start = bar * samples.size / count
            val end = max(start + 1, (bar + 1) * samples.size / count)
            samples.subList(start, minOf(end, samples.size)).map { normalized(it.toDouble()) }.average()
        }
    }

    internal fun normalized(value: Double): Double = if (value.isFinite()) value.coerceIn(0.0, 1.0) else 0.0

    /** La hauteur d'une barre dans une bande : la courbe, jamais sous 3. */
    public fun height(normalized: Double, maxHeightDp: Float): Float {
        if (!normalized.isFinite()) return MINIMUM_BAR_HEIGHT_DP
        return max(MINIMUM_BAR_HEIGHT_DP, (normalized(normalized).pow(CURVE) * maxHeightDp).toFloat())
    }

    /** Les barres pleines : une barre est jouée quand son centre est atteint ; le nombre ne dépend que de [progress]. */
    public fun filledBars(count: Int, progress: Double): Int {
        if (count <= 0) return 0
        return minOf(count, floor(normalized(progress) * count + ROUND_HALF + EPSILON).toInt())
    }

    /** Pendant un glissement l'onde suit le doigt et ignore le `progress` reçu. */
    public fun displayedProgress(progress: Double, scrubFraction: Double?): Double = normalized(scrubFraction ?: progress)

    /** La fraction visée : bornée de 0 à 1, reflétée en lecture de droite à gauche. */
    public fun scrubFraction(locationX: Float, widthDp: Float, isRtl: Boolean): Double {
        if (widthDp <= 0f || !locationX.isFinite()) return 0.0
        val fraction = (locationX.coerceIn(0f, widthDp) / widthDp).toDouble()
        return if (isRtl) 1.0 - fraction else fraction
    }
}

/** Le début d'un mouvement de glissement : le nouvel état et si le glissement commence. */
public data class MeeshyWaveScrubMove(val law: MeeshyWaveScrubLaw, val began: Boolean)

/** La fin d'un glissement : le nouvel état, la fraction à remettre (si le lecteur l'accepte encore) et si un glissement se ferme. */
public data class MeeshyWaveScrubEnd(val law: MeeshyWaveScrubLaw, val commit: Double?, val ended: Boolean)

/**
 * **La loi du glissement** : il commence au premier mouvement, remet sa fraction au relâcher, et se FERME toujours — même
 * quand le lecteur a cessé d'accepter le geste en cours de route, même quand le geste est annulé ou la vue quittée. Sans
 * cela l'onde resterait figée sous le doigt et l'hôte croirait le glissement en cours.
 */
public data class MeeshyWaveScrubLaw(val fraction: Double? = null) {
    public fun move(to: Double): MeeshyWaveScrubMove =
        MeeshyWaveScrubMove(MeeshyWaveScrubLaw(MeeshyWaveBarsLaw.normalized(to)), began = fraction == null)

    public fun finish(at: Double, accepts: Boolean): MeeshyWaveScrubEnd =
        MeeshyWaveScrubEnd(MeeshyWaveScrubLaw(), commit = if (accepts) MeeshyWaveBarsLaw.normalized(at) else null, ended = fraction != null)

    /** Geste annulé ou vue quittée : rien n'est remis ; `ended` si un glissement se ferme. */
    public fun cancel(): MeeshyWaveScrubEnd = MeeshyWaveScrubEnd(MeeshyWaveScrubLaw(), commit = null, ended = fraction != null)
}

@Immutable
public data class MeeshyWavePlayerValues(
    val phaseState: MeeshyWavePlayerState,
    val discDiameterDp: Float,
    val glyphSizeDp: Float,
    val waveHeightDp: Float,
    val rowHeightDp: Float,
    val gapDp: Float,
    val glyph: MeeshyWavePlayerGlyph,
    val showsRing: Boolean,
    val acceptsToggle: Boolean,
    val acceptsScrub: Boolean,
    val scrubZoneHeightDp: Float,
    val pressedScale: Float,
    val scrubScale: Float,
    val upcomingOpacity: Float,
    val barsAreLive: Boolean,
    val opacity: Float,
)

/** **La recette de K35 en VALEURS** : disque, glyphe, onde, écart, état lisible, échelles, opacités. Aucune couleur. */
public object MeeshyWavePlayerRecipe {
    private const val UNAVAILABLE_OPACITY: Float = 0.4f
    private const val SECONDS_PER_MINUTE: Int = 60

    @Suppress("LongParameterList")
    public fun resolve(
        size: MeeshyWavePlayerSize,
        phase: MeeshyWavePlayerPhase,
        isPlaying: Boolean,
        progress: Double,
        isScrubbing: Boolean,
        isEnabled: Boolean,
        reduceMotion: Boolean,
    ): MeeshyWavePlayerValues {
        val state = resolveState(phase, isPlaying, progress, isScrubbing)
        val acts = isEnabled && phase == MeeshyWavePlayerPhase.Ready
        val isRow = size == MeeshyWavePlayerSize.Row
        return MeeshyWavePlayerValues(
            phaseState = state,
            discDiameterDp = if (isRow) 60f else 44f,
            glyphSizeDp = if (isRow) 22f else 18f,
            waveHeightDp = if (isRow) 40f else 28f,
            rowHeightDp = if (isRow) 60f else 44f,
            gapDp = if (isRow) 14f else 10f,
            glyph = glyph(state),
            showsRing = phase == MeeshyWavePlayerPhase.Buffering,
            acceptsToggle = acts,
            acceptsScrub = acts,
            scrubZoneHeightDp = 44f,
            pressedScale = 0.94f,
            scrubScale = 1.12f,
            upcomingOpacity = MeeshyWaveBarsLaw.UPCOMING_OPACITY,
            barsAreLive = isPlaying && !reduceMotion && phase == MeeshyWavePlayerPhase.Ready,
            opacity = if (phase == MeeshyWavePlayerPhase.Unavailable || !isEnabled) UNAVAILABLE_OPACITY else 1f,
        )
    }

    private fun resolveState(phase: MeeshyWavePlayerPhase, isPlaying: Boolean, progress: Double, isScrubbing: Boolean): MeeshyWavePlayerState =
        when (phase) {
            MeeshyWavePlayerPhase.Unavailable -> MeeshyWavePlayerState.Unavailable
            MeeshyWavePlayerPhase.Buffering -> MeeshyWavePlayerState.Buffering
            MeeshyWavePlayerPhase.Ready -> when {
                isScrubbing -> MeeshyWavePlayerState.Scrubbing
                isPlaying -> MeeshyWavePlayerState.Playing
                progress >= 1.0 -> MeeshyWavePlayerState.Finished
                progress > 0.0 -> MeeshyWavePlayerState.Paused
                else -> MeeshyWavePlayerState.Rest
            }
        }

    private fun glyph(state: MeeshyWavePlayerState): MeeshyWavePlayerGlyph = when (state) {
        MeeshyWavePlayerState.Playing -> MeeshyWavePlayerGlyph.Pause
        MeeshyWavePlayerState.Finished -> MeeshyWavePlayerGlyph.Replay
        else -> MeeshyWavePlayerGlyph.Play
    }

    /** Le texte de la durée : le temps restant en lecture, le total au repos, « –:–– » sans durée connue. */
    public fun clockText(duration: Double, progress: Double, isPlaying: Boolean, clock: MeeshyWavePlayerClock): String {
        if (!duration.isFinite() || duration <= 0.0) return "–:––"
        val fraction = MeeshyWaveBarsLaw.normalized(progress)
        if (!isPlaying) return minutesAndSeconds(Math.round(duration).toDouble())
        return when (clock) {
            MeeshyWavePlayerClock.Remaining -> minutesAndSeconds(kotlin.math.ceil(duration * (1 - fraction)))
            MeeshyWavePlayerClock.Elapsed -> minutesAndSeconds(Math.round(duration * fraction).toDouble())
            MeeshyWavePlayerClock.Total -> minutesAndSeconds(Math.round(duration).toDouble())
        }
    }

    private fun minutesAndSeconds(seconds: Double): String {
        val total = max(seconds, 0.0).toInt()
        return String.format(Locale.ROOT, "%d:%02d", total / SECONDS_PER_MINUTE, total % SECONDS_PER_MINUTE)
    }
}
