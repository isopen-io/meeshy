package me.meeshy.sdk.model.call

/**
 * Ce que la chaleur de l'appareil autorise à la capture (iOS `ThermalStateMonitor.recommendedMaxFps` /
 * `recommendedMaxResolution` / `shouldDisableVideo`). Pure : l'actionneur ne lit que ce plan.
 */
data class CallThermalPlan(
    val maxFps: Int,
    val maxWidth: Int,
    val maxHeight: Int,
    val videoAllowed: Boolean,
    val advancedEffectsAllowed: Boolean,
) {
    companion object {
        fun forState(state: ThermalState): CallThermalPlan = when (state) {
            ThermalState.NOMINAL -> CallThermalPlan(30, 1280, 720, videoAllowed = true, advancedEffectsAllowed = true)
            ThermalState.FAIR -> CallThermalPlan(24, 960, 540, videoAllowed = true, advancedEffectsAllowed = true)
            ThermalState.SERIOUS -> CallThermalPlan(15, 640, 360, videoAllowed = true, advancedEffectsAllowed = false)
            ThermalState.CRITICAL -> CallThermalPlan(0, 0, 0, videoAllowed = false, advancedEffectsAllowed = false)
        }

        /** Les effets avancés sont coupés quand la chaleur l'impose ou quand le budget de trame les a fait tomber. */
        fun effectsDegraded(state: ThermalState, filtersLatchedOff: Boolean): Boolean =
            filtersLatchedOff || !forState(state).advancedEffectsAllowed
    }
}

/** L'indicateur discret de l'écran d'appel : image réduite par la chaleur, ou lumière insuffisante. */
enum class CallVideoNotice {
    None,
    Reduced,
    LowLight,
    ;

    companion object {
        fun of(thermal: ThermalState, isLowLight: Boolean): CallVideoNotice = when {
            !CallThermalPlan.forState(thermal).advancedEffectsAllowed -> Reduced
            isLowLight -> LowLight
            else -> None
        }
    }
}
