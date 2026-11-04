package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.sdk.reading.SharedPreferencesReadingModeStore
import me.meeshy.sdk.session.PerAccountCache

/** Vide les modes de lecture mémorisés à la déconnexion ou au changement de compte. */
class ReadingModeAccountCache @Inject constructor(
    private val store: SharedPreferencesReadingModeStore,
) : PerAccountCache {
    override suspend fun clear() {
        store.clearAll()
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ReadingModeAccountCacheModule {
    @Binds
    @IntoSet
    abstract fun bind(impl: ReadingModeAccountCache): PerAccountCache
}
