package me.meeshy.app.calls

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.call.CallThermalPlan
import me.meeshy.sdk.model.call.CallVideoNotice
import me.meeshy.sdk.model.call.ThermalState
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La santé réelle de ma vidéo sortante : gel de survie (lien durablement mauvais), chaleur de l'appareil et
 * lumière insuffisante. Les politiques décident ailleurs (pures, testées) ; cette classe n'est que le relais
 * observable que l'écran et le contrôleur d'effets lisent. Un gel de survie reste distinct d'une caméra coupée
 * par l'utilisateur : [isVideoAutoPaused] ne retombe jamais sur l'intention.
 */
@Singleton
class CallVideoHealthImpl @Inject constructor() : CallVideoHealth {
    private val paused = MutableStateFlow(false)
    private val notice = MutableStateFlow(CallVideoNotice.None)
    private val degraded = MutableStateFlow(false)
    private var thermal = ThermalState.NOMINAL
    private var lowLight = false
    private var filtersLatchedOff = false

    /** Appelé quand les effets avancés doivent être coupés ou rendus (le contrôleur d'effets se réapplique). */
    @Volatile
    var onEffectsDegradedChanged: ((Boolean) -> Unit)? = null

    override val isVideoAutoPaused: StateFlow<Boolean> = paused.asStateFlow()
    override val videoNotice: StateFlow<CallVideoNotice> = notice.asStateFlow()
    override val effectsDegraded: StateFlow<Boolean> = degraded.asStateFlow()

    fun setAutoPaused(value: Boolean) {
        paused.value = value
    }

    @Synchronized
    fun setThermal(state: ThermalState) {
        thermal = state
        recompute()
    }

    @Synchronized
    fun setLowLight(value: Boolean) {
        lowLight = value
        recompute()
    }

    @Synchronized
    fun setFiltersLatchedOff(value: Boolean) {
        filtersLatchedOff = value
        recompute()
    }

    /** Fin d'appel : rien ne survit à l'appel suivant. */
    @Synchronized
    fun reset() {
        thermal = ThermalState.NOMINAL
        lowLight = false
        filtersLatchedOff = false
        paused.value = false
        recompute()
    }

    private fun recompute() {
        notice.value = CallVideoNotice.of(thermal, lowLight)
        val next = CallThermalPlan.effectsDegraded(thermal, filtersLatchedOff)
        if (degraded.value == next) return
        degraded.value = next
        runCatching { onEffectsDegradedChanged?.invoke(next) }
    }
}
