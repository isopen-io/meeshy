package me.meeshy.sdk.model.scene

/**
 * La mise en page PURE d'un élément du plan de rendu, en fractions de la LARGEUR de la scène : un seul
 * site pour tous les canevas (lecteur, tuile du fil, couverture), quelle que soit la taille du 9:16.
 */
public object SceneItemLayout {

    /** Le côté d'un sticker à la pose servie (keyframes comprises), partagé entre mise en page et calque (#14298). */
    public fun stickerSide(item: SceneRenderItem): LayeredScale {
        val sticker = (item.source as? MeeshySceneObject.Sticker)?.value
            ?: return LayeredScale(layout = 0.0, layer = 1.0)
        val fraction = SceneObjectNumbers.stickerSideFraction(sticker.baseSize, item.pose.scale)
        return LayeredScale.of(fraction, SceneObjectNumbers.MAX_STICKER_LAYOUT_FRACTION)
    }

    /** La taille d'un média de premier plan, en fractions de la largeur de la scène (largeur, hauteur). */
    public fun mediaSize(item: SceneRenderItem): Pair<Double, Double>? {
        val media = (item.source as? MeeshySceneObject.Media)?.value ?: return null
        val size = ForegroundMediaFrame.renderedSize(media.aspectRatio, item.pose.scale, canvasWidth = 1.0)
        return size.width to size.height
    }

    /** Un calque sans effet visuel (squelettes lieu et puce audio) : le dispatcher l'ignore. */
    public fun paints(item: SceneRenderItem): Boolean = when (item.kind) {
        MeeshySceneObject.Kind.TEXT -> !item.displayText.isNullOrEmpty()
        MeeshySceneObject.Kind.MEDIA, MeeshySceneObject.Kind.STICKER -> true
        MeeshySceneObject.Kind.PLACE, MeeshySceneObject.Kind.AUDIO -> false
    }
}
