package me.meeshy.sdk.auth

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
internal object EmailVerificationModule {
    @Provides
    fun providesEmailVerificationStatusSource(authRepository: AuthRepository): EmailVerificationStatusSource =
        EmailVerificationStatusSource { token -> authRepository.emailVerificationStatus(token) }
}
