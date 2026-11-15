package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.friend.BlockedUser
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** Response of a block/unblock action — port of iOS `BlockActionResponse`. */
@Serializable
data class BlockActionResponse(
    val message: String? = null,
)

/**
 * Block / unblock and blocked-user listing — port of iOS `BlockService`, on the
 * CANONICAL directory addresses (#4164).
 *
 * Blocking is a MEMBERSHIP of a set, hence `PUT` (idempotent: a second call answers
 * the same state and the same status, where the old `POST /users/{id}/block` answered
 * `409`). The offline queue relies on it: it replays `BLOCK_USER` / `UNBLOCK_USER`
 * rows recorded BEFORE an app update, and those rows carry only the target id — never
 * a path — so they leave on these routes with no queue migration. The three legacy
 * aliases (`POST/DELETE users/{id}/block`, `GET users/me/blocked-users`) are no longer
 * called from Android.
 */
interface BlockApi {
    /** One page of blocked users, cursor on the user id (the gateway caps `limit` at 100). */
    @GET("directory/blocks")
    suspend fun listBlocked(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<BlockedUser>>

    @PUT("directory/blocks/{userId}")
    suspend fun block(@Path("userId") userId: String): ApiResponse<BlockActionResponse>

    @DELETE("directory/blocks/{userId}")
    suspend fun unblock(@Path("userId") userId: String): ApiResponse<BlockActionResponse>
}
