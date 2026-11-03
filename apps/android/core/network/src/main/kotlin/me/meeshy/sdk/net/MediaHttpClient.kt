package me.meeshy.sdk.net

import me.meeshy.sdk.model.media.MediaClientDerivation
import okhttp3.Authenticator
import okhttp3.Dispatcher
import okhttp3.EventListener
import okhttp3.OkHttpClient

/**
 * **Le client HTTP des téléchargements de médias** : le pool de connexions du client partagé (HTTP/2), sans aucun de
 * ses intercepteurs d'API ni son authentificateur ; seuls remontent les contributeurs que [MediaClientDerivation] garde
 * (épinglage, frontière de session). Ce n'est PAS le client Retrofit : l'identité n'y est posée que par
 * [OriginScopedAuthInterceptor], vers l'origine de l'API. File d'attente propre, et une redirection HTTPS vers HTTP
 * n'est pas suivie — un jeton ne repart jamais en clair.
 */
object MediaHttpClient {
    fun derive(
        shared: OkHttpClient,
        contributors: Collection<HttpClientContributor>,
        tokenStore: TokenStore,
        apiBaseUrl: () -> String?,
    ): OkHttpClient {
        val kept = MediaClientDerivation.kept(contributors.map(HttpClientContributor::id)).toSet()
        val bare = shared.newBuilder()
            .apply {
                interceptors().clear()
                networkInterceptors().clear()
            }
            .dispatcher(Dispatcher())
            .authenticator(Authenticator.NONE)
            .eventListener(EventListener.NONE)
            .followSslRedirects(false)
        val client = HttpClientAssembler.build(contributors.filter { it.id in kept }, bare)
        return client.newBuilder()
            .addNetworkInterceptor(OriginScopedAuthInterceptor(tokenStore, apiBaseUrl))
            .build()
    }
}
