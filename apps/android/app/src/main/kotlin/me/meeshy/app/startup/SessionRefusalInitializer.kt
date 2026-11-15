package me.meeshy.app.startup

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import me.meeshy.sdk.session.SessionRefusalCenter
import me.meeshy.sdk.socket.SessionRefusalSocketGuard

/** Branche, pour toute la vie du processus, la lecture des refus de session par la socket et leur application. */
class SessionRefusalInitializer @Inject constructor(
    private val center: SessionRefusalCenter,
    private val socketGuard: SessionRefusalSocketGuard,
) : AppInitializer {
    override fun initialize() {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
        center.start(scope)
        socketGuard.start(scope)
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface SessionRefusalInitializerModule {
    @Binds
    @IntoSet
    fun sessionRefusalInitializer(impl: SessionRefusalInitializer): AppInitializer
}
