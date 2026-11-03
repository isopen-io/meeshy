package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.location.PlaceLabels
import me.meeshy.sdk.model.sticker.StickerSlotFiller
import me.meeshy.sdk.model.sticker.StickerTemplateCatalog
import me.meeshy.sdk.model.sticker.StickerTemplateFamily

/**
 * Les mesures de la pastille de lieu, en pixels RENDUS (miroir de `StickerTemplateMetrics.location` et de
 * `StickerTemplatePage.pillSize`, iOS) : les constantes de design (corps 42, marges 22 et 14, espacement 10) sont
 * multipliées par l'échelle de l'objet puis projetées par le facteur de la géométrie (largeur rendue / 1080). Une
 * seule mesure sert le rendu ET la zone tapable : la cible ne dérive jamais du pixel affiché.
 */
public object SceneLocationPillMetrics {

    public const val BASE_FONT: Double = 42.0
    public const val HORIZONTAL_PAD: Double = 22.0
    public const val VERTICAL_PAD: Double = 14.0
    public const val GAP: Double = 10.0

    /** Part de la largeur de la scène qu'une capsule ne dépasse jamais : au-delà, le nom est tronqué. */
    public const val MAX_WIDTH_FRACTION: Double = 0.9

    public data class Measures(
        val fontSize: Double,
        val horizontalPadding: Double,
        val verticalPadding: Double,
        val gap: Double,
    ) {
        /** L'épingle occupe un carré du côté du corps. */
        public val pinSide: Double get() = fontSize
    }

    public data class PillSize(val width: Double, val height: Double)

    public fun measures(renderedWidth: Double, scale: Double): Measures {
        val factor = CanvasGeometry.scaleFactor(renderedWidth)
        val s = if (scale.isFinite() && scale > 0.0) scale else 0.0
        fun projected(design: Double): Double = design * s * factor
        return Measures(projected(BASE_FONT), projected(HORIZONTAL_PAD), projected(VERTICAL_PAD), projected(GAP))
    }

    public fun maxTextWidth(measures: Measures, renderedWidth: Double): Double {
        val room = renderedWidth * MAX_WIDTH_FRACTION - measures.horizontalPadding * 2 - measures.pinSide - measures.gap
        return if (room.isFinite()) room.coerceAtLeast(0.0) else 0.0
    }

    /** La capsule autour d'un texte mesuré à [textWidth] × [textHeight] ; un texte trop long est borné à [maxTextWidth]. */
    public fun pillSize(measures: Measures, textWidth: Double, textHeight: Double, renderedWidth: Double): PillSize {
        val shown = textWidth.coerceIn(0.0, maxTextWidth(measures, renderedWidth).coerceAtLeast(0.0))
        return PillSize(
            width = Math.ceil(measures.horizontalPadding * 2 + measures.pinSide + measures.gap + shown),
            height = Math.ceil(measures.verticalPadding * 2 + maxOf(measures.pinSide, textHeight)),
        )
    }

    /** Le nom, sinon l'adresse, sinon [here] (le repli localisé) : jamais vide. */
    public fun label(place: SharedPlace, here: String): String =
        place.name?.trim()?.takeIf { it.isNotEmpty() } ?: place.address?.trim()?.takeIf { it.isNotEmpty() } ?: here

    /** Le gabarit de la famille LIEU que désigne [styleId] ; un autre, ou un inconnu, rend `null` (capsule native). */
    public fun templateId(styleId: String?): String? =
        styleId?.let(StickerTemplateCatalog::template)?.takeIf { it.family == StickerTemplateFamily.LOCATION }?.id

    /** Les emplacements d'un gabarit de lieu : le nom (ou l'adresse, ou [here]) et le détail sous lui, vide s'il n'y en a pas. */
    public fun slots(place: SharedPlace, here: String): Map<String, String> {
        val (first, second) = PlaceLabels.infoLines(place.name, place.address)
        return mapOf(StickerSlotFiller.PLACE_NAME to (first ?: here), StickerSlotFiller.PLACE_DETAIL to second.orEmpty())
    }
}
