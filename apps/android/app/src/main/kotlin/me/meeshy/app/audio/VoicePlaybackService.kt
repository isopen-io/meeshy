package me.meeshy.app.audio

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import android.os.Build
import android.os.IBinder
import coil.imageLoader
import coil.request.ImageRequest
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import timber.log.Timber

@EntryPoint
@InstallIn(SingletonComponent::class)
internal interface VoicePlaybackEntryPoint {
    fun voicePlaybackBridge(): VoicePlaybackSessionBridge
}

/**
 * Tient le vocal écouté au PREMIER PLAN (#13393) : sans lui, Android gèle le processus dès que
 * l'utilisateur quitte l'app et le vocal s'arrête au milieu d'une phrase. Il porte la session média
 * et la notification de lecture ([VoicePlaybackSessionController]) ; il se démarre quand le lecteur
 * publie son premier vocal ([VoicePlaybackServiceStarter]) et se rend dès que le lecteur retire le sien.
 */
internal class VoicePlaybackService : Service(), VoicePlaybackForeground {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private lateinit var controller: VoicePlaybackSessionController

    override fun onCreate() {
        super.onCreate()
        val bridge = EntryPointAccessors.fromApplication(this, VoicePlaybackEntryPoint::class.java).voicePlaybackBridge()
        controller = VoicePlaybackSessionController(
            context = this,
            bridge = bridge,
            foreground = this,
            scope = scope,
            loadArtwork = { url -> artwork(applicationContext, url) },
        )
        controller.start()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        controller.onAction(intent?.action)
        return START_NOT_STICKY
    }

    override fun enter(notificationId: Int, notification: Notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            } else {
                startForeground(notificationId, notification)
            }
        } catch (refused: RuntimeException) {
            Timber.w(refused, "premier plan du vocal refusé")
            stopSelf()
        }
    }

    override fun park() {
        stopForeground(STOP_FOREGROUND_DETACH)
    }

    override fun leave() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    /** L'app balayée des récentes emporte l'écran, donc le moteur : plus rien à piloter. */
    override fun onTaskRemoved(rootIntent: Intent?) {
        controller.onAction(VoicePlaybackSessionController.ACTION_STOP)
        stopSelf()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        controller.stop()
        scope.cancel()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private suspend fun artwork(context: Context, url: String): Bitmap? {
        if (!me.meeshy.sdk.model.playback.VoicePlaybackCardRules.isArtworkFetchable(url)) return null
        val request = ImageRequest.Builder(context).data(url).allowHardware(false).size(ARTWORK_PX).build()
        return (context.imageLoader.execute(request).drawable as? BitmapDrawable)?.bitmap
    }

    private companion object {
        const val ARTWORK_PX = 256
    }
}
