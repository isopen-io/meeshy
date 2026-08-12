package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.friend.BlockedUser
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** Response of a block/unblock action — port of iOS `BlockActionResponse`. */
@Serializable
data class BlockActionResponse(
    val message: String? = null,
)

/** Block / unblock and blocked-user listing — port of iOS `BlockService`. */
interface BlockApi {
    @GET("users/me/blocked-users")
    suspend fun listBlocked(): ApiResponse<List<BlockedUser>>

    @POST("users/{userId}/block")
    suspend fun block(@Path("userId") userId: String): ApiResponse<BlockActionResponse>

    @DELETE("users/{userId}/block")
    suspend fun unblock(@Path("userId") userId: String): ApiResponse<Unit>
}
