package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

/** Le profil vocal ([VoiceApi]) et les consentements confirmés ([ConsentsApi]) sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object VoiceRoutesModule {

    @Provides
    fun providesVoiceApi(api: MeeshyApi): VoiceApi = api.service(VoiceApi::class.java)

    @Provides
    fun providesConsentsApi(api: MeeshyApi): ConsentsApi = api.service(ConsentsApi::class.java)
}
