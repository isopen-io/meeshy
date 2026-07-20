package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.call.CallRecord
import retrofit2.http.GET
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
     */
    @GET("calls/history")
    suspend fun history(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
        @Query("filter") filter: String? = null,
    ): ApiResponse<List<CallRecord>>
}
