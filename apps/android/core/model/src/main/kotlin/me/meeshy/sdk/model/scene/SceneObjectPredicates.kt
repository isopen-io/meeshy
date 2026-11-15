package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryMediaKind

/**
 * Ce qu'on peut dire d'UN objet de la scène, sans rien rendre (miroir de `StorySceneObjectPredicates`, iOS).
 *
 * Le menu d'appui long, le rail de droite et les actions d'accessibilité posent les mêmes questions —
 * verrouillé, fond, frère de plan, source rognable : une seule réponse, pour qu'aucun des trois n'offre
 * ce que l'autre refuse.
 */
public object SceneObjectPredicates {

    /** Le badge d'attribution d'une republication est le seul porteur du verrou : il n'existe que sur un texte. */
    public fun isLocked(lists: SceneLists, id: String): Boolean =
        lists.texts.firstOrNull { it.id == id }?.isLocked == true

    /** Un objet du plan fond : un visuel ou un son. */
    public fun isBackground(lists: SceneLists, id: String): Boolean =
        lists.sceneObject(id)?.isBackground == true

    /** Une vidéo et un son ont une source à rogner ; une image, un texte, un sticker ou un lieu, non. */
    public fun hasTrimmableSource(lists: SceneLists, id: String): Boolean = when (val obj = lists.sceneObject(id)) {
        is MeeshySceneObject.Media -> obj.value.kind == StoryMediaKind.VIDEO
        is MeeshySceneObject.Audio -> true
        is MeeshySceneObject.Text, is MeeshySceneObject.Sticker, is MeeshySceneObject.Place, null -> false
    }

    /** Un frère de plan, tous types confondus : l'empilement raisonne sur les `zIndex` de tous les objets posés. */
    public fun sharesPlaneWithAnother(lists: SceneLists, besides: String): Boolean =
        lists.sceneObjects.any { it.id != besides && !it.isBackground }
}
