package me.meeshy.sdk.session

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
internal interface SessionTransitionModule {
    @Binds
    fun sessionClosing(impl: SessionTransitionExecutor): SessionClosing
}
