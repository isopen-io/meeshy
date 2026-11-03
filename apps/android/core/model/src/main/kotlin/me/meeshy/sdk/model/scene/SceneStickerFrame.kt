package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StorySticker

/**
 * Le côté RENDU d'un sticker, en pixels : `baseSize` (140 design par défaut) × échelle servie × facteur de la
 * géométrie (largeur rendue / 1080). Un seul site pour l'emoji rasterisé, l'image et le gabarit : ils ont tous
 * la même boîte, centrée sur l'ancre du sticker.
 */
public object SceneStickerFrame {

    public fun side(sticker: StorySticker, scale: Double, geometry: CanvasGeometry): Double =
        side(sticker.baseSize, scale, geometry)

    public fun side(baseSize: Double, scale: Double, geometry: CanvasGeometry): Double {
        val design = SceneObjectNumbers.stickerSideFraction(baseSize, scale) * CanvasGeometry.DESIGN_WIDTH
        val rendered = geometry.render(design)
        return if (rendered.isFinite()) rendered else 0.0
    }

    /** Le côté en pixels ENTIERS (au moins 1 s'il y a quelque chose à peindre), clé de cache des emoji. */
    public fun rasterSide(side: Double): Int =
        if (side.isFinite() && side > 0.0) Math.round(side).toInt().coerceAtLeast(1) else 0
}
