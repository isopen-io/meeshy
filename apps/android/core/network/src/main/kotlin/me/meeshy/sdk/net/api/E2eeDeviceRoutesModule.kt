package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

/** L'annuaire de MES appareils chiffrés ([E2eeDeviceApi]) sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object E2eeDeviceRoutesModule {

    @Provides
    fun providesE2eeDeviceApi(api: MeeshyApi): E2eeDeviceApi = api.service(E2eeDeviceApi::class.java)
}
