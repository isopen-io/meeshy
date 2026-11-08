package me.meeshy.sdk.share

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
internal abstract class ShareRecipientModule {
    @Binds
    @Singleton
    abstract fun bindsShareRecipientSources(impl: LiveShareRecipientSources): ShareRecipientSources
}
