package me.meeshy.sdk.net.api

import me.meeshy.sdk.model.ApiHashtag
import me.meeshy.sdk.model.ApiResponse
import retrofit2.http.GET
import retrofit2.http.Query

/** Les mots-dièse en tendance (`GET /hashtags/trending`). */
interface HashtagApi {
    @GET("hashtags/trending")
    suspend fun trending(@Query("limit") limit: Int? = null): ApiResponse<List<ApiHashtag>>
}
