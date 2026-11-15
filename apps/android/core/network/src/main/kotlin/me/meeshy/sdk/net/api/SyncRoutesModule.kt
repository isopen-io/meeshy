package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

@Module
@InstallIn(SingletonComponent::class)
internal object SyncRoutesModule {

    @Provides
    fun providesSyncApi(api: MeeshyApi): SyncApi = api.service(SyncApi::class.java)
}
