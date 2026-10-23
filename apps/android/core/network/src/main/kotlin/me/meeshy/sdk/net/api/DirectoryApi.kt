package me.meeshy.sdk.net.api

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.ApiResponse
import retrofit2.http.GET
import retrofit2.http.Query

/** Une entree de presence SERVIE. Absente de la charge = masquee : le client ne comble rien. */
@Serializable
data class PresenceEntry(
    val userId: String,
    val isOnline: Boolean = false,
    val lastActiveAt: String? = null,
)

@Serializable
data class PresenceSnapshot(val users: List<PresenceEntry> = emptyList())

/**
 * Instantane de presence (`ids` = liste separee par des virgules, 200 au plus). La visibilite est
 * decidee par la passerelle (amis acceptes, soi, ADMIN) ; `users/presence` est l'alias historique.
 */
interface DirectoryApi {
    @GET("directory/presence")
    suspend fun presence(@Query("ids") ids: String): ApiResponse<PresenceSnapshot>

    @GET("users/presence")
    suspend fun legacyPresence(@Query("ids") ids: String): ApiResponse<PresenceSnapshot>
}
