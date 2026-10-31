package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

/** L'interface REST des liens ([RelationsApi]), sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object RelationsRoutesModule {

    @Provides
    fun providesRelationsApi(api: MeeshyApi): RelationsApi = api.service(RelationsApi::class.java)
}
