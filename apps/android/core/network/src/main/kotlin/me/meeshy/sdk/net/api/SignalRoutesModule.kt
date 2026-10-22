package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

/** L'interface Signal ([SignalApi], jamais réessayée) sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object SignalRoutesModule {

    @Provides
    fun providesSignalApi(api: MeeshyApi): SignalApi = api.service(SignalApi::class.java)
}
