package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

/** Les interfaces REST du jeu ([GameApi]) et du décor ([ProfileDecorApi]), sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object GameRoutesModule {

    @Provides
    fun providesGameApi(api: MeeshyApi): GameApi = api.service(GameApi::class.java)

    @Provides
    fun providesProfileDecorApi(api: MeeshyApi): ProfileDecorApi = api.service(ProfileDecorApi::class.java)
}
