package me.meeshy.sdk.model.call

/**
 * La loi d'adaptation de la qualité à chaque tick de statistiques, miroir de iOS
 * `WebRTCService.adjustBitrate` et `CallReliabilityPolicy.effectiveQualityLevel` : le débit audio
 * cible (échelle RTT et perte, plafonnée par la gigue confirmée) et le niveau vidéo effectif
 * (heuristique RTT/perte, contrainte par l'estimation de bande passante seulement quand la vidéo
 * part réellement et que l'estimateur a convergé).
 */
object AdaptiveBitrateLaw {
    /** Secondes après le démarrage du moniteur pendant lesquelles l'estimation de bande passante est ignorée. */
    const val BWE_WARMUP_SECONDS: Double = 30.0

    /** Débit audio (bps) cible pour un tick, avant plafonnement du profil de données. */
    fun audioBitrateBps(rttMs: Double, lossRatio: Double, jitterCapped: Boolean): Int = when {
        jitterCapped -> CallQualityThresholds.MIN_AUDIO_BITRATE_BPS
        rttMs <= CallQualityThresholds.EXCELLENT_RTT_MS &&
            lossRatio <= CallQualityThresholds.EXCELLENT_PACKET_LOSS -> CallQualityThresholds.MAX_AUDIO_BITRATE_BPS
        rttMs <= CallQualityThresholds.GOOD_RTT_MS &&
            lossRatio <= CallQualityThresholds.GOOD_PACKET_LOSS -> CallQualityThresholds.DEFAULT_AUDIO_BITRATE_BPS
        else -> CallQualityThresholds.MIN_AUDIO_BITRATE_BPS
    }

    /**
     * Niveau effectif : l'estimation de bande passante (échelle calibrée sur des débits VIDÉO) ne
     * contraint le niveau que si la vidéo est envoyée ET si [secondsSinceMonitorStart] a dépassé la
     * chauffe ; l'heuristique RTT/perte n'est jamais bridée.
     */
    fun effectiveLevel(
        heuristic: VideoQualityLevel,
        availableOutgoingBitrateBps: Int,
        isSendingVideo: Boolean,
        secondsSinceMonitorStart: Double,
    ): VideoQualityLevel {
        if (!isSendingVideo || secondsSinceMonitorStart < BWE_WARMUP_SECONDS || availableOutgoingBitrateBps <= 0) {
            return heuristic
        }
        val bwe = VideoQualityLevel.from(availableOutgoingBitrateBps)
        return if (bwe < heuristic) bwe else heuristic
    }
}
