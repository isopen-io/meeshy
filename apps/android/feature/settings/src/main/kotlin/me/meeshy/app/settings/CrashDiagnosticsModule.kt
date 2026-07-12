package me.meeshy.app.settings

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/** Binds the file-system backed [FileCrashDiagnosticsStore] as the [CrashDiagnosticsStore]. */
@Module
@InstallIn(SingletonComponent::class)
abstract class CrashDiagnosticsModule {

    @Binds
    @Singleton
    abstract fun bindsCrashDiagnosticsStore(impl: FileCrashDiagnosticsStore): CrashDiagnosticsStore
}
