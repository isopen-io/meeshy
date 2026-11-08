package me.meeshy.app

import android.app.Application
import android.content.Context
import androidx.hilt.work.HiltWorkerFactory
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.lifecycle.lifecycleScope
import androidx.work.Configuration
import coil.ImageLoader
import coil.ImageLoaderFactory
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.WorkManagerServerLogoutScheduler
import me.meeshy.app.push.DeclinedCallStore
import me.meeshy.app.push.NotificationChannelInstaller
import me.meeshy.app.settings.CrashDiagnosticsRecorder
import me.meeshy.app.startup.AppInitializerRunner
import me.meeshy.app.theme.UiLanguageBootstrap
import me.meeshy.app.startup.AppLifecycleRunner
import me.meeshy.sdk.lifecycle.AppLifecycleDispatcher
import me.meeshy.sdk.model.lifecycle.TrimLevel
import me.meeshy.sdk.call.frames.CallFrameSceneImages
import me.meeshy.sdk.socket.AppStatePresenceReporter
import me.meeshy.sdk.socket.CallSignalManager
import me.meeshy.sdk.socket.PresenceStore
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.ui.component.media.MeeshyImageLoader
import timber.log.Timber
import javax.inject.Inject

@HiltAndroidApp
class MeeshyApplication : Application(), Configuration.Provider, ImageLoaderFactory {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    @Inject
    lateinit var presenceReporter: AppStatePresenceReporter

    @Inject
    lateinit var socketManager: SocketManager

    @Inject
    lateinit var presenceStore: PresenceStore

    @Inject
    lateinit var callSignalManager: CallSignalManager

    @Inject
    lateinit var declinedCalls: DeclinedCallStore

    @Inject
    lateinit var crashDiagnosticsRecorder: CrashDiagnosticsRecorder

    @Inject
    lateinit var notificationChannelInstaller: NotificationChannelInstaller

    @Inject
    lateinit var appInitializerRunner: AppInitializerRunner

    @Inject
    lateinit var lifecycleDispatcher: AppLifecycleDispatcher

    @Inject
    lateinit var lifecycleRunner: AppLifecycleRunner

    @Inject
    lateinit var serverLogoutScheduler: WorkManagerServerLogoutScheduler

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    /** Le chargeur partagé de Coil : il respecte l'orientation EXIF de toute photo (`MeeshyImageLoader`). */
    override fun newImageLoader(): ImageLoader = MeeshyImageLoader.build(this)

    /** La langue d'interface s'écrit avant tout : locale du process posée avant l'Activity (#14731). */
    override fun attachBaseContext(base: Context) {
        super.attachBaseContext(UiLanguageBootstrap.wrap(base))
    }

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
        crashDiagnosticsRecorder.install()
        // Eager, not lazy (ARCHITECTURE.md §18) — a push the OS auto-renders while
        // the app is backgrounded/killed never reaches MeeshyFcmService.onMessageReceived,
        // so a channel only ever created there would still be missing exactly when it's
        // needed most. See NotificationChannelIds for the full gateway-drift rationale.
        notificationChannelInstaller.install()
        // La carte de présence s'abonne AVANT toute connexion : les flux socket sont chauds sans rejeu.
        presenceStore.start()
        installAppStatePresence()
        // Les illustrations des cadres d'appel se lisent dans les actifs de l'app (le `Bundle.main` d'iOS).
        CallFrameSceneImages.install(this)
        appInitializerRunner.runAll()
        lifecycleDispatcher.onAppCreate()
        lifecycleRunner.runStartup()
        ProcessLifecycleOwner.get().lifecycleScope.launch(Dispatchers.IO) { serverLogoutScheduler.resumeOrphans() }
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        TrimLevel.fromComponentCallbacks(level)?.let { lifecycleDispatcher.onTrimMemory(it) }
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
                    Lifecycle.Event.ON_START -> {
                        presenceReporter.onAppStateChanged(foreground = true)
                        lifecycleDispatcher.onForeground()
                        lifecycleRunner.runForeground()
                    }
                    Lifecycle.Event.ON_STOP -> {
                        presenceReporter.onAppStateChanged(foreground = false)
                        lifecycleDispatcher.onBackground()
                    }
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
                // Refus prononcés socket froide (bouton « Refuser » de la
                // notification) : rejoués maintenant que le fil est vivant —
                // call:end est idempotent, un rejeu tardif est un no-op.
                declinedCalls.drain().forEach { callSignalManager.emitEnd(it, reason = "rejected") }
            }
        }
    }
}
