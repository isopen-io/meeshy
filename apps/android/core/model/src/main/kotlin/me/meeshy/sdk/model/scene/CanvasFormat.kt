package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.SceneV3

private const val PORTRAIT_ASPECT = 9.0 / 16.0
private const val LANDSCAPE_WIRE = "landscape"

/**
 * La forme du cadre d'une scène : portrait 9:16 par défaut, paysage 16:9 quand
 * le porteur d'origine l'indique. Port de `StoryCanvasAspect` (iOS).
 *
 * [ratio] est le rapport largeur / hauteur. Les deux formats ont la MÊME
 * largeur design (voir [CanvasGeometry.DESIGN_WIDTH]) : seule la hauteur
 * change, ce qui garde tout contenu projeté sur la largeur — abscisse,
 * tailles — identique d'un format à l'autre.
 */
enum class CanvasFormat(val ratio: Double) {
    PORTRAIT(PORTRAIT_ASPECT),
    LANDSCAPE(1.0 / PORTRAIT_ASPECT);

    /** Le nom persisté dans le brouillon : `null` pour le portrait, qui est le défaut d'un blob d'avant. */
    val wire: String? get() = if (this == LANDSCAPE) LANDSCAPE_WIRE else null

    companion object {
        /**
         * Déduit le format du `carrierAspect` d'une scène v3 (ratio largeur /
         * hauteur du porteur d'origine). Un porteur plus large que haut bascule
         * en paysage ; un carré, un porteur plus haut que large, une valeur
         * absente ou aberrante (NaN, infini, nul, négatif) restent en portrait :
         * on ne fabrique jamais un cadre paysage depuis une donnée douteuse.
         */
        fun fromCarrierAspect(carrierAspect: Double?): CanvasFormat =
            if (carrierAspect != null && carrierAspect.isFinite() && carrierAspect > 1.0) LANDSCAPE else PORTRAIT

        /**
         * Le format qu'impose un fond importé de [width] x [height] pixels (iOS `StoryCanvasAspect.from(width:height:)`) :
         * strictement plus large que haut ⇒ paysage ; carré, portrait ou dimensions inconnues ⇒ portrait.
         */
        fun fromSourceSize(width: Double?, height: Double?): CanvasFormat =
            if (width != null && height != null && width.isFinite() && height.isFinite() && width > 0.0 && height > 0.0 && width > height) {
                LANDSCAPE
            } else {
                PORTRAIT
            }

        /** Relit le format persisté dans un brouillon : un nom absent ou inconnu se lit portrait (rétrocompatibilité). */
        fun fromWire(wire: String?): CanvasFormat = if (wire.equals(LANDSCAPE_WIRE, ignoreCase = true)) LANDSCAPE else PORTRAIT
    }
}

/**
 * Le format du cadre de cette scène, déduit de son [SceneV3.carrierAspect].
 *
 * Ce que cette lecture dit est la forme du PORTEUR d'origine (l'équivalent de
 * `StoryEffects.canvasAspectRatio` en v1), pas une loi de cadrage du lecteur :
 * côté iOS, `SceneShape.aspect(of:)` (#6896, #6904) tient une scène v3 pour
 * toujours 9:16, ses ancres ayant déjà été letterboxées par la conversion
 * (voir `CanvasV3Projection`). Un lot qui câble ce format à une surface
 * décide donc, surface par surface, s'il cadre en 16:9 ou s'il garde le 9:16 ;
 * il ne cumule jamais les deux, sous peine de remapper deux fois les ancres.
 */
val SceneV3.canvasFormat: CanvasFormat
    get() = CanvasFormat.fromCarrierAspect(carrierAspect)
