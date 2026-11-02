package me.meeshy.app.composer.inbound

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.sdk.session.PerAccountCache
import javax.inject.Inject

/** À la déconnexion ou au changement de compte, un média reçu pour le composeur et pas encore repris quitte le disque. */
class ComposerSeedTeardown @Inject constructor(private val store: ComposerSeedStore) : PerAccountCache {
    override suspend fun clear() = withContext(Dispatchers.IO) { store.clearAll() }
}

@Module
@InstallIn(SingletonComponent::class)
interface ComposerSeedTeardownModule {
    @Binds
    @IntoSet
    fun composerSeedTeardown(impl: ComposerSeedTeardown): PerAccountCache
}
