package me.meeshy.sdk.net

import me.meeshy.sdk.model.auth.TokenRefreshPolicy
import me.meeshy.sdk.model.net.EndpointAuthKind
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Renouvelle AVANT l'envoi un JWT échu (marge 30 s), sur une route bearer seulement
 * (iOS : `shouldAttemptRefresh && isTokenExpired`). Une requête qui porte déjà son identité
 * (jeton figé) part telle quelle. Cinq requêtes parallèles échues = un seul renouvellement,
 * le [SessionRefresher] sérialisant. Un échec ne bloque pas l'envoi : le 401 prendra le relais.
 */
public class ProactiveRefreshInterceptor(
    private val tokenStore: TokenStore,
    private val refresher: SessionRefresher,
    private val apiPathPrefix: String = "/api/v1",
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val carried = RequestCredential.carriedBy(request) != null ||
            request.header(RequestCredential.SESSION_TOKEN) != null
        if (carried || request.routePolicy().authKind != EndpointAuthKind.BEARER) return chain.proceed(request)
        val endpoint = request.url.encodedPath.removePrefix(apiPathPrefix)
        val jwt = tokenStore.jwt
        if (TokenRefreshPolicy.shouldRefreshBeforeSend(endpoint, jwt, System.currentTimeMillis() / 1000.0)) {
            refresher.renewBlocking(requireNotNull(jwt), sentUnderGeneration = null)
        }
        return chain.proceed(request)
    }
}
