package me.meeshy.app.stories

import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryGroup
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La cover d'un anneau = la miniature de la DERNIÈRE story, mémoïsée — port de
 * `StoryCoverURLMemo` (iOS, #4002). La sonde disque ([probe]) est le SEUL accès E/S de la cascade
 * et n'est jamais appelée depuis la composition : le plateau est construit hors composition, ce
 * type évite seulement de la rejouer à chaque réémission.
 *
 * Deux craintes explicites : une cover écrite APRÈS coup ([bumpGeneration]), et le changement
 * de compte — la mémoire porte l'identité qui l'a remplie et se vide d'elle-même.
 * L'absence est mémorisée aussi (`containsKey`), sinon la story sans cover — le cas le plus
 * fréquent — sonderait le disque à chaque passe.
 */
@Singleton
class StoryCoverMemo @Inject constructor() {

    private var filledFor: String? = null
    private val resolved = HashMap<String, String?>()

    @Synchronized
    fun bumpGeneration() {
        resolved.clear()
    }

    @Synchronized
    fun reset() {
        resolved.clear()
        filledFor = null
    }

    @Synchronized
    fun coverUrl(group: StoryGroup, accountId: String?, probe: (storyId: String) -> String?): String? {
        if (filledFor != accountId) {
            resolved.clear()
            filledFor = accountId
        }
        val last = group.stories.lastOrNull() ?: return group.avatarURL
        val local = if (resolved.containsKey(last.id)) {
            resolved[last.id]
        } else {
            probe(last.id).also { resolved[last.id] = it }
        }
        val media = last.media.firstOrNull()
        return preferredCover(
            localCover = local,
            serverThumbnailUrl = media?.thumbnailUrl,
            mediaUrl = media?.url,
            mediaIsImage = media?.type == FeedMediaType.IMAGE,
            avatarUrl = group.avatarURL,
        )
    }

    companion object {
        /** Cascade : cover composite locale > miniature serveur > média image > avatar. */
        internal fun preferredCover(
            localCover: String?,
            serverThumbnailUrl: String?,
            mediaUrl: String?,
            mediaIsImage: Boolean,
            avatarUrl: String?,
        ): String? = localCover?.takeIf { it.isNotBlank() }
            ?: serverThumbnailUrl?.takeIf { it.isNotBlank() }
            ?: mediaUrl?.takeIf { mediaIsImage && it.isNotBlank() }
            ?: avatarUrl
    }
}
