package me.meeshy.app.startup

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds

/** Declare VIDE le multibinding des taches : un lot contribue avec `@Binds @IntoSet`. */
@Module
@InstallIn(SingletonComponent::class)
interface AppLifecycleModule {
    @Multibinds
    fun appLifecycleTasks(): Set<@JvmSuppressWildcards AppLifecycleTask>
}
