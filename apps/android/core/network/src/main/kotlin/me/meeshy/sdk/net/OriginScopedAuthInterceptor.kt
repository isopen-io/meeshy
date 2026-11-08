package me.meeshy.sdk.net

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response

/**
 * **L'identité part vers l'origine de l'API Meeshy, et nulle part ailleurs** (miroir de `DiskCacheStore.networkRequest`,
 * iOS). `Authorization: Bearer` (prioritaire) ou, à défaut, `X-Session-Token` ; une requête vers un CDN ou un tiers
 * reste NUE : un jeton ne fuit jamais.
 *
 * L'origine se compare sur (schéma, hôte, port), les ports implicites normalisés par OkHttp (443 en https, 80 en http).
 * Montée comme intercepteur RÉSEAU : elle voit chaque saut d'une redirection et RETIRE l'identité d'un saut qui quitte
 * l'origine (OkHttp ne retire de lui-même que `Authorization`, jamais `X-Session-Token`). Le jeton est relu à chaque
 * requête : un changement de compte ou une déconnexion s'applique sans redémarrage.
 */
class OriginScopedAuthInterceptor(
    private val tokenStore: TokenStore,
    private val apiBaseUrl: () -> String?,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val builder = request.newBuilder()
            .removeHeader(RequestCredential.AUTHORIZATION)
            .removeHeader(RequestCredential.SESSION_TOKEN)
        if (isApiOrigin(request.url)) RequestCredential.of(tokenStore)?.applyTo(builder)
        return chain.proceed(builder.build())
    }

    private fun isApiOrigin(url: HttpUrl): Boolean {
        val api = apiBaseUrl()?.toHttpUrlOrNull() ?: return false
        return url.scheme == api.scheme && url.host == api.host && url.port == api.port
    }
}
