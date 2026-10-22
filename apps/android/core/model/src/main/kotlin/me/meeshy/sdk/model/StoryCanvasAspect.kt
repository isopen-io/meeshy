package me.meeshy.sdk.model

/**
 * La forme du canvas d'une story : VERTICAL 9:16 par défaut, HORIZONTAL 16:9 quand l'image de
 * fond importée est plus large que haute — miroir de `StoryCanvasAspect` (iOS). Décision pure.
 */
enum class StoryCanvasAspect(val ratio: Double) {
    PORTRAIT(SceneShape.ASPECT),
    LANDSCAPE(1.0 / SceneShape.ASPECT),
    ;

    companion object {
        /** Plus large que haute ⇒ paysage ; sinon (portrait, carré, dimensions invalides) ⇒ portrait. */
        fun from(width: Double, height: Double): StoryCanvasAspect =
            if (width > 0 && height > 0 && width > height) LANDSCAPE else PORTRAIT

        /** Reconstruit depuis un ratio persisté : `null` ou ≤ 1 ⇒ portrait. */
        fun from(ratio: Double?): StoryCanvasAspect = if (ratio != null && ratio > 1.0) LANDSCAPE else PORTRAIT
    }
}
