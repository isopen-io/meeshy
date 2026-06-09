package me.meeshy.app.di

import android.content.Context
import androidx.hilt.work.HiltWorkerFactory
import androidx.startup.Initializer
import androidx.work.Configuration
import androidx.work.WorkManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * App-level Hilt bindings: WorkManager + HiltWorkerFactory integration
 * so @HiltWorker subclasses can receive injected dependencies (ARCHITECTURE.md §5).
 */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun providesWorkManagerConfiguration(workerFactory: HiltWorkerFactory): Configuration =
        Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    @Provides
    @Singleton
    fun providesWorkManager(@ApplicationContext context: Context): WorkManager =
        WorkManager.getInstance(context)
}
