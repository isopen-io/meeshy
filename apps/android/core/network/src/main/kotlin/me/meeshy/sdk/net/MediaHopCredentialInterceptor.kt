package me.meeshy.sdk.net

import okhttp3.Interceptor
import okhttp3.Response

/**
 * **L'identité d'une requête média se décide À CHAQUE SAUT** (#14613). Monté en intercepteur RÉSEAU, il voit chaque
 * saut d'une redirection : il retire tout en-tête d'identité (`Authorization`, `X-Session-Token`, `Cookie`), y compris
 * ceux qu'un appelant aurait posés, puis ne remet que ce que [credentialFor] accorde à l'adresse de CE saut.
 *
 * OkHttp construit chaque saut d'une redirection depuis la requête de l'APPELANT, et n'en retire de lui-même, vers un
 * autre hôte, que `Authorization` : un `X-Session-Token` ou un `Cookie` posé par l'appelant suivrait donc une 302 chez
 * un tiers. Ce que cet intercepteur pose ne voyage jamais au saut suivant (il agit au niveau réseau) ; ce qu'il RETIRE,
 * c'est l'identité que l'appelant aurait posée. Le jeton est relu à chaque saut, donc un changement de compte ou une
 * déconnexion s'applique sans redémarrage.
 */
class MediaHopCredentialInterceptor(
    private val credentialFor: (url: String) -> Map<String, String>,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val builder = request.newBuilder()
        IDENTITY_HEADERS.forEach { name -> builder.removeHeader(name) }
        credentialFor(request.url.toString()).forEach { (name, value) -> builder.header(name, value) }
        return chain.proceed(builder.build())
    }

    private companion object {
        val IDENTITY_HEADERS = listOf(RequestCredential.AUTHORIZATION, RequestCredential.SESSION_TOKEN, "Cookie")
    }
}
