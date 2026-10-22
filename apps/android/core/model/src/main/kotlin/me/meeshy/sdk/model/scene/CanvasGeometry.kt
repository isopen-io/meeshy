package me.meeshy.sdk.model.scene

/** Une taille en pixels de design ou de rendu, selon l'appelant. */
data class CanvasSize(val width: Double, val height: Double) {

    /** Vrai quand les deux côtés sont finis et strictement positifs. */
    val isRenderable: Boolean
        get() = width > 0.0 && height > 0.0 && width.isFinite() && height.isFinite()
}

/**
 * La géométrie de design unique d'une scène. Port de `CanvasGeometry` (iOS).
 *
 * Le design a TOUJOURS [DESIGN_WIDTH] de large ; c'est la hauteur qui suit le
 * format du cadre (1920 en portrait, 607,5 en paysage). La projection
 * design → écran est uniforme et se fait sur la largeur
 * (`scaleFactor = largeur rendue / 1080`) : deux largeurs rendues différentes
 * donnent donc des tailles proportionnelles identiques, et seule la
 * coordonnée Y normalisée se mappe sur la hauteur du format.
 *
 * Une instance décrit un cadre RENDU de [renderWidth] × [renderHeight]
 * pixels ; les fonctions du compagnon répondent sans instance (facteur,
 * hauteur design d'un format, cadre ajusté dans une zone).
 */
data class CanvasGeometry(val renderWidth: Double, val renderHeight: Double) {

    private val hasRenderableBounds: Boolean
        get() = CanvasSize(renderWidth, renderHeight).isRenderable

    val scaleFactor: Double
        get() = scaleFactor(renderWidth)

    /**
     * Taille de l'espace design de CE cadre : 1080 de large, la hauteur suit le
     * ratio des bornes rendues. Retombe sur le portrait si les bornes sont
     * dégénérées.
     */
    val designSize: CanvasSize
        get() = if (hasRenderableBounds) {
            CanvasSize(DESIGN_WIDTH, DESIGN_WIDTH * renderHeight / renderWidth)
        } else {
            designSize(CanvasFormat.PORTRAIT)
        }

    val designHeight: Double
        get() = designSize.height

    /** Une longueur de design projetée à l'écran. */
    fun render(designLength: Double): Double = designLength * scaleFactor

    /** Une fraction de la largeur (`0..1`) convertie en longueur de design. */
    fun designLength(normalized: Double): Double = normalized * DESIGN_WIDTH

    /** Une fraction de la hauteur (`0..1`, Y normalisé) convertie en longueur de design. */
    fun designHeightLength(normalized: Double): Double = normalized * designHeight

    companion object {
        const val DESIGN_WIDTH: Double = 1080.0

        private const val MIN_STICKER_FONT_SIZE: Double = 8.0

        /** Le facteur design → écran : largeur rendue sur 1080 (0 si la largeur est dégénérée). */
        fun scaleFactor(renderedWidth: Double): Double =
            if (renderedWidth > 0.0 && renderedWidth.isFinite()) renderedWidth / DESIGN_WIDTH else 0.0

        /** 1920 en portrait, 607,5 en paysage. */
        fun designHeight(format: CanvasFormat): Double = when (format) {
            CanvasFormat.PORTRAIT -> DESIGN_WIDTH / CanvasFormat.PORTRAIT.ratio
            CanvasFormat.LANDSCAPE -> DESIGN_WIDTH * CanvasFormat.PORTRAIT.ratio
        }

        fun designSize(format: CanvasFormat): CanvasSize = CanvasSize(DESIGN_WIDTH, designHeight(format))

        /** La géométrie d'un cadre de [format] rendu sur [renderedWidth] pixels de large. */
        fun of(format: CanvasFormat, renderedWidth: Double): CanvasGeometry =
            CanvasGeometry(renderedWidth, renderedWidth / format.ratio)

        /**
         * Le cadre de [format] ajusté (« fit ») dans [available], sans rognage :
         * borné par la largeur ou par la hauteur selon la zone. Source de vérité
         * du composer comme du lecteur, qui obtiennent ainsi des bornes
         * identiques. Une zone vide ou dégénérée est rendue telle quelle.
         */
        fun aspectFitSize(available: CanvasSize, format: CanvasFormat = CanvasFormat.PORTRAIT): CanvasSize {
            if (!(available.width > 0.0 && available.height > 0.0)) return available
            val width = minOf(available.width, available.height * format.ratio)
            return CanvasSize(width, width / format.ratio)
        }

        /**
         * Taille du glyphe d'un sticker, en pixels de la surface cible : la
         * taille design (`baseSize × scale`) projetée par le rapport
         * largeur / 1080, avec un plancher de 8 sous lequel le glyphe n'est
         * plus qu'un artefact d'anticrénelage. Site unique du canevas
         * interactif, de la miniature et de l'export.
         */
        fun stickerFontSize(baseSize: Double, scale: Double, canvasWidth: Double): Double {
            if (!(canvasWidth > 0.0)) return 0.0
            val designSide = baseSize.nonNegativeFinite() * scale.nonNegativeFinite()
            return maxOf(MIN_STICKER_FONT_SIZE, designSide * scaleFactor(canvasWidth))
        }

        private fun Double.nonNegativeFinite(): Double = if (isFinite()) coerceAtLeast(0.0) else 0.0
    }
}
