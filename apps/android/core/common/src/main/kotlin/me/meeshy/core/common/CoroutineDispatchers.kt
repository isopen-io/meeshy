package me.meeshy.core.common

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import javax.inject.Qualifier

/**
 * Dispatcher qualifiers — dispatchers are injected, never hard-coded, so tests
 * can substitute a `StandardTestDispatcher` (ARCHITECTURE.md §10).
 */
@Qualifier
@Retention(AnnotationRetention.BINARY)
public annotation class IoDispatcher

@Qualifier
@Retention(AnnotationRetention.BINARY)
public annotation class DefaultDispatcher

@Qualifier
@Retention(AnnotationRetention.BINARY)
public annotation class MainDispatcher

@Module
@InstallIn(SingletonComponent::class)
internal object DispatchersModule {

    @Provides
    @IoDispatcher
    fun providesIoDispatcher(): CoroutineDispatcher = Dispatchers.IO

    @Provides
    @DefaultDispatcher
    fun providesDefaultDispatcher(): CoroutineDispatcher = Dispatchers.Default

    @Provides
    @MainDispatcher
    fun providesMainDispatcher(): CoroutineDispatcher = Dispatchers.Main
}
