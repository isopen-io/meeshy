package me.meeshy.sdk.call

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.sdk.net.api.ActiveCallApi

/**
 * Active-call discovery — port of iOS `ActiveCallService` (parité rejoin
 * 2026-07-12). Reconciles a screen's local idea of « pas d'appel » with the
 * server's after the local call session was lost (app relaunch, crash) while
 * the call is still ongoing server-side.
 *
 * Probe semantics: any failure — transport, 4xx, `success=false` — degrades to
 * `null` (« pas d'appel actif »). The affordance simply doesn't show; the
 * surface that probes is never broken by its probe.
 */
@Singleton
class ActiveCallRepository @Inject constructor(
    private val activeCallApi: ActiveCallApi,
) {
    /** The conversation's active call, or null if none / unreachable. */
    suspend fun activeCallFor(conversationId: String): ActiveCallSession? =
        runCatching { activeCallApi.activeCallForConversation(conversationId) }
            .getOrNull()
            ?.takeIf { it.success }
            ?.data
}
