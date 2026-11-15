package me.meeshy.app.chat.export

import java.text.NumberFormat
import java.util.Locale
import kotlin.math.ceil

/** LA VITESSE D'UNE CARTE QUI DÉFILE (#18671, miroir de `MessageCardScrollSpeed`) — de ×0,5 à ×3 ; ×1 est la lecture posée. */
enum class CardScrollSpeed(val factor: Double) {
    X0_5(0.5), X0_75(0.75), X1(1.0), X1_25(1.25), X1_5(1.5), X1_75(1.75), X2(2.0), X2_5(2.5), X3(3.0);

    /** « ×0,75 » en français, « ×0.75 » en anglais : la décimale de la langue. */
    fun label(locale: Locale = Locale.getDefault()): String {
        val format = NumberFormat.getNumberInstance(locale).apply {
            minimumFractionDigits = 0
            maximumFractionDigits = 2
        }
        return "×" + format.format(factor)
    }

    companion object {
        val standard = X1
    }
}

/**
 * LE PLAN D'UNE VIDÉO QUI DÉFILE (#18671, miroir de `MessageCardScrollPlan`) : la carte se montre d'abord immobile, puis
 * glisse à vitesse constante sous la fenêtre du format jusqu'à sa dernière ligne, qui reste un instant.
 */
data class CardScrollPlan(val travel: Double, val scrollDuration: Double, val duration: Double, val frameCount: Int) {

    /** Le décalage de la carte, en pixels, à l'instant [time]. */
    fun offset(time: Double): Double {
        if (scrollDuration <= 0) return 0.0
        val progress = ((time - LEAD_IN) / scrollDuration).coerceIn(0.0, 1.0)
        return travel * progress
    }

    fun time(frame: Int): Double = frame / FPS

    companion object {
        /** La lecture posée (×1), en pixels de carte par seconde : une ligne de réponse toutes les 1,6 s environ. */
        const val PIXELS_PER_SECOND = 54.0
        const val LEAD_IN = 1.5
        const val LEAD_OUT = 2.0
        const val FPS = 30.0
        /** La plus longue vidéo produite : au-delà, le défilement accélère pour tenir. */
        const val MAX_DURATION = 180.0

        /** `null` quand la carte tient dans son format : il n'y a rien à faire défiler. */
        fun of(contentHeight: Double, viewportHeight: Double, speed: CardScrollSpeed): CardScrollPlan? {
            val travel = contentHeight - viewportHeight
            if (!travel.isFinite() || travel <= 1 || viewportHeight <= 0) return null
            val scrollDuration = minOf(MAX_DURATION - LEAD_IN - LEAD_OUT, travel / (PIXELS_PER_SECOND * speed.factor))
            val duration = LEAD_IN + scrollDuration + LEAD_OUT
            return CardScrollPlan(travel, scrollDuration, duration, maxOf(1, ceil(duration * FPS).toInt()))
        }

        /** « 1 min 12 s », « 38 s » — la durée à la seconde près. */
        fun durationLabel(seconds: Double): String {
            val total = Math.round(seconds).toInt()
            return if (total >= 60) "${total / 60} min ${total % 60} s" else "$total s"
        }
    }
}

/**
 * LE FOND CHOISI D'UNE CARTE (#18672, miroir de `MessageCardBackdrop`) — une photo de la galerie, peinte sous un voile de
 * la couleur de la palette : le texte reste lisible, la carte garde sa teinte. Le filigrane passe au-dessus.
 */
class CardBackdrop(val media: CardMedia, veil: Double = DEFAULT_VEIL) {
    val veil: Double = (if (veil.isFinite()) veil else DEFAULT_VEIL).coerceIn(0.0, MAX_VEIL)

    override fun equals(other: Any?) = other is CardBackdrop && other.media == media && other.veil == veil
    override fun hashCode() = 31 * media.hashCode() + veil.hashCode()

    companion object {
        /** L'identifiant sous lequel l'écran remet ses pixels, à côté de ceux des médias. */
        const val MEDIA_ID = "meeshy.backdrop"
        const val DEFAULT_VEIL = 0.55
        const val MAX_VEIL = 0.9
    }
}

/**
 * Ce qui touche la bande `[top, bottom]` de la carte — une image de la vidéo qui défile ne peint que ce que sa fenêtre
 * montre. Un groupe incliné se garde toujours : sa rotation déplace ses enfants.
 */
fun CardLayout.opsBetween(top: Double, bottom: Double): List<CardOp> = ops.filter { op ->
    val span = op.verticalSpan() ?: return@filter true
    span.endInclusive >= top && span.start <= bottom
}

internal fun CardOp.verticalSpan(): ClosedFloatingPointRange<Double>? = when (this) {
    is CardOp.Text -> (y - font.size * 1.3)..(y + font.size * 0.5)
    is CardOp.Bar -> y..(y + maxOf(0.0, height))
    is CardOp.Panel -> y..(y + maxOf(0.0, height))
    is CardOp.Separator -> (y - radius - lineWidth)..(y + radius + lineWidth)
    is CardOp.Dot -> (y - radius)..(y + radius)
    is CardOp.Picture -> y..(y + maxOf(0.0, height))
    is CardOp.Group -> null
}
