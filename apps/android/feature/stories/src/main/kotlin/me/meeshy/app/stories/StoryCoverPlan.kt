package me.meeshy.app.stories

import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.StoryMediaKind

/**
 * Le plan de rendu d'une couverture côté RÉCEPTEUR (iOS `StoryCoverThumbnail.receiverCoverPlan`) : quelles images charger et
 * dans quel emplacement du rendu les injecter. Une story texte ou fond coloré (± audio) se rend sans image ; un fond visuel
 * image doit être chargé (couche dominante) ; un fond VIDÉO n'a pas de poster côté récepteur : pas de plan, la cascade de
 * [StoryCoverMemo] garde la main. Pur.
 */
internal data class StoryCoverPlan(
    /** Fond historique (premier média image du post) → emplacement `bgImage`. */
    val legacyBackgroundUrl: String?,
    /** Images par id d'objet (fond moderne compris) ; les stickers image sont rangés sous l'id de l'élément. */
    val imageUrlsByObjectId: Map<String, String>,
    /** Objets dont l'image est indispensable : son échec donne pas de couverture plutôt qu'une couverture sans sa couche dominante. */
    val requiredObjectIds: Set<String>,
) {
    companion object {

        fun of(item: StoryItem): StoryCoverPlan? {
            val effects = item.storyEffects ?: return null
            var legacy: String? = null
            val images = LinkedHashMap<String, String>()
            val required = LinkedHashSet<String>()
            // Les médias que les STICKERS référencent sont attachés au post comme les autres : le repli historique les
            // prendrait pour le fond et peindrait l'image d'un sticker plein cadre derrière la composition.
            val stickerMediaIds = effects.stickerObjects.orEmpty().map { it.postMediaId }.filter { it.isNotEmpty() }.toSet()
            val background = effects.mediaObjects?.firstOrNull { it.isBackground }
            if (background != null) {
                val url = background.mediaURL?.takeIf { it.isNotEmpty() }
                    ?: item.media.firstOrNull { it.id == background.postMediaId }?.url
                if (background.kind != StoryMediaKind.IMAGE || url.isNullOrEmpty()) return null
                images[background.id] = url
                required += background.id
            } else {
                val visual = item.media.firstOrNull {
                    (it.type == FeedMediaType.IMAGE || it.type == FeedMediaType.VIDEO) && it.id !in stickerMediaIds
                }
                if (visual != null) {
                    if (visual.type != FeedMediaType.IMAGE || visual.url.isNullOrEmpty()) return null
                    legacy = visual.url
                }
            }
            effects.mediaObjects.orEmpty().filter { !it.isBackground && it.kind == StoryMediaKind.IMAGE }.forEach { media ->
                val url = media.mediaURL?.takeIf { it.isNotEmpty() }
                    ?: item.media.firstOrNull { it.id == media.postMediaId }?.url
                if (!url.isNullOrEmpty()) images[media.id] = url
            }
            // Un sticker image : jamais indispensable — sans son image le rendu peint l'emoji de repli, mieux que rien.
            effects.stickerObjects.orEmpty().filter { it.postMediaId.isNotEmpty() }.forEach { sticker ->
                val url = item.media.firstOrNull { it.id == sticker.postMediaId }?.url
                if (!url.isNullOrEmpty()) images[sticker.id] = url
            }
            val hasVisualBackground = legacy != null || required.isNotEmpty()
            val hasDrawableContent = effects.textObjects.isNotEmpty() || !effects.drawingStrokes.isNullOrEmpty() ||
                !effects.background.isNullOrEmpty()
            return if (hasVisualBackground || hasDrawableContent) StoryCoverPlan(legacy, images, required) else null
        }

        /** La DERNIÈRE story de chaque groupe (celle que la tuile montre), hors celles déjà couvertes. */
        fun candidates(groups: List<StoryGroup>, hasLocalCover: (String) -> Boolean): List<StoryItem> =
            groups.mapNotNull { group -> group.stories.lastOrNull()?.takeUnless { hasLocalCover(it.id) } }
    }
}
