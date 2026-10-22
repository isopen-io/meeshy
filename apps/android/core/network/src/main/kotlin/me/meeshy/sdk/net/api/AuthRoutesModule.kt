package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi
import javax.inject.Singleton

/**
 * Les interfaces Retrofit du contrat d'authentification qui n'ont pas leur propre
 * accesseur sur [MeeshyApi] : le lot les LIE ICI, sans éditer `NetworkModule`
 * (gelé) — une interface neuve = son module. Elles partagent le client, les
 * intercepteurs et l'authenticator de [MeeshyApi.auth].
 */
@Module
@InstallIn(SingletonComponent::class)
internal object AuthRoutesModule {

    @Provides
    @Singleton
    fun providesPhoneTransferApi(api: MeeshyApi): PhoneTransferApi = api.service(PhoneTransferApi::class.java)

    @Provides
    @Singleton
    fun providesAnonymousApi(api: MeeshyApi): AnonymousApi = api.service(AnonymousApi::class.java)
}
