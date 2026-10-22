package me.meeshy.app.calls

import kotlinx.coroutines.CoroutineScope
import me.meeshy.sdk.model.call.CallEvent
import me.meeshy.sdk.model.call.CallState

/**
 * What a call collaborator may ask of the session that owns it (the
 * [CallViewModel]). The host keeps the single copy of the call's state — the FSM
 * phase, the server id, the config — and republishes the [CallUiState]; a
 * collaborator owns only its own slice and reads the rest through this seam, so
 * no collaborator ever holds the view model itself.
 */
interface CallSessionHost {
    /** The scope every collaborator job lives in — cancelled with the call surface. */
    val scope: CoroutineScope

    /** The immutable inputs of the call in flight ([CallConfig.EMPTY] while idle). */
    val config: CallConfig

    /** The id every outbound emit is keyed by — blank until one is known. */
    val callId: String

    /** The local user id, used as the `from` of participant-keyed emits (blank without a session). */
    val selfId: String

    /** The current FSM phase. */
    val callState: CallState

    /** Seconds of connected media so far. */
    val elapsedSeconds: Long

    /** Fold [event] into the FSM exactly as a remote event would be. */
    fun dispatch(event: CallEvent)

    /** Rebuild and publish the [CallUiState] from the current slices. */
    fun publish()
}

/** What an extension point needs to key its work to the call in flight. */
data class CallSessionInfo(
    val callId: String,
    val config: CallConfig,
)

/**
 * `true` while media is (or is being re-)established — the window in which the
 * clock, the quality sampler, the heartbeat and the capture relay run. They all
 * share this one definition so they start and stop together.
 */
internal val CallState.carriesMedia: Boolean
    get() = this is CallState.Connected || this is CallState.Reconnecting

/** Raison wire d'un refus explicite (schéma gateway socketEndCallSchema). */
internal const val END_REASON_REJECTED = "rejected"
