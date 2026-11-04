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
import me.meeshy.sdk.session.SessionRevocationCenter

/** Branche, pour toute la vie du processus, l'écoute des fermetures de session (socket `auth:session-revoked` et expiration). */
class SessionRevocationInitializer @Inject constructor(
    private val center: SessionRevocationCenter,
) : AppInitializer {
    override fun initialize() {
        center.start(CoroutineScope(SupervisorJob() + Dispatchers.Default))
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface SessionRevocationInitializerModule {
    @Binds
    @IntoSet
    fun sessionRevocationInitializer(impl: SessionRevocationInitializer): AppInitializer
}
