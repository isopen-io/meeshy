package me.meeshy.sdk.call

import me.meeshy.sdk.model.call.CallAudioBudget
import me.meeshy.sdk.model.call.CallVideoBudget
import org.webrtc.Priority
import org.webrtc.RtpSender

/**
 * L'actionneur des émetteurs d'un appel, miroir de iOS `WebRTCSenderEncoding` : ce que le profil de données et
 * l'échelle de qualité décident arrive sur les `RtpParameters` de CHAQUE encodage. La vidéo (débit, cadence,
 * réduction de résolution, priorité du réseau, ce que l'encodeur sacrifie d'abord) passe par [VideoSenderEncoding] ;
 * l'audio par [applyAudio] : plafond de débit, plancher de l'encodeur, priorité HAUTE (DSCP EF pour la voix). Chaque
 * écriture repart de paramètres frais ; sans encodage (émetteur pas encore négocié), rien n'est écrit et `false` est rendu.
 */
internal object CallSenderTuner {

    fun applyVideo(sender: RtpSender, budget: CallVideoBudget): Boolean = VideoSenderEncoding.apply(sender, budget)

    fun applyAudio(sender: RtpSender, maxBitrateBps: Int): Boolean {
        val parameters = sender.parameters
        val encodings = parameters.encodings.orEmpty()
        if (encodings.isEmpty()) return false
        encodings.forEach { encoding ->
            encoding.maxBitrateBps = maxBitrateBps
            encoding.minBitrateBps = minOf(CallAudioBudget.CODEC_FLOOR_BITRATE_BPS, maxBitrateBps)
            encoding.networkPriority = Priority.HIGH
        }
        return sender.setParameters(parameters)
    }
}
