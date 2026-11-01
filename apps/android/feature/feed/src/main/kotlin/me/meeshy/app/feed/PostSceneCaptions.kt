package me.meeshy.app.feed

import me.meeshy.sdk.model.FeedMediaType
import me.meeshy.sdk.model.StoryItem

/**
 * **La légende adossée à CHAQUE scène d'un post** — miroir de `SceneCaption` (iOS), appelé sans repli sur le texte du post
 * (`carrierFallback: false`) : le fil et la fiche rendent déjà ce texte au-dessus des scènes.
 *
 * Une scène est légendée par le média qu'elle MONTRE, celui du plan le plus bas qu'elle désigne (`carrierMediaIdentity`), jamais
 * par celui d'une autre scène. Un document qui ne désigne AUCUN média (une scène de texte migrée) n'a qu'un visuel possible : le
 * premier du post. Le repli se juge sur le document entier, jamais scène par scène, sans quoi une scène muette emprunterait la
 * légende d'une voisine.
 */
internal object PostSceneCaptions {

    fun of(scenes: List<StoryItem>, media: List<FeedMediaItem>): List<String?> {
        val shown = scenes.map(::carrierMediaId)
        val fallback = if (shown.all { it == null }) media.firstOrNull { it.type == FeedMediaType.IMAGE || it.type == FeedMediaType.VIDEO }?.id else null
        return shown.map { id -> (id ?: fallback)?.let { mediaId -> media.firstOrNull { it.id == mediaId }?.caption?.trim()?.takeIf(String::isNotEmpty) } }
    }

    /**
     * La légende du PLEIN ÉCRAN de la scène [index] (iOS `SceneCaption.resolve`, `carrierFallback: true`) : la sienne, ou le texte
     * du post, que rien d'autre n'y affiche. `null` quand rien ne la légende : aucun bandeau n'est alors peint.
     */
    fun reader(scenes: FeedPostScenes, index: Int): String? = scenes.captions.getOrNull(index) ?: scenes.carrierText

    private fun carrierMediaId(scene: StoryItem): String? =
        scene.storyEffects?.mediaObjects.orEmpty().filter { it.postMediaId.isNotBlank() }.minByOrNull { it.zIndex }?.postMediaId
}
