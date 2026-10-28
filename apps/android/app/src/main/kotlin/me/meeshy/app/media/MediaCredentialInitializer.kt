package me.meeshy.app.media

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.startup.AppInitializer
import me.meeshy.sdk.model.net.MediaRequestCredential
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.TokenStore
import me.meeshy.ui.component.media.MediaRequestHeaders

/**
 * Branche l'identité du compte COURANT sur les requêtes média (miroir de `DiskCacheStore.networkRequest`, iOS) : le
 * jeton est relu à chaque requête, donc un changement de compte ou une déconnexion s'applique sans redémarrage, et il
 * ne part jamais hors de l'origine de l'API.
 */
class MediaCredentialInitializer @Inject constructor(
    private val tokenStore: TokenStore,
    private val config: MeeshyConfig,
) : AppInitializer {
    override fun initialize() {
        MediaRequestHeaders.provider = { url ->
            MediaRequestCredential.headers(
                url = url,
                apiBaseUrl = config.apiBaseUrl,
                jwt = tokenStore.jwt,
                sessionToken = tokenStore.sessionToken,
            )
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
