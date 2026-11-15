package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

/** L'interface REST du cycle de vie d'un appel ([CallApi]), sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object CallRoutesModule {

    @Provides
    fun providesCallApi(api: MeeshyApi): CallApi = api.service(CallApi::class.java)
}
