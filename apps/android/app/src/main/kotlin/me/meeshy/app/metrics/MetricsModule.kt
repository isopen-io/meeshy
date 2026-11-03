package me.meeshy.app.metrics

import android.app.Application
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.startup.AppInitializer

/** Démarre la collecte locale au lancement. Aucune donnée n'est envoyée : le magasin est local. */
class MetricsInitializer @Inject constructor(
    private val application: Application,
    private val collector: MeeshyMetricsCollector,
) : AppInitializer {
    override fun initialize() = collector.start(application)
}

@Module
@InstallIn(SingletonComponent::class)
interface MetricsModule {
    @Binds
    @IntoSet
    fun metricsInitializer(impl: MetricsInitializer): AppInitializer
}
