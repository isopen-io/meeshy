package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

/** L'interface REST de l'entrée World Wide ([WorldApi]), sur le client partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object WorldRoutesModule {

    @Provides
    fun providesWorldApi(api: MeeshyApi): WorldApi = api.service(WorldApi::class.java)
}
