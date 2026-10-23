package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.call.CallRecord
import me.meeshy.sdk.model.call.CallHistoryClearResult
import me.meeshy.sdk.model.call.CallHistoryHideResult
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * The call journal REST surface — port of the iOS `CallHistoryService` fetch.
 *
 * Mirrors the gateway route `GET /api/v1/calls/history`
 * (`services/gateway/src/routes/calls.ts`): a cursor-paginated list of terminal
 * calls (ended/missed/rejected/failed) over a 3-month sliding window, newest
 * first. Each item decodes 1:1 into a [CallRecord]; the `pagination.nextCursor`
 * drives paging.
 */
interface CallHistoryApi {
    /**
     * @param filter `"all"` (default) or `"missed"` — mirrors the gateway enum.
     * @param cursor opaque cursor (a call id) for the next page; null for the first.
     * @param limit page size (gateway clamps to 1..50, default 30).
     * @param type `"audio"` / `"video"`; null (not sent) keeps both (#8203).
     * @param q name search, folded, 100 characters max; null (not sent) = no search (#8203).
     */
    @GET("calls/history")
    suspend fun history(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
        @Query("filter") filter: String? = null,
        @Query("type") type: String? = null,
        @Query("q") q: String? = null,
    ): ApiResponse<List<CallRecord>>

    /** Hides one call from the reader's own journal; the other participants keep theirs (#8066). */
    @DELETE("calls/history/{callId}")
    suspend fun hide(@Path("callId") callId: String): ApiResponse<CallHistoryHideResult>

    /** Clears the reader's own journal and answers how many calls left it (#8066). */
    @DELETE("calls/history")
    suspend fun clearAll(): ApiResponse<CallHistoryClearResult>
}
