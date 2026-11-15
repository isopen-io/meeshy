package me.meeshy.app.calls

import android.content.Context
import android.os.Build
import android.os.PowerManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.call.ThermalState
import java.util.concurrent.Executor
import javax.inject.Inject
import javax.inject.Singleton

/** Ce que la surveillance lit de la plateforme : le statut thermique brut (`THERMAL_STATUS_*`) et ses changements. */
interface ThermalStatusSource {
    fun current(): Int

    /** S'abonne aux changements ; rend de quoi se désabonner. */
    fun register(onChange: (Int) -> Unit): () -> Unit
}

/** `PowerManager` (Android 10+) ; en dessous, ou sans capteur, l'appareil est réputé froid. */
class PowerManagerThermalSource(private val context: Context) : ThermalStatusSource {
    override fun current(): Int {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return 0
        return runCatching { context.getSystemService(PowerManager::class.java)?.currentThermalStatus }.getOrNull() ?: 0
    }

    override fun register(onChange: (Int) -> Unit): () -> Unit {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return {}
        val manager = context.getSystemService(PowerManager::class.java) ?: return {}
        val listener = PowerManager.OnThermalStatusChangedListener { status -> runCatching { onChange(status) } }
        val registered = runCatching { manager.addThermalStatusListener(DIRECT, listener) }.isSuccess
        if (!registered) return {}
        return { runCatching { manager.removeThermalStatusListener(listener) } }
    }

    private companion object {
        val DIRECT = Executor { it.run() }
    }
}

/**
 * L'état thermique de l'appareil pendant un appel (iOS `ThermalStateMonitor`) : le statut brut passe par
 * [ThermalState.fromAndroidThermalStatus], le seul endroit qui plie les sept paliers d'Android sur les quatre
 * de l'échelle. Un seul propriétaire de l'abonnement ; `start` est idempotent.
 */
@Singleton
class ThermalStateMonitor(private val source: ThermalStatusSource) {
    @Inject
    constructor(@ApplicationContext context: Context) : this(PowerManagerThermalSource(context))

    private val _state = MutableStateFlow(ThermalState.NOMINAL)
    val state: StateFlow<ThermalState> = _state.asStateFlow()

    private var unregister: (() -> Unit)? = null

    @Synchronized
    fun start() {
        stop()
        _state.value = ThermalState.fromAndroidThermalStatus(source.current())
        unregister = source.register { _state.value = ThermalState.fromAndroidThermalStatus(it) }
    }

    @Synchronized
    fun stop() {
        unregister?.invoke()
        unregister = null
    }
}
