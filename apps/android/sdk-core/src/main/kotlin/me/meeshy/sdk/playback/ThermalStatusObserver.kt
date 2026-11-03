package me.meeshy.sdk.playback

import android.content.Context
import android.os.Build
import android.os.PowerManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.Executor
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.media.DeviceThermalState

/**
 * L'état thermique courant pour les gouverneurs de lecture (iOS `MediaPolicyMonitor`) : lu de
 * `PowerManager.getCurrentThermalStatus` (API 29) et suivi par un écouteur. Avant Android 10, ou sans capteur,
 * l'appareil est réputé froid. `start` est idempotent.
 */
@Singleton
public class ThermalStatusObserver @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val _state = MutableStateFlow(DeviceThermalState.NOMINAL)
    public val state: StateFlow<DeviceThermalState> = _state.asStateFlow()

    private var registered = false

    @Synchronized
    public fun start() {
        if (registered || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        val manager = context.getSystemService(PowerManager::class.java) ?: return
        _state.value = fold(manager.currentThermalStatus)
        val listener = PowerManager.OnThermalStatusChangedListener { status -> _state.value = fold(status) }
        registered = runCatching { manager.addThermalStatusListener(Executor { it.run() }, listener) }.isSuccess
    }

    private fun fold(status: Int): DeviceThermalState = when {
        status >= PowerManager.THERMAL_STATUS_CRITICAL -> DeviceThermalState.CRITICAL
        status == PowerManager.THERMAL_STATUS_SEVERE -> DeviceThermalState.SERIOUS
        status >= PowerManager.THERMAL_STATUS_LIGHT -> DeviceThermalState.FAIR
        else -> DeviceThermalState.NOMINAL
    }
}
