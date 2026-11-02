package me.meeshy.app.media

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.startup.AppInitializer
import me.meeshy.sdk.model.media.MediaClientDerivation
import me.meeshy.sdk.model.net.MediaRequestCredential
import me.meeshy.sdk.net.HttpClientAssembler
import me.meeshy.sdk.net.HttpClientContributor
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.TokenStore
import me.meeshy.ui.component.media.MediaRequestHeaders
import me.meeshy.ui.component.media.MeeshyMediaCache
import okhttp3.Authenticator
import okhttp3.Call
import okhttp3.Dispatcher
import okhttp3.EventListener
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Branche l'identité du compte COURANT sur les requêtes média (miroir de `DiskCacheStore.networkRequest`, iOS) : le
 * jeton est relu à chaque requête, donc un changement de compte ou une déconnexion s'applique sans redémarrage, et il
 * ne part jamais hors de l'origine de l'API.
 *
 * Et le client qui les porte (#14567) : [MediaHttpClient], dérivé du client partagé au premier média lu — jamais au
 * démarrage, qui ne paie donc ni le client partagé ni ses contributeurs.
 */
class MediaCredentialInitializer @Inject constructor(
    private val tokenStore: TokenStore,
    private val config: MeeshyConfig,
    private val sharedClient: dagger.Lazy<OkHttpClient>,
    private val contributors: dagger.Lazy<Set<@JvmSuppressWildcards HttpClientContributor>>,
) : AppInitializer {

    private val mediaClient: OkHttpClient by lazy { MediaHttpClient.derive(sharedClient.get(), contributors.get()) }

    override fun initialize() {
        MediaRequestHeaders.provider = { url ->
            MediaRequestCredential.headers(
                url = url,
                apiBaseUrl = config.apiBaseUrl,
                jwt = tokenStore.jwt,
                sessionToken = tokenStore.sessionToken,
            )
        }
        MeeshyMediaCache.networkCallFactory = object : Call.Factory {
            override fun newCall(request: Request): Call = mediaClient.newCall(request)
        }
    }
}

/**
 * **Le client HTTP des médias** (#14567) : le pool de connexions du client partagé (HTTP/2, une connexion multiplexée
 * par hôte), sans un seul de ses intercepteurs ni son authentificateur ; seuls remontent les contributeurs que
 * [MediaClientDerivation] garde — l'épinglage des certificats et la frontière de session. Un jeton, une garde d'URL ou
 * une relance d'API n'y montent jamais : l'identité d'une requête média est posée requête par requête, et seulement vers
 * la route des sons de la bibliothèque (`MediaRequestCredential`).
 *
 * Sa file d'attente est la sienne : les lecteurs et préchargements d'un fil ne prennent pas les places par hôte des
 * appels d'API. Et une redirection HTTPS vers HTTP n'est pas suivie, comme sous la pile intégrée de Media3
 * (`allowCrossProtocolRedirects` faux) : un jeton média ne repart jamais en clair.
 */
internal object MediaHttpClient {
    fun derive(shared: OkHttpClient, contributors: Collection<HttpClientContributor>): OkHttpClient {
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
        return HttpClientAssembler.build(contributors.filter { it.id in kept }, bare)
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface MediaCredentialModule {
    @Binds
    @IntoSet
    fun mediaCredentialInitializer(impl: MediaCredentialInitializer): AppInitializer
}
