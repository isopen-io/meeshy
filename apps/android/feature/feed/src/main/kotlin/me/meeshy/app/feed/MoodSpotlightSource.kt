package me.meeshy.app.feed

import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.status.StatusBarCacheRepository
import me.meeshy.sdk.status.StatusFeedMode
import javax.inject.Inject

/**
 * Ce que l'appareil sait déjà d'une humeur avant tout réseau (iOS `MoodSpotlightSource.cachedEntry`) : la barre des
 * amis, puis celle de la découverte, telles que la dernière lecture les a gardées sur le disque.
 */
fun interface MoodStatusCache {
    suspend fun cachedEntry(statusId: String): StatusEntry?

    companion object {
        val None = MoodStatusCache { null }
    }
}

class StatusBarMoodCache @Inject constructor(
    private val bars: StatusBarCacheRepository,
) : MoodStatusCache {
    override suspend fun cachedEntry(statusId: String): StatusEntry? =
        listOf(StatusFeedMode.FRIENDS, StatusFeedMode.DISCOVER).firstNotNullOfOrNull { mode ->
            bars.cachedBar(mode)?.firstOrNull { it.id == statusId }
        }
}
