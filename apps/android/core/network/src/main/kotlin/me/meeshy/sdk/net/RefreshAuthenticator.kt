package me.meeshy.sdk.net

import me.meeshy.sdk.model.auth.TokenRefreshPolicy
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

/** Le préfixe que les gardiens de session retirent pour ramener un chemin à la forme de la politique. */
internal const val API_PATH_PREFIX: String = "/api/v1"

/**
 * L'`Authenticator` d'OkHttp qui transforme les décisions pures de
 * [TokenRefreshPolicy] en rejeu réel (iOS `APIClient.resolveUnauthorized`).
 *
 * Sur chaque 401, [authenticate] demande à [TokenRefreshPolicy.decideOn401] quoi faire, avec
 * [Response.priorResponse] comme garde « déjà rejoué une fois » — une session morte ne peut
 * jamais boucler :
 *  - **InvalidCredentials** (`/auth/login`, `/auth/login/2fa`…) : on abandonne SANS toucher
 *    à la session existante ni renouveler.
 *  - **Teardown** : session réellement morte (déjà rejoué, ou jeton de la poignée de main
 *    refusé) : on démonte la session du SEUL compte propriétaire de la requête.
 *  - **RefreshAndRetry** : [SessionRefresher.renewBlocking] au nom du jeton PRÉSENTÉ, en un
 *    seul vol ; jamais pour une requête épinglée, un invité, ni une requête qui n'est plus
 *    celle du compte actif (jamais d'action au nom d'un autre compte).
 *
 * L'endpoint est ramené à la forme de la politique en retirant [apiPathPrefix].
 */
class RefreshAuthenticator(
    private val tokenStore: TokenStore,
    private val refresher: SessionRefresher,
    private val apiPathPrefix: String = API_PATH_PREFIX,
) : Authenticator {

    override fun authenticate(route: Route?, response: Response): Request? {
        val request = response.request
        val endpoint = endpointOf(request.url.encodedPath)
        val hasRefreshed = response.priorResponse != null
        return when (
            TokenRefreshPolicy.decideOn401(endpoint = endpoint, serverMessage = null, hasRefreshedOn401 = hasRefreshed)
        ) {
            is TokenRefreshPolicy.Unauthorized401Decision.InvalidCredentials -> null
            TokenRefreshPolicy.Unauthorized401Decision.Teardown -> {
                clearIfOwner(request)
                null
            }
            TokenRefreshPolicy.Unauthorized401Decision.RefreshAndRetry -> replayWithRenewedToken(request)
        }
    }

    private fun clearIfOwner(request: Request) {
        val sent = request.sentCredential()
        val presented = RequestCredential.carriedBy(request)?.token
        if (refresher.owns(presented, sent?.generation)) tokenStore.clear()
    }

    private fun replayWithRenewedToken(request: Request): Request? {
        val sent = request.sentCredential()
        if (sent?.pinned == true) return null
        val presented = RequestCredential.carriedBy(request)?.bearerToken ?: return null
        return when (val renewal = refresher.renewBlocking(presented, sent?.generation)) {
            is Renewal.Renewed -> RequestCredential.Bearer(renewal.jwt).applyTo(request.newBuilder()).build()
            Renewal.Abandoned, Renewal.Failed -> null
        }
    }

    private fun endpointOf(encodedPath: String): String =
        if (encodedPath.startsWith(apiPathPrefix)) encodedPath.removePrefix(apiPathPrefix) else encodedPath
}
