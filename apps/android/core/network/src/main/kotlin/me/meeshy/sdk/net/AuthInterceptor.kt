package me.meeshy.sdk.net

import me.meeshy.sdk.model.net.EndpointAuthKind
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Attaches the auth header to every request, ONE credential, never both
 * ([RequestCredential]): `Authorization: Bearer <jwt>` for a registered account, otherwise
 * `X-Session-Token` for a link guest.
 *
 * Les routes qui SERVENT a obtenir un jeton (connexion, inscription, lien magique,
 * rafraichissement — `EndpointPolicy`) partent sans identite : en presenter une bouclerait.
 *
 * Une requete qui PORTE DEJA son identite (`Authorization` ou `X-Session-Token`
 * pose par l'appelant) est EPINGLEE a ce jeton fige : c'est la fermeture d'une session
 * quittee (`POST /auth/logout`, jetons figes avant la purge), qui ne doit jamais
 * prendre l'identite du compte qui occupe le porte-jetons a cet instant, ni etre rejouee
 * avec un autre.
 *
 * Chaque requete est marquee du credential ET de la generation de session sous lesquels elle
 * part, pour que son 401 tardif se juge sur le bon proprietaire.
 */
class AuthInterceptor(
    private val tokenStore: TokenStore,
    private val transition: SessionTransitionFlags = SessionTransitionFlags(),
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val generation = transition.generation
        val pinned = request.header(RequestCredential.AUTHORIZATION) != null ||
            request.header(RequestCredential.SESSION_TOKEN) != null
        if (pinned) {
            val marked = request.newBuilder()
                .tag(SentCredential::class.java, SentCredential(RequestCredential.carriedBy(request), generation, true))
                .build()
            return chain.proceed(marked)
        }
        if (request.routePolicy().authKind != EndpointAuthKind.BEARER) return chain.proceed(request)
        val credential = RequestCredential.of(tokenStore)
        val builder = request.newBuilder()
            .tag(SentCredential::class.java, SentCredential(credential, generation, false))
        credential?.applyTo(builder)
        return chain.proceed(builder.build())
    }
}
