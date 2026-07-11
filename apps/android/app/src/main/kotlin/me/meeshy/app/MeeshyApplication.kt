package me.meeshy.app

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.launch
import me.meeshy.sdk.socket.AppStatePresenceReporter
import me.meeshy.sdk.socket.CallSignalManager
import me.meeshy.sdk.socket.SocketManager
import timber.log.Timber
import javax.inject.Inject

@HiltAndroidApp
class MeeshyApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    @Inject
    lateinit var presenceReporter: AppStatePresenceReporter

    @Inject
    lateinit var socketManager: SocketManager

    @Inject
    lateinit var callSignalManager: CallSignalManager

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
        installAppStatePresence()
    }

    /**
     * Routage sonnerie socket-vs-push (audit appels 2026-07-11 #5) : déclare
     * l'état foreground/background du process au gateway (`presence:app-state`)
     * pour qu'un device app-ouverte reçoive l'appel entrant par la socket et
     * non par un push full-screen en double. ON_START/ON_STOP du process
     * lifecycle = transitions ; chaque (re)connexion socket re-déclare l'état
     * courant (la donnée serveur est par-socket).
     */
    private fun installAppStatePresence() {
        val processOwner = ProcessLifecycleOwner.get()
        processOwner.lifecycle.addObserver(
            LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_START -> presenceReporter.onAppStateChanged(foreground = true)
                    Lifecycle.Event.ON_STOP -> presenceReporter.onAppStateChanged(foreground = false)
                    else -> Unit
                }
            },
        )
        processOwner.lifecycleScope.launch {
            socketManager.connected.collect {
                presenceReporter.onSocketConnected()
                // Replay de sonnerie (parité iOS/web) : une socket qui (re)naît
                // mid-ring a manqué le call:initiated live — le gateway rejoue
                // les appels encore sonnants (< 60 s), le client dédoublonne.
                callSignalManager.emitCheckActive()
            }
        }
    }
}
