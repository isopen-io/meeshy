package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

/** L'interface REST du parcours d'accueil ([OnboardingApi]), sur le client authentifié partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object OnboardingRoutesModule {

    @Provides
    fun providesOnboardingApi(api: MeeshyApi): OnboardingApi = api.service(OnboardingApi::class.java)
}
