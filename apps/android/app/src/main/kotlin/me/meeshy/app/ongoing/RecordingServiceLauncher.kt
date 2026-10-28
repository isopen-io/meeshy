package me.meeshy.app.ongoing

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.sdk.model.ongoing.VoiceRecordingSnapshot
import timber.log.Timber
import javax.inject.Inject

/** Ouvre et ferme le service de premier plan du vocal ; séparé pour que la notification se joue sans système. */
internal interface RecordingServiceLauncher {
    /** `true` si le système a accepté de démarrer le service. */
    fun start(snapshot: VoiceRecordingSnapshot): Boolean

    fun stop()
}

internal class AndroidRecordingServiceLauncher @Inject constructor(
    @ApplicationContext private val context: Context,
) : RecordingServiceLauncher {

    override fun start(snapshot: VoiceRecordingSnapshot): Boolean = try {
        ContextCompat.startForegroundService(context, VoiceRecordingService.startIntent(context, snapshot))
        true
    } catch (refused: RuntimeException) {
        Timber.w(refused, "service du vocal refusé")
        false
    }

    override fun stop() {
        context.stopService(Intent(context, VoiceRecordingService::class.java))
    }
}
