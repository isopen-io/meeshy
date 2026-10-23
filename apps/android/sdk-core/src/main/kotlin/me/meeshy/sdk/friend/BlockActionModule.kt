package me.meeshy.sdk.friend

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds

@Module
@InstallIn(SingletonComponent::class)
abstract class BlockActionModule {
    @Multibinds
    abstract fun blockSucceededObservers(): Set<@JvmSuppressWildcards BlockSucceededObserver>
}
