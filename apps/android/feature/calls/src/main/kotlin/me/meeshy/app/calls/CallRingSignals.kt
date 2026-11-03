package me.meeshy.app.calls

import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import me.meeshy.sdk.model.call.CallDndFilter
import me.meeshy.sdk.model.call.CallRingGate
import me.meeshy.sdk.model.call.CallRingPlan
import me.meeshy.sdk.model.call.CallRingerMode

/** Un lecteur de son d'appel : démarre, s'arrête, libère. Toute panne d'appareil est avalée par l'implémentation. */
interface CallTonePlayer {
    fun start()
    fun release()
}

/** Fabrique de lecteurs depuis une ressource `res/raw` ; `null` quand l'appareil refuse la lecture. */
interface CallTonePlayerFactory {
    fun create(resId: Int, looping: Boolean, volume: Float, onCompleted: () -> Unit = {}): CallTonePlayer?
}

/** Ce que l'appareil autorise un appel entrant à émettre (loi pure [CallRingGate] alimentée par l'état système). */
interface CallRingEnvironment {
    fun plan(): CallRingPlan
}

/** La sonnerie appareil + la vibration 1 s / 0,8 s du destinataire. */
interface CallRingtoneOutput {
    fun start(plan: CallRingPlan)
    fun stop()
}

internal class MediaPlayerToneFactory(private val context: Context) : CallTonePlayerFactory {
    override fun create(resId: Int, looping: Boolean, volume: Float, onCompleted: () -> Unit): CallTonePlayer? =
        runCatching {
            val attributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            val player = MediaPlayer.create(context, resId, attributes, AudioManager.AUDIO_SESSION_ID_GENERATE)
                ?: return null
            player.isLooping = looping
            player.setVolume(volume, volume)
            player.setOnCompletionListener { onCompleted() }
            object : CallTonePlayer {
                override fun start() {
                    runCatching { player.start() }
                }

                override fun release() {
                    runCatching { player.stop() }
                    runCatching { player.release() }
                }
            }
        }.getOrNull()
}

internal class AndroidCallRingEnvironment(private val context: Context) : CallRingEnvironment {
    override fun plan(): CallRingPlan = runCatching {
        val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val notifications = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val ringer = when (audio.ringerMode) {
            AudioManager.RINGER_MODE_SILENT -> CallRingerMode.Silent
            AudioManager.RINGER_MODE_VIBRATE -> CallRingerMode.Vibrate
            else -> CallRingerMode.Normal
        }
        val dnd = when (notifications.currentInterruptionFilter) {
            NotificationManager.INTERRUPTION_FILTER_PRIORITY -> CallDndFilter.Priority
            NotificationManager.INTERRUPTION_FILTER_ALARMS -> CallDndFilter.Alarms
            NotificationManager.INTERRUPTION_FILTER_NONE -> CallDndFilter.None
            else -> CallDndFilter.Off
        }
        CallRingGate.plan(
            ringerMode = ringer,
            dnd = dnd,
            callerIsException = false,
            ringVolume = audio.getStreamVolume(AudioManager.STREAM_RING),
            vibrationEnabled = vibrationAllowed(),
        )
    }.getOrDefault(CallRingPlan(sound = true, vibrate = true))

    private fun vibrationAllowed(): Boolean =
        runCatching { Settings.System.getInt(context.contentResolver, "vibrate_when_ringing", 1) == 1 }
            .getOrDefault(true)
}

internal class AndroidCallRingtoneOutput(private val context: Context) : CallRingtoneOutput {
    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null

    override fun start(plan: CallRingPlan) {
        stop()
        if (plan.sound) {
            runCatching {
                val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                ringtone = RingtoneManager.getRingtone(context, uri)?.apply {
                    audioAttributes = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) isLooping = true
                    play()
                }
            }
        }
        if (plan.vibrate) {
            runCatching {
                @Suppress("DEPRECATION")
                val v = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                v?.vibrate(VibrationEffect.createWaveform(VIBRATION_PATTERN, 0))
                vibrator = v
            }
        }
    }

    override fun stop() {
        runCatching { ringtone?.stop() }
        ringtone = null
        runCatching { vibrator?.cancel() }
        vibrator = null
    }

    private companion object {
        val VIBRATION_PATTERN = longArrayOf(0, 1_000, 800)
    }
}
