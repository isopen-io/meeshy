package me.meeshy.sdk.conversation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import dagger.multibindings.Multibinds
import javax.inject.Inject
import me.meeshy.sdk.chat.ExplicitUnreadMarks
import me.meeshy.sdk.session.PerAccountCache

/** Les marques « non lu » appartiennent au compte : un second compte n'en hérite jamais. */
class ExplicitUnreadMarksAccountCache @Inject constructor(
    private val marks: ExplicitUnreadMarks,
) : PerAccountCache {
    override suspend fun clear() {
        marks.forgetAll()
    }
}

/**
 * Lot liste-chargement-cache-first : déclare VIDE le point d'extension des caches voisins du
 * tirer-pour-rafraîchir (chaque lot propriétaire d'un cache y contribue en `@Binds @IntoSet`) et
 * range les marques « non lu » parmi les caches par compte.
 */
@Module
@InstallIn(SingletonComponent::class)
interface ListLoadingModule {
    @Multibinds
    fun listRefreshInvalidations(): Set<@JvmSuppressWildcards ListRefreshInvalidation>

    @Binds
    @IntoSet
    fun explicitUnreadMarksAccountCache(impl: ExplicitUnreadMarksAccountCache): PerAccountCache
}
