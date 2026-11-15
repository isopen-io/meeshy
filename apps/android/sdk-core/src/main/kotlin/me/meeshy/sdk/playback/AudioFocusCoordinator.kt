package me.meeshy.sdk.playback

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.playback.ContentPlaybackAudibility
import me.meeshy.sdk.model.playback.ContentPlaybackSessionLaw
import me.meeshy.sdk.model.playback.MediaSessionEvent

/** Ce que le système dit d'un focus tenu. */
public enum class FocusChange { Gain, LossTransient, LossTransientCanDuck, Loss }

/** Les deux demandes de focus de Meeshy. */
public enum class FocusKind {
    /** Un son de contenu : les autres applications se mettent en pause. */
    Playback,

    /** Un enregistrement : prise exclusive et transitoire. */
    Recording,
}

/** La couture sur `AudioManager` : tient le focus pour la logique, sans plateforme. */
public interface AudioFocusSystem {
    /** `false` quand le système refuse (un appel en cours). */
    public fun request(kind: FocusKind, onChange: (FocusChange) -> Unit): Boolean
    public fun abandon(kind: FocusKind)
}

/** Casque débranché (`ACTION_AUDIO_BECOMING_NOISY`) : [register] rend la fonction qui désabonne. */
public interface NoisyRouteSource {
    public fun register(onNoisy: () -> Unit): () -> Unit
}

public class AndroidAudioFocusSystem(private val audioManager: AudioManager) : AudioFocusSystem {
    private val requests = HashMap<FocusKind, AudioFocusRequest>()
    private val handler = Handler(Looper.getMainLooper())

    @Synchronized
    override fun request(kind: FocusKind, onChange: (FocusChange) -> Unit): Boolean {
        abandon(kind)
        val gain = when (kind) {
            FocusKind.Playback -> AudioManager.AUDIOFOCUS_GAIN
            FocusKind.Recording -> AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE
        }
        val request = AudioFocusRequest.Builder(gain)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
            .setWillPauseWhenDucked(false)
            .setOnAudioFocusChangeListener({ change -> change.toFocusChange()?.let(onChange) }, handler)
            .build()
        val granted = audioManager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        if (granted) requests[kind] = request
        return granted
    }

    @Synchronized
    override fun abandon(kind: FocusKind) {
        requests.remove(kind)?.let { audioManager.abandonAudioFocusRequest(it) }
    }

    private fun Int.toFocusChange(): FocusChange? = when (this) {
        AudioManager.AUDIOFOCUS_GAIN -> FocusChange.Gain
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> FocusChange.LossTransient
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> FocusChange.LossTransientCanDuck
        AudioManager.AUDIOFOCUS_LOSS -> FocusChange.Loss
        else -> null
    }
}

public class AndroidNoisyRouteSource(private val context: Context) : NoisyRouteSource {
    override fun register(onNoisy: () -> Unit): () -> Unit {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) onNoisy()
            }
        }
        val app = context.applicationContext
        app.registerReceiver(receiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY))
        return { runCatching { app.unregisterReceiver(receiver) } }
    }
}

/**
 * **Le gestionnaire de focus audio de Meeshy** (iOS `MediaSessionCoordinator`) : il traduit le
 * système en [MediaSessionEvent] — la décision (pause, reprise) appartient à
 * `InterruptionResumeLedger`, pas à lui.
 *
 * - un média audible demande le focus (les autres applications se taisent), un média muet n'en
 *   demande aucun ;
 * - perte transitoire : début d'interruption, puis fin « reprendre » au retour du focus ; perte
 *   définitive : début puis fin « sans reprise » ; perte avec ducking : [ducked] ;
 * - casque débranché : [MediaSessionEvent.RouteChangedOldDeviceUnavailable] ;
 * - trois secondes après une pause de l'utilisateur le focus est rendu, une relance annule ;
 * - un appel Meeshy tient la session : le coordinateur ne lui dispute rien ;
 * - un enregistrement tient le focus à son tour : il ne s'interrompt pas lui-même.
 */
