package me.meeshy.sdk.privacy

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

/** Binds the inert [AnalyticsCollectionGate] until the analytics engine provides the real one. */
@Module
@InstallIn(SingletonComponent::class)
public object AnalyticsCollectionGateModule {
    @Provides
    public fun analyticsCollectionGate(): AnalyticsCollectionGate = NoOpAnalyticsCollectionGate
}
