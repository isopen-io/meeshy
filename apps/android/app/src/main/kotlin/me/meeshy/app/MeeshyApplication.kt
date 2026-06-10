package me.meeshy.app

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import me.meeshy.sdk.session.SessionLifecycleOrchestrator
import timber.log.Timber
import javax.inject.Inject

@HiltAndroidApp
class MeeshyApplication : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    @Inject
    lateinit var sessionLifecycleOrchestrator: SessionLifecycleOrchestrator

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            Timber.plant(Timber.DebugTree())
        }
        sessionLifecycleOrchestrator.start()
    }
}
