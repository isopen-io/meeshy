package me.meeshy.sdk.net

import me.meeshy.sdk.model.auth.TokenRefreshPolicy
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

/**
 * A synchronous session refresher. The OkHttp [Authenticator] runs on a background
 * dispatcher thread and demands a *blocking* answer, so the concrete implementation
 * (see [MeeshyApi.create]) wraps the suspend `AuthApi.refresh` in `runBlocking`.
 *
 * Returns the freshly-minted JWT, or `null` when the refresh could not renew the
 * session (no session token, network error, or a rejected refresh token).
 */
fun interface TokenRefresher {
    fun refresh(): String?
}

/**
 * The concrete OkHttp `Authenticator` that turns the pure [TokenRefreshPolicy]
 * reactive-401 decisions into real request replay — the app-side wiring the policy
 * core was written to feed (iOS `APIClient.requestWithHeaders`'s 401 branch, lifted
 * out of a stateful `URLSession` loop).
 *
 * On every 401 OkHttp calls [authenticate]. We ask [TokenRefreshPolicy.decideOn401]
 * what to do, using [Response.priorResponse] as the "already retried once" loop guard
 * so a dead session can never spin forever:
 *  - **RefreshAndRetry** — refresh once via [refresher]; on a real new token, replay
 *    the original request with the renewed bearer; on a null/blank token, tear the
 *    session down and give up.
 *  - **Teardown** — a genuinely dead session (already-retried, or a handshake/refresh
 *    endpoint whose own token is rejected): clear the store, give up.
 *  - **InvalidCredentials** — a `/auth/login` 401 is a wrong-password answer, never a
 *    session problem: give up **without** clearing an existing session.
 *
 * `serverMessage` is passed as `null`: the branch between invalid-credentials and
 * session-expiry depends only on the endpoint, and this authenticator never surfaces
 * the credentials message (that is the repository's job when it parses the 401 body),
 * so peeking the body here would be wasted work.
 *
 * The endpoint is normalised to the policy's form (`/auth/login`, `/conversations`, …)
 * by stripping [apiPathPrefix] from the request path, so the same pure decisions that
 * are unit-tested against `/auth/…` literals apply to the real `/api/v1/…` routes.
 */
class RefreshAuthenticator(
    private val tokenStore: TokenStore,
    private val refresher: TokenRefresher,
    private val apiPathPrefix: String = "/api/v1",
) : Authenticator {

    override fun authenticate(route: Route?, response: Response): Request? {
        val endpoint = endpointOf(response.request.url.encodedPath)
        val hasRefreshed = response.priorResponse != null
        return when (
            TokenRefreshPolicy.decideOn401(
                endpoint = endpoint,
                serverMessage = null,
                hasRefreshedOn401 = hasRefreshed,
            )
        ) {
            is TokenRefreshPolicy.Unauthorized401Decision.InvalidCredentials -> null
            TokenRefreshPolicy.Unauthorized401Decision.Teardown -> {
                tokenStore.clear()
                null
            }
            TokenRefreshPolicy.Unauthorized401Decision.RefreshAndRetry -> retryWithRefreshedToken(response)
        }
    }

    private fun retryWithRefreshedToken(response: Response): Request? {
        val newJwt = refresher.refresh()
        if (newJwt.isNullOrBlank()) {
            tokenStore.clear()
            return null
        }
        tokenStore.jwt = newJwt
        return response.request.newBuilder()
            .header("Authorization", "Bearer $newJwt")
            .build()
    }

    private fun endpointOf(encodedPath: String): String =
        if (encodedPath.startsWith(apiPathPrefix)) encodedPath.removePrefix(apiPathPrefix) else encodedPath
}
