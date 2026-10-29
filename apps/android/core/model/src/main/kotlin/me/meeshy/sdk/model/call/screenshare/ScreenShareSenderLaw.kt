package me.meeshy.sdk.model.call.screenshare

import kotlin.math.max

/** Comment la piste d'écran prend l'émetteur vidéo. */
data class ScreenShareBegin(val addsSender: Boolean, val needsRenegotiation: Boolean)

/** Comment l'émetteur vidéo retrouve ce qu'il portait avant le partage. */
data class ScreenShareEnd(val needsRenegotiation: Boolean)

/**
 * Le partage REMPLACE la piste de l'émetteur vidéo existant, exactement comme iOS
 * (`P2PWebRTCClient.beginScreenShareTrack`) : aucune ligne m= de plus quand la caméra émettait, donc
 * aucune offre. Il n'en faut une que si la direction SDP change — l'émetteur ne faisait que recevoir
 * (appel audio), ou il n'existait pas. L'arrêt rend la piste et la direction d'avant.
 */
object ScreenShareSenderLaw {

    fun begin(hasVideoSender: Boolean, wasSending: Boolean): ScreenShareBegin =
        ScreenShareBegin(addsSender = !hasVideoSender, needsRenegotiation = !hasVideoSender || !wasSending)

    fun end(wasSendingBefore: Boolean): ScreenShareEnd = ScreenShareEnd(needsRenegotiation = !wasSendingBefore)
}

/**
 * La taille de capture de l'écran : son rapport, le grand côté plafonné à [MAX_LONG_SIDE], des
 * dimensions paires (l'encodeur les veut). Un écran se LIT : 15 images par seconde suffisent, comme iOS.
 */
data class ScreenShareCaptureSize(val width: Int, val height: Int) {
    companion object {
        const val MAX_LONG_SIDE = 1280
        const val FRAMES_PER_SECOND = 15
        val DEFAULT = ScreenShareCaptureSize(width = 720, height = 1280)

        fun fit(widthPx: Int, heightPx: Int): ScreenShareCaptureSize {
            if (widthPx <= 0 || heightPx <= 0) return DEFAULT
            val scale = minOf(1f, MAX_LONG_SIDE.toFloat() / max(widthPx, heightPx))
            return ScreenShareCaptureSize(even(widthPx * scale), even(heightPx * scale))
        }

        private fun even(value: Float): Int {
            val whole = value.toInt().coerceAtLeast(2)
            return if (whole % 2 == 0) whole else whole - 1
        }
    }
}
