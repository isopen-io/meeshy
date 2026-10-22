package me.meeshy.sdk.auth

import android.content.Context
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
public object PendingReferralModule {

    @Provides
    @Singleton
    public fun providesPendingReferralStore(@ApplicationContext context: Context): PendingReferralStore =
        SharedPrefsPendingReferralStore(context)
}
