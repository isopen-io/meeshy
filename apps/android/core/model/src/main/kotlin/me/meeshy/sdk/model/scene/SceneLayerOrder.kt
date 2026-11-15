package me.meeshy.sdk.model.scene

/**
 * Les plans de peinture, du fond vers l'avant. L'ordre est IDENTIQUE en édition, lecture,
 * couverture et export : fond, plan média/contenu, puis texte, sticker, lieu (et puce audio)
 * par `zIndex` croissant.
 */
public enum class ScenePlane { BACKGROUND, CONTENT, OVERLAY }

public object SceneLayerOrder {

    /** Le plan d'un objet : un fond est au fond, un média au plan contenu, le reste au-dessus. */
    public fun plane(obj: MeeshySceneObject): ScenePlane = when {
        obj.isBackground -> ScenePlane.BACKGROUND
        obj.kind == MeeshySceneObject.Kind.MEDIA -> ScenePlane.CONTENT
        else -> ScenePlane.OVERLAY
    }

    /** Tri STABLE par plan puis `zIndex` : à égalité, l'ordre d'entrée est conservé. */
    public fun <T> sorted(items: List<T>, plane: (T) -> ScenePlane, zIndex: (T) -> Int): List<T> =
        items.sortedWith(compareBy<T>({ plane(it).ordinal }, { zIndex(it) }))
}
