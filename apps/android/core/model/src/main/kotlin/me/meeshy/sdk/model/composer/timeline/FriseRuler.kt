package me.meeshy.sdk.model.composer.timeline

import java.util.Locale
import kotlin.math.floor
import kotlin.math.roundToInt

/**
 * La règle graduée de la frise (#14218, miroir de `ComposerSceneFriseRuler` iOS) : un pas MAJEUR choisi sur une
 * échelle lisible (1 s → 1 h) pour que deux libellés gardent au moins [LABEL_GAP_DP] entre eux et qu'il n'y en ait
 * jamais plus de douze, et des graduations mineures tant qu'elles restent à [MINOR_GAP_DP] l'une de l'autre.
 * Les largeurs sont en dp : la loi ignore la densité de l'écran.
 */
object FriseRuler {

    data class Tick(val time: Float, val isMajor: Boolean, val label: String?)

    private data class Step(val seconds: Float, val divisions: Int)

    private val scale = listOf(
        Step(1f, 5), Step(2f, 4), Step(5f, 5), Step(10f, 5), Step(15f, 3), Step(30f, 3),
        Step(60f, 4), Step(120f, 4), Step(300f, 5), Step(600f, 5), Step(900f, 3), Step(1800f, 3), Step(3600f, 4),
    )

    const val LABEL_GAP_DP: Float = 44f
    const val MINOR_GAP_DP: Float = 6f
    private const val MAX_LABELS: Float = 12f

    fun majorStep(duration: Float, widthDp: Float): Float = chosen(duration, widthDp).seconds

    fun ticks(duration: Float, widthDp: Float): List<Tick> {
        if (duration <= 0f || !duration.isFinite() || widthDp <= 0f) return emptyList()
        val step = chosen(duration, widthDp)
        val minor = step.seconds / step.divisions
        val withMinors = minor / duration * widthDp >= MINOR_GAP_DP
        val pitch = if (withMinors) minor else step.seconds
        val perMajor = if (withMinors) step.divisions else 1
        val count = floor(duration / pitch + 0.0001f).toInt()
        return (0..count).map { rank ->
            val time = minOf(duration, (rank / perMajor) * step.seconds + (rank % perMajor) * minor)
            val major = rank % perMajor == 0
            Tick(time, major, if (major) label(time) else null)
        }
    }

    /** « 45 s », « 1:30 », « 1:00:00 ». */
    fun label(seconds: Float): String {
        val total = seconds.roundToInt()
        if (total < 60) return "$total s"
        val hours = total / 3600
        val minutes = (total % 3600) / 60
        val rest = total % 60
        return if (hours > 0) String.format(Locale.ROOT, "%d:%02d:%02d", hours, minutes, rest)
        else String.format(Locale.ROOT, "%d:%02d", minutes, rest)
    }

    /** La tête a-t-elle franchi une graduation majeure entre deux images ? */
    fun crossesMajor(from: Float, to: Float, step: Float): Boolean {
        if (step <= 0f || !from.isFinite() || !to.isFinite()) return false
        return floor(from / step) != floor(to / step)
    }

    private fun chosen(duration: Float, widthDp: Float): Step {
        if (duration <= 0f || widthDp <= 0f) return scale.first()
        return scale.firstOrNull { it.seconds / duration * widthDp >= LABEL_GAP_DP && duration / it.seconds <= MAX_LABELS }
            ?: scale.last()
    }
}
