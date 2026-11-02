package me.meeshy.app.calls

import android.content.Context
import android.os.Build
import android.os.PowerManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import me.meeshy.sdk.model.call.CallQualityTick
import me.meeshy.sdk.model.call.CallVideoBudget
import me.meeshy.sdk.model.call.CallVideoEncodingLadder
import me.meeshy.sdk.model.call.ThermalState
import me.meeshy.sdk.model.call.VideoQualityLevel
import me.meeshy.sdk.model.call.VideoSurvivalState

/**
 * La boucle adaptative de l'émetteur vidéo (#13767), miroir de iOS `WebRTCService.adjustBitrate` et de la survie
 * vidéo de `CallManager` : chaque tick de qualité passe par [CallVideoEncodingLadder] ; l'encodeur de la caméra n'est
 * réécrit que quand l'échelle le dit, et la survie (gel au plancher, dégel au palier courant) est propagée au
 * maillage. Couper la caméra dégèle tout de suite (iOS `reset` → `unfreezeVideoAfterSurvival`).
 */
internal class CallVideoEncodingController(
    private val ticks: Flow<CallQualityTick>,
    private val thermal: () -> ThermalState,
    private val apply: (budget: CallVideoBudget, frozen: Boolean) -> Unit,
    private val onSurvivalFloor: (frozen: Boolean) -> Unit,
    private val nowSeconds: () -> Double = { System.nanoTime() / NANOS_PER_SECOND },
) {
    private var ladder = CallVideoEncodingLadder()
    private var userWantsVideo = false
    private var job: Job? = null

    fun begin(scope: CoroutineScope, wantsVideo: Boolean) {
        end()
        userWantsVideo = wantsVideo
        job = ticks.onEach(::onTick).launchIn(scope)
    }

    fun setUserWantsVideo(enabled: Boolean) {
        userWantsVideo = enabled
        if (enabled || !ladder.isFrozen) return
        ladder = ladder.copy(survival = VideoSurvivalState.INITIAL)
        apply(ladder.budget, false)
        onSurvivalFloor(false)
    }

    fun end() {
        job?.cancel()
        job = null
        ladder = CallVideoEncodingLadder()
        userWantsVideo = false
    }

    private fun onTick(tick: CallQualityTick) {
        val sample = VideoQualityLevel.from(tick.rttMs, tick.packetLossPercent / PERCENT)
        val step = ladder.recording(sample, thermal(), nowSeconds(), userWantsVideo)
        ladder = step.ladder
        if (step.reapply) apply(ladder.budget, ladder.isFrozen)
        if (step.frozenChanged) onSurvivalFloor(ladder.isFrozen)
    }

    private companion object {
        const val NANOS_PER_SECOND = 1_000_000_000.0
        const val PERCENT = 100.0
    }
}

/** L'état thermique de l'appareil (Android 10+), `NOMINAL` sans capteur — iOS `ProcessInfo.thermalState`. */
internal fun Context.callThermalState(): ThermalState {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return ThermalState.NOMINAL
    val status = runCatching { getSystemService(PowerManager::class.java)?.currentThermalStatus }.getOrNull()
    return status?.let(ThermalState::fromAndroidThermalStatus) ?: ThermalState.NOMINAL
}
