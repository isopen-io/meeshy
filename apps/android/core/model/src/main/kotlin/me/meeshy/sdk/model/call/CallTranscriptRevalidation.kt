package me.meeshy.sdk.model.call

/** What the gateway answered when a call's transcript was revalidated. */
sealed interface CallTranscriptRemote {
    data class Served(val page: CallTranscriptPage) : CallTranscriptRemote

    /** A failure; [httpStatus] is `null` when the request never got an answer (offline). */
    data class Failed(val httpStatus: Int?) : CallTranscriptRemote
}

/** What the encrypted local copy of a transcript becomes after a revalidation. */
sealed interface CallTranscriptCacheAction {
    data object Keep : CallTranscriptCacheAction
    data class Store(val page: CallTranscriptPage) : CallTranscriptCacheAction
    data object Drop : CallTranscriptCacheAction
}

data class CallTranscriptRefresh(val state: CallTranscriptState, val cache: CallTranscriptCacheAction)

/**
 * Cache first, then the server (#13677) — the Android form of iOS `CallTranscriptLoader`, which serves the encrypted
 * local copy and falls back to the replay. Here the copy is drawn at once and the replay always revalidates it:
 *
 *  - a served transcript replaces the copy; an empty one, a refusal (403) or an unknown call (404) removes it — the
 *    server is the truth of who may read it, and a copy never outlives that right;
 *  - a transient failure (offline, server error) keeps the copy and keeps showing it; with no copy, the retry shows;
 *  - a conversation sealed end to end has no server transcript: nothing is shown and no copy is kept.
 */
object CallTranscriptRevalidation {
    fun revalidated(
        cached: CallTranscriptState?,
        remote: CallTranscriptRemote,
        project: (CallTranscriptPage) -> List<CallTranscriptLine>,
    ): CallTranscriptRefresh = when (remote) {
        is CallTranscriptRemote.Served -> {
            val lines = project(remote.page)
            if (lines.isEmpty()) {
                CallTranscriptRefresh(CallTranscriptState.Absent, CallTranscriptCacheAction.Drop)
            } else {
                CallTranscriptRefresh(CallTranscriptState.Ready(lines), CallTranscriptCacheAction.Store(remote.page))
            }
        }
        is CallTranscriptRemote.Failed -> when (val state = CallTranscriptState.forFailure(remote.httpStatus)) {
            CallTranscriptState.Absent -> CallTranscriptRefresh(state, CallTranscriptCacheAction.Drop)
            else -> CallTranscriptRefresh(cached as? CallTranscriptState.Ready ?: state, CallTranscriptCacheAction.Keep)
        }
    }

    val sealedEndToEnd: CallTranscriptRefresh =
        CallTranscriptRefresh(CallTranscriptState.Absent, CallTranscriptCacheAction.Drop)
}
