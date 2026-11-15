package me.meeshy.sdk.model.scene

/**
 * La mise en lignes d'un texte de scène (iOS `StoryTextLayer.configure` + `+FrameScale`) : la coupe se calcule TOUJOURS
 * à l'échelle 1 contre 88 % de la largeur design (44 % pour un losange encadré). Le pincement n'agrandit que le cadre
 * entier — police, largeur de coupe, marges, liseré, fond — donc la largeur de coupe suit le même facteur que la police
 * et les lignes restent celles qu'on a écrites. Pure : les mesures de glyphes viennent de l'appelant.
 */
object SceneTextWrapPolicy {
    /** La largeur de coupe, en design-pixels, à l'échelle 1. */
    fun designWidth(shape: StoryTextFrameShape, framed: Boolean): Double =
        CanvasGeometry.DESIGN_WIDTH * StoryTextFrameGeometry.maxTextWidthFraction(shape, framed)

    /**
     * La largeur de mesure du texte en pixels, pour [pxPerDesign] pixels par design-pixel (échelle de l'objet comprise).
     * [roomPx] est la place que la mise en page accorde, si elle est bornée : un texte encadré ne la dépasse jamais, et
     * garde la marge d'un « o » ([oGlyphPx]) de chaque côté.
     */
    fun measureWidthPx(
        shape: StoryTextFrameShape,
        framed: Boolean,
        pxPerDesign: Double,
        roomPx: Double?,
        oGlyphPx: Double,
        paddingScale: Double,
    ): Double {
        val canvasCap = designWidth(shape, framed) * pxPerDesign
        if (roomPx == null || !framed || pxPerDesign <= 0.0) return canvasCap
        val k = pxPerDesign
        val roomCap = StoryTextFrameGeometry.maxTextWidth(shape, roomPx / k, oGlyphPx / k, paddingScale) * k
        return minOf(canvasCap, roomCap)
    }
}
