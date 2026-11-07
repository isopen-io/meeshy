package me.meeshy.app.bring

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.ServiceCompat
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import me.meeshy.sdk.model.relation.BringRingPush
import timber.log.Timber
import javax.inject.Inject

/**
 * Le service au premier plan qui SONNE un Bring (#13936, `proche-bring@android`) : flux ALARME (sonne en silencieux, au
 * volume d'alarme réglé par le destinataire, et passe Ne pas déranger quand les alarmes y sont permises), vibration en
 * boucle, jusqu'au premier de : « Arrêter » (notification ou écran plein), l'arrêt servi par la passerelle
 * (`bring_stopped`), l'expiration. Il suit [BringRingState] : quand l'état ne sonne plus ce Bring, il se tait et s'arrête.
 */
@AndroidEntryPoint
class BringRingService : Service() {

    @Inject
    lateinit var state: BringRingState

    @Inject
    lateinit var stopper: BringStopper

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val handler = Handler(Looper.getMainLooper())
    private var player: MediaPlayer? = null
    private var playing: String? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        state.current.onEach { current -> if (playing != null && current?.bringId != playing) follow(current) }.launchIn(scope)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val push = state.current.value
        if (push != null) {
            promote(push)
            return START_NOT_STICKY
        }
        state.last?.let { stale ->
            runCatching {
                ServiceCompat.startForeground(
                    this,
                    BringRingNotification.NOTIFICATION_ID,
                    BringRingNotification.build(this, stale, System.currentTimeMillis()),
                    foregroundType(),
                )
            }
        }
        finish()
        return START_NOT_STICKY
    }

    private fun follow(current: BringRingPush?) {
        if (current == null) finish() else promote(current)
    }

    private fun promote(push: BringRingPush) {
        val now = System.currentTimeMillis()
        val notification = BringRingNotification.build(this, push, now)
        runCatching {
            ServiceCompat.startForeground(
                this,
                BringRingNotification.NOTIFICATION_ID,
                notification,
                foregroundType(),
            )
        }.onFailure { Timber.w("Bring foreground refused: %s", it.javaClass.simpleName) }
        if (playing == push.bringId) return
        playing = push.bringId
        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({ stopper.expire(push.bringId) }, (push.expiresAtMillis - now).coerceAtLeast(0L))
        startSound()
        startVibration()
    }

    private fun foregroundType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK else 0

    private fun startSound() {
        stopSound()
        val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
            ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ?: return
        player = runCatching {
            MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                setDataSource(this@BringRingService, uri)
                isLooping = true
                prepare()
                start()
            }
        }.onFailure { Timber.w("Bring sound failed: %s", it.javaClass.simpleName) }.getOrNull()
    }

    private fun stopSound() {
        player?.runCatching { stop() }
        player?.release()
        player = null
    }

    private fun vibrator(): Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    private fun startVibration() {
        runCatching {
            vibrator()?.vibrate(
                VibrationEffect.createWaveform(VIBRATION, 0),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build(),
            )
        }
    }

    private fun finish() {
        playing = null
        handler.removeCallbacksAndMessages(null)
        stopSound()
        runCatching { vibrator()?.cancel() }
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        stopSound()
        runCatching { vibrator()?.cancel() }
        scope.cancel()
        super.onDestroy()
    }

    private companion object {
        val VIBRATION = longArrayOf(0, 1_000, 800, 1_000, 800)
    }
}
