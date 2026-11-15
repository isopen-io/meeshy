package me.meeshy.sdk.pack

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Singleton
import me.meeshy.core.database.dao.KeyedJsonCacheDao
import me.meeshy.sdk.cache.KeyedJsonCache
import me.meeshy.sdk.cache.SystemCacheClock
import me.meeshy.sdk.model.sticker.StickerPackSummary
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.PerAccountCache

/** Le moteur des packs : le transport routé, l'étagère des stickers et celles des packs d'apparence, toutes vidées avec le compte. */
@Module
@InstallIn(SingletonComponent::class)
abstract class PackBindingsModule {
    @Binds
    abstract fun bindPackTransport(impl: RoutedPackTransport): PackTransport

    @Binds
    @IntoSet
    abstract fun bindCosmeticPackAccountCache(impl: CosmeticPackRepository): PerAccountCache
}

@Module
@InstallIn(SingletonComponent::class)
object PackProvidersModule {
    @Provides
    @Singleton
    fun provideStickerPackShelfStore(
        transport: PackTransport,
        dao: KeyedJsonCacheDao,
        fence: AccountFence,
        network: NetworkMonitor,
    ): StickerPackShelfStore = PackStore(
        service = PackService(StickerPackDefaults.domain, StickerPackSummary.serializer(), transport),
        cache = KeyedJsonCache(dao, SystemCacheClock, fence),
        elementSerializer = StickerPackSummary.serializer(),
        defaults = StickerPackDefaults.builtins,
        isOnline = { network.isOnline.value },
    )

    @Provides
    @IntoSet
    fun provideStickerPackShelfAccountCache(store: StickerPackShelfStore): PerAccountCache = store
}
