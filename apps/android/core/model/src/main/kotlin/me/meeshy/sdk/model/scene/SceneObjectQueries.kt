package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryObjectPlacement
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.timeline.TimelineProject

/**
 * Les cinq listes d'objets d'une slide, toutes non nulles, vues comme UNE scène (miroir de
 * `StoryEffects.sceneObjects` / `sceneObject(id:)` / `TimelineProject.sceneObjects`).
 *
 * `StoryEffects` ne porte pas encore les pastilles de lieu sur Android (comme
 * [TimelineProject]) : elles arrivent donc à part. Ce type est la vue de lecture ; les
 * listes d'origine restent la source de vérité sérialisée.
 */
public data class SceneLists(
    val texts: List<StoryTextObject> = emptyList(),
    val medias: List<StoryMediaObject> = emptyList(),
    val stickers: List<StorySticker> = emptyList(),
    val places: List<StoryLocationObject> = emptyList(),
    val audios: List<StoryAudioPlayerObject> = emptyList(),
) {
    /**
     * Les objets, du FOND vers l'avant : triés par `zIndex`, à égalité par ordre de famille
     * puis de liste — arbitraire mais STABLE (un ordre qui change entre deux appels ferait
     * clignoter ce qui le consomme).
     */
    public val sceneObjects: List<MeeshySceneObject> by lazy(LazyThreadSafetyMode.NONE) {
        (
            texts.map { MeeshySceneObject.Text(it) } +
                medias.map { MeeshySceneObject.Media(it) } +
                stickers.map { MeeshySceneObject.Sticker(it) } +
                places.map { MeeshySceneObject.Place(it) } +
                audios.map { MeeshySceneObject.Audio(it) }
            ).sortedBy { it.zIndex }
    }

    /** L'objet d'id [id], ou `null` s'il a été supprimé pendant qu'une sélection le tenait encore. */
    public fun sceneObject(id: String): MeeshySceneObject? =
        texts.firstOrNull { it.id == id }?.let { MeeshySceneObject.Text(it) }
            ?: medias.firstOrNull { it.id == id }?.let { MeeshySceneObject.Media(it) }
            ?: stickers.firstOrNull { it.id == id }?.let { MeeshySceneObject.Sticker(it) }
            ?: places.firstOrNull { it.id == id }?.let { MeeshySceneObject.Place(it) }
            ?: audios.firstOrNull { it.id == id }?.let { MeeshySceneObject.Audio(it) }

    /** Les objets POSÉS : un fond n'a ni position ni puce (miroir de `ComposerSceneObjectCount.posed`). */
    public val posedObjects: List<MeeshySceneObject>
        get() = sceneObjects.filterNot { it.isBackground }

    /** Positions des objets posés, hors [excluding] : l'entrée de la cascade [StoryObjectPlacement]. */
    public fun posedPositions(excluding: String? = null): List<StoryObjectPlacement.Point> =
        posedObjects.filter { it.id != excluding }.map { StoryObjectPlacement.Point(it.x, it.y) }

    /** Où poser un objet NEUF : jamais sur un objet posé (fonds exclus). */
    public fun nextObjectPosition(): StoryObjectPlacement.Point = StoryObjectPlacement.next(posedPositions())

    public companion object {
        /**
         * Chemin retour, sans perte : reconstruit les cinq listes depuis [objects] en gardant,
         * pour chaque famille, l'ordre de [previous] (les objets neufs suivent dans l'ordre reçu).
         */
        public fun from(objects: List<MeeshySceneObject>, previous: SceneLists = SceneLists()): SceneLists = SceneLists(
            texts = objects.filterIsInstance<MeeshySceneObject.Text>().map { it.value }
                .inOrderOf(previous.texts) { it.id },
            medias = objects.filterIsInstance<MeeshySceneObject.Media>().map { it.value }
                .inOrderOf(previous.medias) { it.id },
            stickers = objects.filterIsInstance<MeeshySceneObject.Sticker>().map { it.value }
                .inOrderOf(previous.stickers) { it.id },
            places = objects.filterIsInstance<MeeshySceneObject.Place>().map { it.value }
                .inOrderOf(previous.places) { it.id },
            audios = objects.filterIsInstance<MeeshySceneObject.Audio>().map { it.value }
                .inOrderOf(previous.audios) { it.id },
        )
    }
}

private fun <T> List<T>.inOrderOf(previous: List<T>, id: (T) -> String): List<T> {
    val rank = previous.withIndex().associate { id(it.value) to it.index }
    return sortedBy { rank[id(it)] ?: Int.MAX_VALUE }
}

/** La scène d'un [StoryEffects] ; les lieux, absents du modèle Android, arrivent à part. */
public fun StoryEffects.sceneLists(places: List<StoryLocationObject> = emptyList()): SceneLists = SceneLists(
    texts = textObjects,
    medias = mediaObjects.orEmpty(),
    stickers = stickerObjects.orEmpty(),
    places = places,
    audios = audioPlayerObjects.orEmpty(),
)

/**
 * Chemin retour vers les effets : les listes optionnelles restent `null` tant qu'elles l'étaient
 * et qu'aucun objet de leur famille n'existe (aller-retour sans perte).
 */
public fun StoryEffects.applying(lists: SceneLists): StoryEffects = copy(
    textObjects = lists.texts,
    mediaObjects = lists.medias.takeIf { it.isNotEmpty() || mediaObjects != null },
    stickerObjects = lists.stickers.takeIf { it.isNotEmpty() || stickerObjects != null },
    audioPlayerObjects = lists.audios.takeIf { it.isNotEmpty() || audioPlayerObjects != null },
)

/** La scène d'un projet de timeline : ses cinq listes sont non nulles. */
public val TimelineProject.sceneLists: SceneLists
    get() = SceneLists(textObjects, mediaObjects, stickerObjects, locationObjects, audioPlayerObjects)