public class AudioFocusCoordinator(
    private val system: AudioFocusSystem,
    private val noisy: NoisyRouteSource,
    private val interruption: PlaybackInterruptionState,
    private val isCallActive: () -> Boolean,
    dispatcher: CoroutineDispatcher,
) {
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)
    private val mutableEvents = MutableSharedFlow<MediaSessionEvent>(extraBufferCapacity = 16)
    private val mutableDucked = MutableStateFlow(false)
    private var held = false
    private var unregisterNoisy: (() -> Unit)? = null
    private var pendingRelease: Job? = null
    private var recordingHolds = false

    public val events: SharedFlow<MediaSessionEvent> = mutableEvents.asSharedFlow()

    /** Une autre application a pris le focus mais autorise de continuer plus bas. */
    public val ducked: StateFlow<Boolean> = mutableDucked.asStateFlow()

    public val holdsFocus: Boolean get() = held

    /**
     * Demande le focus pour un son [audibility]. `true` : le son peut démarrer ; `false` : le
     * système refuse ou un appel tient la session.
     */
    public fun requestPlayback(audibility: ContentPlaybackAudibility): Boolean {
        pendingRelease?.cancel()
        pendingRelease = null
        if (audibility == ContentPlaybackAudibility.Muted) return true
        if (isCallActive()) return false
        if (held) return true
        held = system.request(FocusKind.Playback, ::onFocusChange)
        if (held) unregisterNoisy = noisy.register(::onNoisy)
        return held
    }

    /** L'utilisateur a mis en pause : le focus n'est rendu qu'au bout du délai de la loi. */
    public fun onUserPaused() {
        pendingRelease?.cancel()
        pendingRelease = scope.launch {
            delay(ContentPlaybackSessionLaw.USER_PAUSE_RELEASE_DELAY_MILLIS)
            release()
        }
    }

    /** Fin de lecture ou lecteur libéré : le focus est rendu tout de suite. */
    public fun release() {
        pendingRelease?.cancel()
        pendingRelease = null
        unregisterNoisy?.invoke()
        unregisterNoisy = null
        mutableDucked.value = false
        if (!held) return
        held = false
        system.abandon(FocusKind.Playback)
    }

    /** Un appel Meeshy décroche : on rend le focus sans rien annoncer, l'appel tient la session. */
    public fun yieldToCall() {
        release()
    }

    /** L'appel est raccroché : les lecteurs interrompus sont invités à reprendre. */
    public fun onCallEnded() {
        mutableEvents.tryEmit(MediaSessionEvent.CallEndedShouldResume)
    }

    /** L'enregistrement tient (ou rend) le focus : les pertes qu'il provoque ne sont pas des interruptions. */
    public fun setRecordingHold(holds: Boolean) {
        recordingHolds = holds
    }

    internal fun onFocusChange(change: FocusChange) {
        if (recordingHolds || !held) return
        when (change) {
            FocusChange.Gain -> {
                mutableDucked.value = false
                if (interruption.current.value.cause == InterruptionCause.Focus) {
                    interruption.end()
                    mutableEvents.tryEmit(MediaSessionEvent.InterruptionEndedShouldResume)
                }
            }

            FocusChange.LossTransient -> {
                interruption.begin(InterruptionCause.Focus)
                mutableEvents.tryEmit(MediaSessionEvent.InterruptionBegan)
            }

            FocusChange.LossTransientCanDuck -> mutableDucked.value = true

            FocusChange.Loss -> {
                mutableEvents.tryEmit(MediaSessionEvent.InterruptionBegan)
                mutableEvents.tryEmit(MediaSessionEvent.InterruptionEndedShouldNotResume)
                interruption.end()
                mutableDucked.value = false
                unregisterNoisy?.invoke()
                unregisterNoisy = null
                held = false
            }
        }
    }

    internal fun onNoisy() {
        mutableEvents.tryEmit(MediaSessionEvent.RouteChangedOldDeviceUnavailable)
    }
}
