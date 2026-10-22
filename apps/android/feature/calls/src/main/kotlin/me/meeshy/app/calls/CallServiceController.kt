package me.meeshy.app.calls

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.ongoing.CallActivityPhase
import me.meeshy.sdk.model.ongoing.CallActivitySnapshot
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/** Démarre et arrête le service de premier plan ; remplaçable en test. */
interface CallServiceLauncher {
    fun start()
    fun stop()
}

/**
 * Android 14+ coupe micro et caméra d'une app en arrière-plan sans service de premier plan :
 * le service vit exactement le temps de l'appel. Il démarre dès qu'une notification d'appel
 * existe (émission ou décroché), n'est jamais redémarré tant qu'il tourne, s'arrête quand plus
 * rien n'est à montrer ; sur « Appel terminé », il se retire lui-même après l'état final.
 */
@Singleton
class CallServiceController @Inject constructor(
    private val launcher: CallServiceLauncher,
) {
    private var running = false

    fun sync(snapshot: CallActivitySnapshot?) {
        when {
            snapshot == null -> stopIfRunning()
            snapshot.phase == CallActivityPhase.Ended -> running = false
            !running -> {
                running = true
                launcher.start()
            }
        }
    }

    private fun stopIfRunning() {
        if (!running) return
        running = false
        launcher.stop()
    }
}

@Singleton
class AndroidCallServiceLauncher @Inject constructor(
    @ApplicationContext private val context: Context,
) : CallServiceLauncher {

    override fun start() {
        try {
            ContextCompat.startForegroundService(context, Intent(context, CallForegroundService::class.java))
        } catch (failure: Exception) {
            Timber.w(failure, "Foreground call service start refused; the call continues in the foreground")
        }
    }

    override fun stop() {
        try {
            context.stopService(Intent(context, CallForegroundService::class.java))
        } catch (failure: Exception) {
            Timber.w(failure, "Foreground call service stop failed")
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallForegroundServiceModule {
    @Binds
    fun bindCallServiceLauncher(impl: AndroidCallServiceLauncher): CallServiceLauncher

    @Binds
    fun bindCallOngoingWording(impl: AndroidCallOngoingWording): CallOngoingWording
}
