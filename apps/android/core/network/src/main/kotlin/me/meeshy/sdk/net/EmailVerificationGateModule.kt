package me.meeshy.sdk.net

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import okhttp3.HttpUrl.Companion.toHttpUrl

/** Contribue la garde de l'e-mail (#8365) au client HTTP partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object EmailVerificationGateModule {

    @Provides
    @IntoSet
    fun providesEmailVerificationGateContributor(
        registry: EmailVerificationGateRegistry,
        config: MeeshyConfig,
    ): HttpClientContributor =
        HttpClientContributor.of("email-verification-gate", HttpPriority.EMAIL_VERIFICATION_GATE) {
            it.addInterceptor(EmailVerificationGateInterceptor(registry, config.apiBaseUrl.toHttpUrl().encodedPath))
        }
}
