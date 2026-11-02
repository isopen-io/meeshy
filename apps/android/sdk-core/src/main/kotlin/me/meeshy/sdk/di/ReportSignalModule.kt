package me.meeshy.sdk.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.report.NoOpReportSignalEmitter
import me.meeshy.sdk.report.ReportSignalEmitter

/** Lie l'émetteur de signal de signalement à son implémentation inerte, en attendant le hub social V2. */
@Module
@InstallIn(SingletonComponent::class)
internal object ReportSignalModule {
    @Provides
    fun providesReportSignalEmitter(): ReportSignalEmitter = NoOpReportSignalEmitter
}
