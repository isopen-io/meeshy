package me.meeshy.app.calls

import android.media.projection.MediaProjection
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import javax.inject.Inject
import javax.inject.Singleton

/** Pour quoi la capture est demandée : le partage d'écran ou l'enregistrement vidéo de l'appel. */
enum class MediaProjectionPurpose { ScreenShare, Recording }

enum class MediaProjectionEndReason {
    /** « Arrêter » dans la notification ou dans l'écran d'appel. */
    UserStopped,

    /** Le système a repris la projection (barre d'état, verrouillage, autre capture). */
    SystemStopped,

    /** L'appel s'est terminé : la projection n'a plus de raison d'être. */
    CallEnded,

    /** Le service n'a pas pu obtenir la projection (jeton déjà consommé, démarrage refusé). */
    Failed,
}

sealed interface MediaProjectionState {
    data object Idle : MediaProjectionState
    data class AwaitingConsent(val purpose: MediaProjectionPurpose) : MediaProjectionState
    data class Starting(val purpose: MediaProjectionPurpose) : MediaProjectionState
    data class Active(val purpose: MediaProjectionPurpose) : MediaProjectionState

    /** Le dialogue système a été refusé : l'écran affiche un message dédié. */
    data class Denied(val purpose: MediaProjectionPurpose) : MediaProjectionState
    data class Ended(val purpose: MediaProjectionPurpose, val reason: MediaProjectionEndReason) : MediaProjectionState
}

/** Démarre et arrête le service de premier plan de la projection ; remplaçable en test. */
interface MediaProjectionServiceLauncher {
    fun start(purpose: MediaProjectionPurpose, consent: MediaProjectionConsent.Granted)
    fun stop()
}

/**
 * La brique commune du partage d'écran et de l'enregistrement vidéo : une seule projection à la
 * fois, jamais sans accord système, tenue par un service de premier plan. Le jeton d'accord est
 * à usage unique : après tout arrêt (utilisateur, système, fin d'appel) il faut redemander.
 */
@Singleton
class MediaProjectionSession @Inject constructor(
    private val launcher: MediaProjectionServiceLauncher,
) {
    private val _state = MutableStateFlow<MediaProjectionState>(MediaProjectionState.Idle)
    val state: StateFlow<MediaProjectionState> = _state.asStateFlow()

    @Volatile
    private var held: MediaProjection? = null

    /** La projection vivante, pour le consommateur (partage, enregistrement) ; `null` hors `Active`. */
    fun projection(): MediaProjection? = if (_state.value is MediaProjectionState.Active) held else null

    /** Annonce une demande ; `false` si une capture est déjà en cours ou en attente. */
    fun request(purpose: MediaProjectionPurpose): Boolean {
        var accepted = false
        _state.update { current ->
            accepted = current.isFree()
            if (accepted) MediaProjectionState.AwaitingConsent(purpose) else current
        }
        return accepted
    }

    fun onConsent(consent: MediaProjectionConsent) {
        var started: MediaProjectionPurpose? = null
        _state.update { current ->
            started = null
            if (current !is MediaProjectionState.AwaitingConsent) return@update current
            when (consent) {
                is MediaProjectionConsent.Granted -> {
                    started = current.purpose
                    MediaProjectionState.Starting(current.purpose)
                }
                MediaProjectionConsent.Denied -> MediaProjectionState.Denied(current.purpose)
            }
        }
        val purpose = started ?: return
        launcher.start(purpose, consent as MediaProjectionConsent.Granted)
    }

    fun onProjectionAcquired(projection: MediaProjection) {
        held = projection
        _state.update { if (it is MediaProjectionState.Starting) MediaProjectionState.Active(it.purpose) else it }
    }

    fun onProjectionFailed() = end(MediaProjectionEndReason.Failed, stopService = true)

    fun stop() = end(MediaProjectionEndReason.UserStopped, stopService = true)

    fun onSystemStop() = end(MediaProjectionEndReason.SystemStopped, stopService = true)

    fun onCallEnded() = end(MediaProjectionEndReason.CallEnded, stopService = true)

    /** Le service a disparu de lui-même : rien à arrêter, seulement à constater. */
    fun onServiceDestroyed() = end(MediaProjectionEndReason.SystemStopped, stopService = false)

    /** Le refus a été montré : retour au repos. */
    fun acknowledgeDenied() {
        _state.update { if (it is MediaProjectionState.Denied) MediaProjectionState.Idle else it }
    }

    private fun end(reason: MediaProjectionEndReason, stopService: Boolean) {
        var ended = false
        _state.update { current ->
            val purpose = current.livePurpose()
            ended = purpose != null
            if (purpose == null) current else MediaProjectionState.Ended(purpose, reason)
        }
        if (!ended) return
        held = null
        if (stopService) launcher.stop()
    }

    private fun MediaProjectionState.isFree(): Boolean =
        this is MediaProjectionState.Idle || this is MediaProjectionState.Denied || this is MediaProjectionState.Ended

    private fun MediaProjectionState.livePurpose(): MediaProjectionPurpose? = when (this) {
        is MediaProjectionState.AwaitingConsent -> purpose
        is MediaProjectionState.Starting -> purpose
        is MediaProjectionState.Active -> purpose
        else -> null
    }
}
