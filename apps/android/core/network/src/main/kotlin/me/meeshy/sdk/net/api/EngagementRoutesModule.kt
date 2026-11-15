package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

/** L'interface REST de la progression ([EngagementApi]), sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object EngagementRoutesModule {

    @Provides
    fun providesEngagementApi(api: MeeshyApi): EngagementApi = api.service(EngagementApi::class.java)
}
