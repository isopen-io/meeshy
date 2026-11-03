package me.meeshy.sdk.net

import me.meeshy.sdk.model.media.MediaClientDerivation
import okhttp3.Authenticator
import okhttp3.CookieJar
import okhttp3.Dispatcher
import okhttp3.EventListener
import okhttp3.OkHttpClient

/**
 * **Les clients HTTP des médias** — une SEULE dérivation du client partagé : son pool de connexions (HTTP/2), sans
 * aucun de ses intercepteurs d'API ni son authentificateur ; seuls remontent les contributeurs dont le rôle passe
 * [MediaClientDerivation] (épinglage, frontière de session). Ce n'est PAS le client Retrofit. File d'attente propre,
 * et une redirection HTTPS vers HTTP n'est pas suivie — un jeton ne repart jamais en clair. Rien de ce qui garde un
 * état de compte n'est hérité : ni cookies, ni cache HTTP (jamais purgé au changement de compte), ni authentificateur
 * de proxy.
 *
 * Deux politiques d'identité, toutes deux posées par un intercepteur RÉSEAU, donc réévaluées à chaque saut d'une
 * redirection :
 * - [derive] : les pièces du registre de téléchargements (#14890) — l'identité part vers l'origine de l'API
 *   ([OriginScopedAuthInterceptor]) ;
 * - [deriveForSignedMedia] : les lecteurs Media3 et l'export de scène (#14567, #14613, #14877) — l'identité ne part
 *   que vers ce que `credentialFor` accorde (la route des sons, `MediaRequestCredential`).
 */
object MediaHttpClient {
    fun derive(
        shared: OkHttpClient,
        contributors: Collection<HttpClientContributor>,
        tokenStore: TokenStore,
        apiBaseUrl: () -> String?,
    ): OkHttpClient = bare(shared, contributors)
        .addNetworkInterceptor(OriginScopedAuthInterceptor(tokenStore, apiBaseUrl))
        .build()

    fun deriveForSignedMedia(
        shared: OkHttpClient,
        contributors: Collection<HttpClientContributor>,
        credentialFor: (url: String) -> Map<String, String>,
    ): OkHttpClient = bare(shared, contributors)
        .addNetworkInterceptor(MediaHopCredentialInterceptor(credentialFor))
        .build()

    private fun bare(shared: OkHttpClient, contributors: Collection<HttpClientContributor>): OkHttpClient.Builder {
        val base = shared.newBuilder()
            .apply {
                interceptors().clear()
                networkInterceptors().clear()
            }
            .dispatcher(Dispatcher())
            .authenticator(Authenticator.NONE)
            .eventListener(EventListener.NONE)
            .followSslRedirects(false)
            .cookieJar(CookieJar.NO_COOKIES)
            .cache(null)
            .proxyAuthenticator(Authenticator.NONE)
        val kept = contributors.filter { MediaClientDerivation.keeps(it.mediaRole()) }
        return HttpClientAssembler.build(kept, base).newBuilder()
    }
}
