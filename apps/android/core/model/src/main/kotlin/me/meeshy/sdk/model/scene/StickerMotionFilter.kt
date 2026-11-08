package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StickerAnimation

/**
 * Les stickers qui DÉCLARENT un mouvement connu, et eux seuls : la garde de performance du mouvement. Une scène
 * sans sticker animé (le cas courant) ne démarre aucune horloge et ne pose aucune transformée.
 */
public object StickerMotionFilter {

    public fun animation(item: SceneRenderItem): StickerAnimation? =
        (item.source as? MeeshySceneObject.Sticker)?.value?.stickerAnimation

    public fun animated(items: List<SceneRenderItem>): List<SceneRenderItem> =
        items.filter { animation(it) != null }

    public fun hasMotion(items: List<SceneRenderItem>): Boolean = items.any { animation(it) != null }
}
