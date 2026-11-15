package me.meeshy.sdk.model.call

import me.meeshy.sdk.model.call.screenshare.VideoDegradation

/** Ce qu'un tick de qualité change à l'émetteur vidéo : l'échelle à garder, et s'il faut réécrire l'encodeur. */
data class CallVideoEncodingStep(
    val ladder: CallVideoEncodingLadder,
    val reapply: Boolean,
    val frozenChanged: Boolean,
)

/**
 * L'échelle adaptative de l'émetteur vidéo (#13767), miroir de iOS `WebRTCService.adjustBitrate` +
 * `applyVideoQuality` + `VideoSurvivalController` : chaque tick classe le lien (RTT et perte), et l'encodeur ne se
 * réécrit que quand le palier change (pas plus d'une fois par [DEBOUNCE_SECONDS]) ou quand l'état thermique bascule.
 * La survie fige la vidéo au plancher quand le lien reste dégradé, puis la rend au palier COURANT quand il se remet ;
 * elle ne joue jamais contre la caméra coupée par l'utilisateur.
 */
data class CallVideoEncodingLadder(
    val level: VideoQualityLevel = VideoQualityLevel.EXCELLENT,
    val thermal: ThermalState = ThermalState.NOMINAL,
    val levelChangedAtSeconds: Double? = null,
    val survival: VideoSurvivalState = VideoSurvivalState.INITIAL,
) {
    /** La vidéo est figée au plancher de survie. */
    val isFrozen: Boolean get() = !survival.isSending

    /** Ce que l'encodeur reçoit : le plancher de survie, sinon le palier composé avec le plafond thermique. */
    val budget: CallVideoBudget get() = if (isFrozen) CallVideoBudget.SURVIVAL_FLOOR else forLevel(level, thermal)

    fun recording(
        sample: VideoQualityLevel,
        thermal: ThermalState,
        nowSeconds: Double,
        userWantsVideo: Boolean,
        policy: VideoSurvivalPolicy = VideoSurvivalPolicy(),
    ): CallVideoEncodingStep {
        val survivalNext = policy.reduce(survival, sample, nowSeconds, userWantsVideo).state
        val frozenChanged = survivalNext.isSending != survival.isSending
        val thermalChanged = thermal != this.thermal
        val debounced = levelChangedAtSeconds?.let { nowSeconds - it < DEBOUNCE_SECONDS } ?: false
        val levelChanges = sample != level && !debounced
        val next = copy(
            level = if (levelChanges) sample else level,
            thermal = thermal,
            levelChangedAtSeconds = if (levelChanges) nowSeconds else levelChangedAtSeconds,
            survival = survivalNext,
        )
        return CallVideoEncodingStep(next, reapply = levelChanges || thermalChanged || frozenChanged, frozenChanged = frozenChanged)
    }

    companion object {
        /** Un changement de palier par 5 s au plus (iOS `QualityThresholds.qualityLevelDebounceSeconds`). */
        const val DEBOUNCE_SECONDS: Double = 5.0

        /** Le palier réseau composé avec le plafond thermique ([VideoSenderCapPlan]), en gardant la cadence d'abord. */
        fun forLevel(level: VideoQualityLevel, thermal: ThermalState): CallVideoBudget =
            VideoSenderCapPlan.forConditions(level, thermal).let {
                CallVideoBudget(it.maxBitrateBps, it.maxFramerate, it.scaleResolutionDownBy, VideoDegradation.MaintainFramerate)
            }
    }
}
