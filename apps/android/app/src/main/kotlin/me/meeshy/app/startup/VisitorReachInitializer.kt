package me.meeshy.app.startup

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.conversation.AppForegroundSignal
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.post.VisitorReachReporter

/** Branche le vidage de l'audience d'un lecteur sans compte : retour du reseau et premier plan. */
class VisitorReachInitializer @Inject constructor(
    private val reporter: VisitorReachReporter,
    private val network: NetworkMonitor,
    private val foreground: AppForegroundSignal,
) : AppInitializer {
    override fun initialize() {
        reporter.start(
            reconnects = network.isOnline.filter { it }.map { },
            foreground = foreground.entered,
        )
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface VisitorReachInitializerModule {
    @Binds
    @IntoSet
    fun visitorReachInitializer(impl: VisitorReachInitializer): AppInitializer
}
