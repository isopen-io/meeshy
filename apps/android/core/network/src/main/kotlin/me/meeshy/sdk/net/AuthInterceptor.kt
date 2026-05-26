package me.meeshy.sdk.net

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Attaches the auth header to every request:
 * `Authorization: Bearer <jwt>` when a JWT is present, otherwise `X-Session-Token`.
 */
class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val builder = chain.request().newBuilder()
        val jwt = tokenStore.jwt
        val session = tokenStore.sessionToken
        when {
            jwt != null -> builder.header("Authorization", "Bearer $jwt")
            session != null -> builder.header("X-Session-Token", session)
        }
        return chain.proceed(builder.build())
    }
}
