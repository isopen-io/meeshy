package me.meeshy.sdk.model.relation

import kotlin.math.PI
import kotlin.math.sin

/** Ce que la bande dessine au centre : le spectre de l'instant, ou la bande qui enregistre. */
public enum class TalkieHeaderBarMotif { SPECTRUM, TAPE }

/** Le point de la pastille : blanc et pulsant en direct, rouge et clignotant hors ligne. */
public enum class TalkieHeaderBadgeDot { PULSE, BLINK }

/**
 * L'allure de la bande d'en-tête selon ce que devient la voix (#17339, iso `TalkieHeaderLiveBar`) — l'œil sait AVANT la
 * fin si l'autre entend : en direct, un spectre lumineux sous une lueur ; hors ligne, un fond assombri au liseré pointillé.
 */
public data class TalkieHeaderBarLook(
    val motif: TalkieHeaderBarMotif,
    val dot: TalkieHeaderBadgeDot,
    val dimAlpha: Float,
    val dashedBorder: Boolean,
    val glowAlpha: Float,
    val glowRadiusDp: Float,
    val badgeFillAlpha: Float,
) {
    public companion object {
        private val REALTIME = TalkieHeaderBarLook(
            motif = TalkieHeaderBarMotif.SPECTRUM,
            dot = TalkieHeaderBadgeDot.PULSE,
            dimAlpha = 0f,
            dashedBorder = false,
            glowAlpha = 0.55f,
            glowRadiusDp = 10f,
            badgeFillAlpha = 0.22f,
        )

        private val OFFLINE = TalkieHeaderBarLook(
            motif = TalkieHeaderBarMotif.TAPE,
            dot = TalkieHeaderBadgeDot.BLINK,
            dimAlpha = 0.38f,
            dashedBorder = true,
            glowAlpha = 0.2f,
            glowRadiusDp = 4f,
            badgeFillAlpha = 0.14f,
        )

        public fun resolve(delivery: TalkieHeaderDelivery): TalkieHeaderBarLook =
            if (delivery.isRealtime) REALTIME else OFFLINE

        /** La pulsation du point blanc, période 1,2 s, de 0 à 1 ; figée à mi-course avec « Réduire les animations ». */
        public fun pulse(timeSeconds: Double, reduceMotion: Boolean): Float =
            if (reduceMotion) 0.5f else ((sin(timeSeconds * 2 * PI / 1.2) + 1) / 2).toFloat()

        /** Le clignotement du point rouge, à la seconde, de 0,35 à 1 ; plein avec « Réduire les animations ». */
        public fun blink(timeSeconds: Double, reduceMotion: Boolean): Float =
            if (reduceMotion) 1f else (0.35 + 0.65 * (sin(timeSeconds * 2 * PI) + 1) / 2).toFloat()

        /** La voix qui arrive s'annonce déjà par l'indicateur de réception ; seule celle qui part dit ce qu'elle devient. */
        public fun announces(voice: TalkieHeaderVoice): Boolean = voice == TalkieHeaderVoice.OUTGOING

        /** Une barre du spectre s'éclaire avec sa hauteur : 0,6 au plancher, 1 au plafond. */
        public fun barAlpha(height: Float, minHeight: Float, maxHeight: Float): Float {
            val span = maxHeight - minHeight
            val strength = if (span > 0f) ((height - minHeight) / span).coerceIn(0f, 1f) else 0f
            return 0.6f + 0.4f * strength
        }
    }
}
