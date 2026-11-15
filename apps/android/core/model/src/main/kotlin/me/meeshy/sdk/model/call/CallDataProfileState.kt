package me.meeshy.sdk.model.call

/**
 * Ce que le profil de données sait à un instant (iOS `WebRTCService.refreshDataProfile` + `adjustBitrate`) : le chemin
 * du système, l'heuristique RTT/perte du dernier tick, le profil courant (l'hystérésis de [CallDataProfile.resolve] se
 * lit dessus) et l'échelle du débit audio — plafonnée par la gigue confirmée sur deux ticks. Immuable : chaque entrée
 * rend l'état suivant ; l'actionneur compare [profile] et [audioCeilingBps] avant et après pour savoir quoi réécrire.
 */
data class CallDataProfileState(
    val path: CallNetworkPath = CallNetworkPath.UNRESTRICTED,
    val heuristic: VideoQualityLevel = VideoQualityLevel.EXCELLENT,
    val profile: CallDataProfile = CallDataProfile.WIFI,
    val ladderAudioBps: Int = CallQualityThresholds.DEFAULT_AUDIO_BITRATE_BPS,
    val jitter: JitterBitrateCapTracker = JitterBitrateCapTracker(),
) {
    /** Le plafond du débit audio : l'échelle RTT/perte/gigue, sous le plafond Opus voix du profil. */
    val audioCeilingBps: Int get() = profile.budget.audio.capping(ladderAudioBps)

    fun onPath(next: CallNetworkPath): CallDataProfileState = copy(path = next).resolved()

    fun onSample(rttMs: Double, lossRatio: Double, jitterMs: Double): CallDataProfileState {
        val tracker = jitter.record(jitterMs)
        return copy(
            heuristic = VideoQualityLevel.from(rttMs, lossRatio),
            ladderAudioBps = AdaptiveBitrateLaw.audioBitrateBps(rttMs, lossRatio, tracker.isCapped),
            jitter = tracker,
        ).resolved()
    }

    private fun resolved(): CallDataProfileState = copy(profile = CallDataProfile.resolve(path, heuristic, profile))

    companion object {
        /** L'état de départ d'un appel : le chemin déjà connu, un lien présumé sain, avant toute mesure. */
        fun starting(path: CallNetworkPath): CallDataProfileState = CallDataProfileState().onPath(path)
    }
}
