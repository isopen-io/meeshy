package me.meeshy.sdk.net.api

import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Path

/** Redirection courte `/l/:token` — port de `LEndpoint` ; la réponse est une redirection, pas du JSON. */
interface RedirectApi {
    @GET("l/{token}")
    suspend fun follow(@Path("token") token: String): Response<ResponseBody>
}
