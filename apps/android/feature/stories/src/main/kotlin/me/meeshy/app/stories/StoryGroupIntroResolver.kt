package me.meeshy.app.stories

import kotlinx.coroutines.CancellationException
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.story.StoryGroupIntro

/**
 * Résout l'identité d'un auteur pour l'interlude (iOS `StoryViewModel.resolveGroupIntro`), CACHE D'ABORD et sans
 * jamais lever : le profil gardé (frais ou périmé) d'abord, le réseau seulement quand le cache n'a ni nom ni
 * bannière, l'humeur ensuite. Une source qui échoue laisse le substitut tel quel — l'interlude s'affiche de toute
 * façon, avec ce que la story a déjà servi.
 */
class StoryGroupIntroResolver(
    private val cachedProfile: suspend (String) -> MeeshyUser?,
    private val fetchProfile: suspend (String) -> MeeshyUser?,
    private val storeProfile: suspend (MeeshyUser, String) -> Unit,
    private val moods: suspend () -> List<StatusEntry>,
    private val nowMillis: () -> Long,
) {
    @Volatile
    private var moodsByUser: Map<String, StatusEntry>? = null

    suspend fun resolve(userId: String, name: String): StoryGroupIntro {
        var intro = StoryGroupIntro.placeholder(userId, name)
        safely { cachedProfile(userId) }?.let { intro = intro.withProfile(it) }
        if (intro.needsProfile) {
            safely { fetchProfile(userId) }?.let { fetched ->
                intro = intro.withProfile(fetched)
                safely { storeProfile(fetched, userId) }
            }
        }
        return moodOf(userId)?.let { intro.withMood(it.moodEmoji, it.content) } ?: intro
    }

    private suspend fun moodOf(userId: String): StatusEntry? {
        val byUser = moodsByUser ?: loadMoods().also { moodsByUser = it }
        val entry = byUser[userId] ?: return null
        val expiry = isoToEpochMillisOrNull(entry.expiresAt)
        return entry.takeIf { it.moodEmoji.isNotEmpty() && (expiry == null || expiry > nowMillis()) }
    }

    private suspend fun loadMoods(): Map<String, StatusEntry> =
        (safely { moods() } ?: emptyList())
            .groupBy { it.userId }
            .mapValues { (_, entries) -> entries.maxBy { isoToEpochMillisOrNull(it.createdAt) ?: 0L } }

    private suspend fun <T> safely(block: suspend () -> T?): T? =
        try {
            block()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }
}
