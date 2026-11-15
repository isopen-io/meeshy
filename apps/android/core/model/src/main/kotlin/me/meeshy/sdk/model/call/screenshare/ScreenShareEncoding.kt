package me.meeshy.sdk.model.call.screenshare

/** Ce que l'encodeur sacrifie d'abord sous congestion, miroir de `RtpParameters.DegradationPreference`. */
enum class VideoDegradation { Disabled, MaintainFramerate, MaintainResolution, Balanced }

/** Les plafonds d'un encodage de l'émetteur vidéo ; `null` = aucun plafond posé. */
data class SenderEncodingLimits(
    val maxBitrateBps: Int?,
    val maxFramerate: Int?,
    val scaleResolutionDownBy: Double?,
)

/** Ce que l'émetteur vidéo porte comme paramètres d'encodage, relevé pour être rendu tel quel. */
data class SenderEncodingSnapshot(
    val degradation: VideoDegradation?,
    val encodings: List<SenderEncodingLimits>,
)

/**
 * L'encodage du partage d'écran (#13735), miroir de iOS `applyScreenShareEncoding` : un écran se LIT,
 * donc sous congestion il perd des images plutôt que de la netteté — 15 images par seconde, la
 * résolution gardée, le plafond de débit vidéo d'iOS (`QualityThresholds.maxVideoBitrate`). L'arrêt
 * rend à l'émetteur l'instantané relevé au début.
 */
object ScreenShareEncodingLaw {
    const val MAX_BITRATE_BPS = 2_500_000
    const val MAX_FRAMERATE = ScreenShareCaptureSize.FRAMES_PER_SECOND

    val SCREEN = SenderEncodingLimits(maxBitrateBps = MAX_BITRATE_BPS, maxFramerate = MAX_FRAMERATE, scaleResolutionDownBy = 1.0)

    fun during(before: SenderEncodingSnapshot): SenderEncodingSnapshot =
        SenderEncodingSnapshot(degradation = VideoDegradation.MaintainResolution, encodings = before.encodings.map { SCREEN })
}
