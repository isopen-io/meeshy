package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

/** Les interfaces REST sociales neuves, sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object SocialRoutesModule {

    @Provides
    fun providesHashtagApi(api: MeeshyApi): HashtagApi = api.service(HashtagApi::class.java)

    @Provides
    fun providesSocialEventsApi(api: MeeshyApi): SocialEventsApi = api.service(SocialEventsApi::class.java)
}
