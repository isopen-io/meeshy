package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.call.ActiveCallSession
import retrofit2.http.GET
import retrofit2.http.Path

/**
 * Active-call discovery — port of iOS `ActiveCallService` (parité rejoin
 * 2026-07-12). Two gateway routes (`services/gateway/src/routes/calls.ts`),
 * both serializing `callSessionSchema`; `data` is null when no call is
 * active:
 *
 * - `GET /conversations/:id/active-call` — the conversation-scoped probe a
 *   header/live-bubble affordance revalidates before offering « Rejoindre » ;
 * - `GET /calls/active` — crash recovery: the user's own active call across
 *   all conversations, for an app relaunch that lost its call session.
 */
interface ActiveCallApi {
    @GET("conversations/{conversationId}/active-call")
    suspend fun activeCallForConversation(
        @Path("conversationId") conversationId: String,
    ): ApiResponse<ActiveCallSession>

    @GET("calls/active")
    suspend fun activeCall(): ApiResponse<ActiveCallSession>
}
