package me.meeshy.sdk.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import me.meeshy.sdk.lifecycle.AppLifecycleHook

/** Declare VIDE le multibinding des hooks : un lot contribue avec `@Binds @IntoSet`. */
@Module
@InstallIn(SingletonComponent::class)
interface LifecycleModule {
    @Multibinds
    fun appLifecycleHooks(): Set<@JvmSuppressWildcards AppLifecycleHook>
}
