package me.meeshy.sdk.call.screen

import me.meeshy.sdk.model.call.screenshare.SenderEncodingLimits
import me.meeshy.sdk.model.call.screenshare.SenderEncodingSnapshot
import me.meeshy.sdk.model.call.screenshare.VideoDegradation
import org.webrtc.Priority
import org.webrtc.RtpParameters.DegradationPreference
import org.webrtc.RtpSender

/**
 * Le pont entre les paramètres d'encodage d'un émetteur WebRTC et leur instantané pur (#13735) : relevé
 * au début du partage, réécrit pour l'écran, puis rendu à l'arrêt, toujours avec la priorité réseau haute d'iOS
 * (#13767). Chaque écriture repart de
 * paramètres FRAIS — WebRTC refuse un `setParameters` dont la transaction est périmée.
 */
internal object ScreenShareSenderEncoding {

    fun read(sender: RtpSender): SenderEncodingSnapshot {
        val parameters = sender.parameters
        return SenderEncodingSnapshot(
            degradation = parameters.degradationPreference?.toModel(),
            encodings = parameters.encodings.orEmpty().map {
                SenderEncodingLimits(it.maxBitrateBps, it.maxFramerate, it.scaleResolutionDownBy)
            },
        )
    }

    fun write(sender: RtpSender, snapshot: SenderEncodingSnapshot): Boolean {
        val parameters = sender.parameters
        parameters.degradationPreference = snapshot.degradation?.toRtc()
        parameters.encodings.orEmpty().zip(snapshot.encodings).forEach { (encoding, limits) ->
            encoding.maxBitrateBps = limits.maxBitrateBps
            encoding.maxFramerate = limits.maxFramerate
            encoding.scaleResolutionDownBy = limits.scaleResolutionDownBy
            encoding.networkPriority = Priority.HIGH
        }
        return sender.setParameters(parameters)
    }

    private fun DegradationPreference.toModel(): VideoDegradation = when (this) {
        DegradationPreference.DISABLED -> VideoDegradation.Disabled
        DegradationPreference.MAINTAIN_FRAMERATE -> VideoDegradation.MaintainFramerate
        DegradationPreference.MAINTAIN_RESOLUTION -> VideoDegradation.MaintainResolution
        DegradationPreference.BALANCED -> VideoDegradation.Balanced
    }

    private fun VideoDegradation.toRtc(): DegradationPreference = when (this) {
        VideoDegradation.Disabled -> DegradationPreference.DISABLED
        VideoDegradation.MaintainFramerate -> DegradationPreference.MAINTAIN_FRAMERATE
        VideoDegradation.MaintainResolution -> DegradationPreference.MAINTAIN_RESOLUTION
        VideoDegradation.Balanced -> DegradationPreference.BALANCED
    }
}
