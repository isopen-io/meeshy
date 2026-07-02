package me.meeshy.app.calls

import android.content.Context
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Build
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.call.CallCue
import me.meeshy.sdk.model.call.CallSound
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The output seam for call audio: it turns the decisions of the pure
 * [me.meeshy.sdk.model.call.CallSoundPolicy] into sound. Isolating it behind an
 * interface keeps every *decision* (which loop, which cue, when) in the tested
 * policy + the [CallViewModel] fold, and leaves the concrete player as thin,
 * decision-free Android-framework glue — so the VM's audio behaviour is asserted
 * through a recording fake, no device required.
 *
 * [setLoop] is idempotent on the caller's side (the VM only calls it on a genuine
 * loop change), so the implementation may assume each call is a real transition.
 */
interface CallToneController {
    /** Make [sound] the active continuous loop, replacing any current loop. */
    fun setLoop(sound: CallSound)

    /** Fire a one-shot [cue]. */
    fun playCue(cue: CallCue)

    /** Stop and free every player — called when the call surface is torn down. */
    fun release()
}

/**
 * Production controller: standard call tones via [ToneGenerator] for the caller
 * ringback + cues, and the device ringtone via [RingtoneManager] for the callee
 * alert. Pure Android-framework glue (no branching decisions) — every entry point
 * is wrapped so a device that refuses a [ToneGenerator] (a known OEM quirk) or a
 * null default ringtone degrades to silence rather than crashing the call.
 */
@Singleton
class AndroidCallToneController @Inject constructor(
    @ApplicationContext private val context: Context,
) : CallToneController {

    private var loopTone: ToneGenerator? = null
    private var ringtone: Ringtone? = null
    private var cueTone: ToneGenerator? = null

    override fun setLoop(sound: CallSound) {
        stopLoop()
        when (sound) {
            CallSound.None -> Unit
            CallSound.Ringback -> runCatching {
                loopTone = ToneGenerator(AudioManager.STREAM_VOICE_CALL, RINGBACK_VOLUME).apply {
                    startTone(ToneGenerator.TONE_SUP_RINGTONE)
                }
            }
            CallSound.Ringtone -> runCatching {
                val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                ringtone = RingtoneManager.getRingtone(context, uri)?.apply {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) isLooping = true
                    play()
                }
            }
        }
    }

    override fun playCue(cue: CallCue) {
        runCatching {
            val tone = cueTone ?: ToneGenerator(AudioManager.STREAM_VOICE_CALL, CUE_VOLUME)
                .also { cueTone = it }
            val (type, durationMs) = when (cue) {
                CallCue.Connected -> ToneGenerator.TONE_PROP_ACK to CONNECTED_CUE_MS
                CallCue.Ended -> ToneGenerator.TONE_PROP_PROMPT to ENDED_CUE_MS
            }
            tone.startTone(type, durationMs)
        }
    }

    override fun release() {
        stopLoop()
        cueTone?.release()
        cueTone = null
    }

    private fun stopLoop() {
        loopTone?.let {
            it.stopTone()
            it.release()
        }
        loopTone = null
        ringtone?.stop()
        ringtone = null
    }

    private companion object {
        const val RINGBACK_VOLUME = 70
        const val CUE_VOLUME = 80
        const val CONNECTED_CUE_MS = 180
        const val ENDED_CUE_MS = 250
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallToneModule {
    @Binds
    fun bindCallToneController(impl: AndroidCallToneController): CallToneController
}
