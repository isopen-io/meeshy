package me.meeshy.app.calls

import android.content.Context
import dagger.Binds
import dagger.Provides
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.call.CallCue
import me.meeshy.sdk.model.call.CallSound
import me.meeshy.feature.calls.R
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
 * Production controller : sons de marque en `res/raw` (ringback 0,6 pour l'appelant, signaux
 * connecté / terminé), sonnerie APPAREIL + vibration pour le destinataire, filtrées par
 * [CallRingEnvironment]. Aucune décision ici (elles vivent dans `CallSoundPolicy`) : un appareil qui
 * refuse la lecture dégrade en silence, sans jamais faire échouer l'appel. Chaque transition arrête
 * la boucle précédente et libère son lecteur.
 */
@Singleton
class AndroidCallToneController @Inject constructor(
    private val players: CallTonePlayerFactory,
    private val ringtone: CallRingtoneOutput,
    private val environment: CallRingEnvironment,
) : CallToneController {

    private var loop: CallTonePlayer? = null
    private var cue: CallTonePlayer? = null

    override fun setLoop(sound: CallSound) {
        stopLoop()
        when (sound) {
            CallSound.None -> Unit
            CallSound.Ringback -> runCatching {
                loop = players.create(R.raw.call_ringback, looping = true, volume = RINGBACK_VOLUME)?.also { it.start() }
            }
            CallSound.Ringtone -> runCatching { ringtone.start(environment.plan()) }
        }
    }

    override fun playCue(cue: CallCue) {
        runCatching {
            this.cue?.release()
            val resId = when (cue) {
                CallCue.Connected -> R.raw.call_cue_connected
                CallCue.Ended -> R.raw.call_cue_ended
            }
            this.cue = players.create(resId, looping = false, volume = CUE_VOLUME, onCompleted = ::releaseCue)
                ?.also { it.start() }
        }
    }

    override fun release() {
        stopLoop()
        releaseCue()
    }

    private fun releaseCue() {
        cue?.release()
        cue = null
    }

    private fun stopLoop() {
        loop?.release()
        loop = null
        ringtone.stop()
    }

    private companion object {
        const val RINGBACK_VOLUME = 0.6f
        const val CUE_VOLUME = 0.9f
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallToneModule {
    @Binds
    fun bindCallToneController(impl: AndroidCallToneController): CallToneController

    companion object {
        @Provides
        @Singleton
        fun providePlayers(@ApplicationContext context: Context): CallTonePlayerFactory = MediaPlayerToneFactory(context)

        @Provides
        @Singleton
        fun provideRingtone(@ApplicationContext context: Context): CallRingtoneOutput = AndroidCallRingtoneOutput(context)

        @Provides
        @Singleton
        fun provideEnvironment(@ApplicationContext context: Context): CallRingEnvironment = AndroidCallRingEnvironment(context)
    }
}
