package me.meeshy.sdk.call

import me.meeshy.sdk.model.call.CallVideoBudget
import me.meeshy.sdk.model.call.screenshare.VideoDegradation
import org.webrtc.Priority
import org.webrtc.RtpParameters.DegradationPreference
import org.webrtc.RtpSender

/**
 * L'actionneur des plafonds vidéo, miroir de iOS `WebRTCSenderEncoding.applyVideo` : sur CHAQUE encodage de
 * l'émetteur, le débit maximal, la cadence maximale, la réduction de résolution (jamais sous 1) et la priorité réseau
 * HAUTE (DSCP AF41 pour la vidéo temps réel), plus ce que l'encodeur sacrifie d'abord. Chaque écriture repart de
 * paramètres FRAIS — WebRTC refuse un `setParameters` dont la transaction est périmée. Sans encodage (émetteur pas
 * encore négocié), rien n'est écrit : la négociation suivante réapplique.
 */
internal object VideoSenderEncoding {

    fun apply(sender: RtpSender, budget: CallVideoBudget): Boolean {
        val parameters = sender.parameters
        val encodings = parameters.encodings.orEmpty()
        if (encodings.isEmpty()) return false
        parameters.degradationPreference = budget.degradation.toRtc()
        encodings.forEach { encoding ->
            encoding.maxBitrateBps = budget.maxBitrateBps
            encoding.maxFramerate = budget.maxFramerate
            encoding.scaleResolutionDownBy = maxOf(1.0, budget.scaleResolutionDownBy)
            encoding.networkPriority = Priority.HIGH
        }
        return sender.setParameters(parameters)
    }

    private fun VideoDegradation.toRtc(): DegradationPreference = when (this) {
        VideoDegradation.Disabled -> DegradationPreference.DISABLED
        VideoDegradation.MaintainFramerate -> DegradationPreference.MAINTAIN_FRAMERATE
        VideoDegradation.MaintainResolution -> DegradationPreference.MAINTAIN_RESOLUTION
        VideoDegradation.Balanced -> DegradationPreference.BALANCED
    }
}
