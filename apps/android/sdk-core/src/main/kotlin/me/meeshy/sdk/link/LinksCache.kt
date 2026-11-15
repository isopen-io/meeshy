package me.meeshy.sdk.link

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import me.meeshy.sdk.model.AffiliateToken
import me.meeshy.sdk.model.CommunityLink
import me.meeshy.sdk.model.LinkStatsSnapshot
import me.meeshy.sdk.model.TrackingLink
import me.meeshy.sdk.session.PerAccountCache
import java.util.concurrent.atomic.AtomicReference
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Le cache-first du hub « Mes liens » (miroir de `CacheCoordinator.trackingLinks / affiliateTokens /
 * communityLinks`, iOS) : chaque écran se peint d'abord de la dernière lecture, puis se revalide en
 * silence. Vidé à la déconnexion ([PerAccountCache]) : un second compte n'hérite jamais des liens du premier.
 */
@Singleton
class LinksCache @Inject constructor() : PerAccountCache {

    private data class Held(
        val figures: LinkStatsSnapshot? = null,
        val tracking: List<TrackingLink>? = null,
        val affiliate: List<AffiliateToken>? = null,
        val community: List<CommunityLink>? = null,
    )

    private val held = AtomicReference(Held())

    fun figures(): LinkStatsSnapshot? = held.get().figures
    fun trackingLinks(): List<TrackingLink>? = held.get().tracking
    fun affiliateTokens(): List<AffiliateToken>? = held.get().affiliate
    fun communityLinks(): List<CommunityLink>? = held.get().community

    fun putFigures(value: LinkStatsSnapshot) { held.updateAndGet { it.copy(figures = value) } }
    fun putTrackingLinks(value: List<TrackingLink>) { held.updateAndGet { it.copy(tracking = value) } }
    fun putAffiliateTokens(value: List<AffiliateToken>) { held.updateAndGet { it.copy(affiliate = value) } }
    fun putCommunityLinks(value: List<CommunityLink>) { held.updateAndGet { it.copy(community = value) } }

    override suspend fun clear() {
        held.set(Held())
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class LinksCacheModule {
    @Binds
    @IntoSet
    abstract fun bindAccountCache(cache: LinksCache): PerAccountCache
}
