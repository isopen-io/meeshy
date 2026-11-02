package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.model.composer.sound.ApiSound
import me.meeshy.sdk.model.composer.sound.RenameSoundRequest
import me.meeshy.sdk.model.composer.sound.SoundRemoval
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * La bibliothèque de sons — miroir de `SoundLibraryService` (iOS) : « Mes sons » (`GET /sounds/mine`, curseur),
 * « Tendances » (`GET /stories/audio`, public, trié par usage), nommer (`PATCH /sounds/:id`) et RETIRER
 * (`DELETE /sounds/:id`, logique : #9848 — les publications existantes le jouent toujours).
 */
interface SoundLibraryApi {
    @GET("sounds/mine")
    suspend fun mine(
        @Query("cursor") cursor: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiSound>>

    @GET("stories/audio")
    suspend fun trending(
        @Query("q") query: String? = null,
        @Query("limit") limit: Int? = null,
    ): ApiResponse<List<ApiSound>>

    @PATCH("sounds/{id}")
    suspend fun rename(@Path("id") id: String, @Body body: RenameSoundRequest): ApiResponse<ApiSound>

    @DELETE("sounds/{id}")
    suspend fun remove(@Path("id") id: String): ApiResponse<SoundRemoval>
}
