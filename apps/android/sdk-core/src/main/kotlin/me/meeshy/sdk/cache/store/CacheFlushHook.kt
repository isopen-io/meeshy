package me.meeshy.sdk.cache.store

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.sdk.lifecycle.AppLifecycleHook
import me.meeshy.sdk.model.lifecycle.TrimLevel
import me.meeshy.sdk.session.PerAccountCache

/** Arriere-plan : vide le dirty-set avant que le process soit tue. Pression memoire : lache les L1. */
class CacheFlushHook @Inject constructor(private val registry: CacheStoreRegistry) : AppLifecycleHook {
    override val priority: Int get() = 100

    override suspend fun onBackground() {
        registry.flushAll(FLUSH_DEADLINE_MILLIS)
    }

    override suspend fun onTrimMemory(level: TrimLevel) {
        registry.dropMemory()
    }

    companion object {
        const val FLUSH_DEADLINE_MILLIS = 4_000L
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class CacheRegistryModule {
    @Binds @IntoSet abstract fun flushHook(hook: CacheFlushHook): AppLifecycleHook

    @Binds @IntoSet abstract fun accountCache(registry: CacheStoreRegistry): PerAccountCache
}
