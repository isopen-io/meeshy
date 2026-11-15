package me.meeshy.sdk.share

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ShareDispatcherModule {
    @Binds
    @Singleton
    abstract fun bindsShareDispatching(impl: ShareDispatcher): ShareDispatching

    @Binds
    @Singleton
    abstract fun bindsShareTargetResolver(impl: LiveShareTargetResolver): ShareTargetResolver
}
