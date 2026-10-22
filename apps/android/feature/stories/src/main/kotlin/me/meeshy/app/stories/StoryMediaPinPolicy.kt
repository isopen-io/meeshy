package me.meeshy.app.stories

import me.meeshy.sdk.media.MediaPinStore

/**
 * Politique côté app : les médias d'une story VUE sont épinglés jusqu'à son expiration, pour
 * qu'elle se rejoue hors ligne sans que l'éviction LRU ne les emporte. Le magasin d'épingles
 * ne décide pas CE qui mérite une épingle — c'est ici.
 */
object StoryMediaPinPolicy {

    /** Les URL à épingler : distinctes, non vides ; rien si l'expiration est déjà passée. */
    fun urlsToPin(mediaUrls: List<String?>, expiresAtEpochMillis: Long?, nowEpochMillis: Long): List<String> {
        if (expiresAtEpochMillis == null || expiresAtEpochMillis <= nowEpochMillis) return emptyList()
        return mediaUrls.filterNotNull().filter { it.isNotBlank() }.distinct()
    }

    suspend fun pinViewedStory(
        store: MediaPinStore,
        mediaUrls: List<String?>,
        expiresAtEpochMillis: Long?,
        nowEpochMillis: Long,
    ) {
        val until = expiresAtEpochMillis ?: return
        urlsToPin(mediaUrls, expiresAtEpochMillis, nowEpochMillis).forEach { store.pin(it, until) }
    }
}
