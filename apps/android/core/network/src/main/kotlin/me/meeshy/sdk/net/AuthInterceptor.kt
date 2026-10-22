package me.meeshy.sdk.net

import me.meeshy.sdk.model.net.EndpointAuthKind
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Attaches the auth header to every request:
 * `Authorization: Bearer <jwt>` when a JWT is present, otherwise `X-Session-Token`.
 *
 * Les routes qui SERVENT a obtenir un jeton (connexion, inscription, lien magique,
 * rafraichissement — `EndpointPolicy`) partent sans identite : en presenter une bouclerait.
 *
 * Une requete qui PORTE DEJA son identite (`Authorization` ou `X-Session-Token`
 * pose par l'appelant) part telle quelle : c'est la fermeture d'une session
 * quittee (`POST /auth/logout`, jetons figes avant la purge), qui ne doit jamais
 * prendre l'identite du compte qui occupe le porte-jetons a cet instant — sinon
 * quitter le compte A fermerait, a la place, la session du compte B qui vient de
 * se connecter.
 */
class AuthInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        if (request.header(AUTHORIZATION) != null || request.header(SESSION_TOKEN) != null) {
            return chain.proceed(request)
        }
        if (request.routePolicy().authKind != EndpointAuthKind.BEARER) return chain.proceed(request)
        val builder = request.newBuilder()
        val jwt = tokenStore.jwt
        val session = tokenStore.sessionToken
        when {
            jwt != null -> builder.header(AUTHORIZATION, "Bearer $jwt")
            session != null -> builder.header(SESSION_TOKEN, session)
        }
        return chain.proceed(builder.build())
    }

    private companion object {
        const val AUTHORIZATION = "Authorization"
        const val SESSION_TOKEN = "X-Session-Token"
    }
}
