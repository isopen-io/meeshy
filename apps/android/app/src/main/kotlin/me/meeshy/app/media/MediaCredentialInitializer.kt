package me.meeshy.app.media

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.startup.AppInitializer
import me.meeshy.sdk.model.net.MediaRequestCredential
import me.meeshy.sdk.net.HttpClientContributor
import me.meeshy.sdk.net.MediaHttpClient
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.TokenStore
import me.meeshy.ui.component.media.MeeshyMediaCache
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request

/**
 * Installe le client HTTP des lecteurs Media3 (#14567, #14613) : [MediaHttpClient.deriveForSignedMedia], dérivé du
 * client partagé au premier média lu — jamais au démarrage, qui ne paie donc ni le client partagé ni ses contributeurs.
 *
 * L'identité du compte COURANT (miroir de `DiskCacheStore.networkRequest`, iOS) y est posée à CHAQUE SAUT, et
 * seulement vers la route des sons de la bibliothèque (`MediaRequestCredential`) : le jeton est relu à chaque requête,
 * donc un changement de compte ou une déconnexion s'applique sans redémarrage, et une redirection vers un autre hôte
 * repart nue.
 */
class MediaCredentialInitializer @Inject constructor(
    private val tokenStore: TokenStore,
    private val config: MeeshyConfig,
    private val sharedClient: dagger.Lazy<OkHttpClient>,
    private val contributors: dagger.Lazy<Set<@JvmSuppressWildcards HttpClientContributor>>,
) : AppInitializer {

    private val mediaClient: OkHttpClient by lazy {
        MediaHttpClient.deriveForSignedMedia(sharedClient.get(), contributors.get()) { url ->
            MediaRequestCredential.headers(
                url = url,
                apiBaseUrl = config.apiBaseUrl,
                jwt = tokenStore.jwt,
                sessionToken = tokenStore.sessionToken,
            )
        }
    }

    override fun initialize() {
        MeeshyMediaCache.networkCallFactory = object : Call.Factory {
            override fun newCall(request: Request): Call = mediaClient.newCall(request)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface MediaCredentialModule {
    @Binds
    @IntoSet
    fun mediaCredentialInitializer(impl: MediaCredentialInitializer): AppInitializer
}
