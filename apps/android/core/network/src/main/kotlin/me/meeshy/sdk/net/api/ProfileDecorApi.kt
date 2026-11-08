package me.meeshy.sdk.net.api

import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path

/**
 * Les autocollants personnels de MON compte (le décor de profil s'équipe par `UserApi.updateProfileDecor`, `PUT
 * /me/profile-decor`, seul site de cette route). La bibliothèque d'autocollants se lit,
 * s'enrichit d'une image (multipart `file`, `origin` et `name` facultatifs), se vide d'un autocollant et note l'usage
 * d'un autocollant (il remonte en tête). Les charges sont rendues brutes : une valeur ajoutée côté serveur ne fait
 * jamais échouer une lecture déjà acquise. Aucun écran n'est ajouté par ce lot.
 */
interface ProfileDecorApi {
    @GET("me/stickers")
    suspend fun stickers(): ApiResponse<JsonElement>

    @Multipart
    @POST("me/stickers")
    suspend fun createSticker(
        @Part file: MultipartBody.Part,
        @Part("origin") origin: RequestBody? = null,
        @Part("name") name: RequestBody? = null,
    ): ApiResponse<JsonElement>

    @DELETE("me/stickers/{stickerId}")
    suspend fun deleteSticker(@Path("stickerId") stickerId: String): ApiResponse<JsonElement>

    @POST("me/stickers/{stickerId}/use")
    suspend fun useSticker(@Path("stickerId") stickerId: String): ApiResponse<JsonElement>
}
