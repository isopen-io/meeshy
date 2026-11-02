package me.meeshy.sdk.model.scene


/**
 * Le z-order UNIFIÉ de la scène (miroir de `StoryComposerViewModel+ZOrder.swift`) : il porte les
 * cinq genres, se réhydrate depuis les `zIndex` persistés au retour sur une slide, et le
 * prochain rang ne recule jamais — supprimer l'objet de devant ne rend pas son rang à un
 * objet neuf, qui s'afficherait sous des objets plus anciens.
 */
public data class SceneZOrder(
    val ranks: Map<String, Int> = emptyMap(),
    val next: Int = FIRST,
) {
    /** Le rang courant de [id] : celui du cache, sinon celui qui est persisté. */
    public fun rank(id: String, persisted: Int = 0): Int = ranks[id] ?: persisted

    /** Amène [id] devant tout le reste. */
    public fun bringToFront(id: String): SceneZOrder = SceneZOrder(ranks + (id to next), next + 1)

    /** Retire [id] du cache ; `next` ne recule jamais. */
    public fun forget(id: String): SceneZOrder = copy(ranks = ranks - id)

    /** Réhydratation : les rangs persistés de [lists], et `next` au-delà du plus haut, sans jamais reculer. */
    public fun rehydrated(lists: SceneLists): SceneZOrder {
        val persisted = lists.sceneObjects.associate { it.id to it.zIndex }
        return SceneZOrder(persisted, maxOf(next, (persisted.values.maxOrNull() ?: 0) + 1, FIRST))
    }

    /** Écrit les rangs du cache dans les objets : le `zIndex` persisté suit l'empilement choisi. */
    public fun applied(lists: SceneLists): SceneLists = SceneLists.from(
        lists.sceneObjects.map { obj -> ranks[obj.id]?.let { obj.withZIndex(it) } ?: obj },
        previous = lists,
    )

    public companion object {
        public const val FIRST: Int = 1
    }
}

/** Une copie de l'objet à un autre rang d'empilement. */
public fun MeeshySceneObject.withZIndex(z: Int): MeeshySceneObject = when (this) {
    is MeeshySceneObject.Text -> MeeshySceneObject.Text(value.copy(zIndex = z))
    is MeeshySceneObject.Media -> MeeshySceneObject.Media(value.copy(zIndex = z))
    is MeeshySceneObject.Sticker -> MeeshySceneObject.Sticker(value.copy(zIndex = z))
    is MeeshySceneObject.Place -> MeeshySceneObject.Place(value.copy(zIndex = z))
    is MeeshySceneObject.Audio -> MeeshySceneObject.Audio(value.copy(zIndex = z))
}
