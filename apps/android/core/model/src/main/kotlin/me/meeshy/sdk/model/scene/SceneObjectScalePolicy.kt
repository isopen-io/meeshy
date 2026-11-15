package me.meeshy.sdk.model.scene

import kotlin.math.max
import kotlin.math.min

/**
 * Jusqu'où un objet de scène grandit et rapetisse (#14298, jumelle iOS #14299).
 *
 * **Agrandir n'a pas de plafond** : la seule garde d'une échelle est d'être finie et positive. **Réduire s'arrête
 * quand le plus petit côté de l'objet vaut [MIN_SIDE_DESIGN_PX] pixels de la scène de RÉFÉRENCE 1080 × 1920** — les
 * design-pixels où s'expriment déjà `baseSize`, `fontSize` et l'export. L'échelle est écrite indépendamment de la
 * résolution : un plancher pris sur l'écran de l'auteur changerait d'un appareil à l'autre et ne tiendrait pas chez
 * le lecteur ; celui-ci rend exactement 5 pixels à l'export et environ 5 pixels sur une scène de 1080 de large.
 *
 * Le plancher est une règle du GESTE ([settled]) ; ce qui lit une échelle écrite ([served]) la rend telle quelle,
 * pour que le lecteur, la carte, la fiche et l'export peignent la taille que le compositeur a montrée.
 */
object SceneObjectScalePolicy {

    const val MIN_SIDE_DESIGN_PX: Double = 5.0

    /**
     * Jusqu'où la MISE EN PAGE d'un lecteur suit l'échelle. Au-delà, le calque agrandit ce qui a été mesuré à cette
     * échelle ([layered]) : la taille peinte est la même, et aucune contrainte de mise en page ne devient
     * irreprésentable sous une échelle immense.
     */
    const val LAYOUT_SCALE_CEILING: Double = 4.0

    private const val IDENTITY: Double = 1.0

    /** L'échelle sous laquelle un objet dont le plus petit côté vaut [smallestSideDesignPx] à l'échelle 1 passerait sous 5 pixels ; 0 si ce côté est inconnu. */
    fun floorFor(smallestSideDesignPx: Double): Double =
        if (smallestSideDesignPx > 0.0 && smallestSideDesignPx.isFinite()) MIN_SIDE_DESIGN_PX / smallestSideDesignPx else 0.0

    /**
     * L'échelle retenue pour [base] multipliée par le facteur du geste : sans plafond, jamais sous le plancher de
     * l'objet. Un facteur dégénéré (nul, négatif, NaN, ou un produit qui ne tient plus dans un nombre fini) laisse
     * l'échelle où elle est : aucun geste ne veut dire « fais disparaître » ni « retourne ».
     */
    fun settled(base: Double, gestureScale: Double, smallestSideDesignPx: Double): Double {
        val product = base * gestureScale
        if (!(product > 0.0 && product.isFinite())) return served(base)
        return max(product, floorFor(smallestSideDesignPx))
    }

    /**
     * L'échelle retenue pour une valeur SAISIE (champ « Taille » de la frise, pas ±, curseur d'une image clé) depuis
     * [current] : la règle du geste, sans plafond et au même plancher (#14304, iso iOS `SceneObjectScalePolicy.entered`).
     * Une saisie nulle ou négative (un « 0 » tapé, un pas « − » qui passe sous zéro) veut dire « le plus petit
     * possible » et s'arrête au plancher ; une saisie non finie ne change rien. Sans côté mesurable, la saisie grandit
     * encore et ne réduit plus.
     */
    fun entered(requested: Double, current: Double, smallestSideDesignPx: Double): Double {
        val start = served(current)
        if (!requested.isFinite()) return start
        if (!(smallestSideDesignPx > 0.0 && smallestSideDesignPx.isFinite())) return max(start, requested)
        return max(requested, floorFor(smallestSideDesignPx))
    }

    /**
     * Une échelle écrite (modèle, brouillon, charge décodée) telle que tout lecteur la rend : finie et positive,
     * elle passe telle quelle ; nulle, négative, NaN ou infinie, elle se ramène à l'IDENTITÉ — zéro fait disparaître
     * l'objet, un négatif le retourne, et aucun geste ne produit ces valeurs.
     */
    fun served(scale: Double): Double = if (scale > 0.0 && scale.isFinite()) scale else IDENTITY

    /** [served] coupée entre la mise en page (au plus [LAYOUT_SCALE_CEILING]) et le calque qui agrandit au-delà. */
    fun layered(scale: Double): LayeredScale = LayeredScale.of(served(scale), LAYOUT_SCALE_CEILING)

    /** [settled] pour les gestes Compose, qui produisent des `Float` : un produit qui ne tient plus dans un `Float` laisse l'échelle où elle est. */
    fun settled(base: Float, gestureScale: Float, smallestSideDesignPx: Double): Float {
        val next = settled(base.toDouble(), gestureScale.toDouble(), smallestSideDesignPx).toFloat()
        return if (next.isFinite()) next else served(base)
    }

    /** [served] pour les échelles stockées en `Float`. */
    fun served(scale: Float): Float = if (scale > 0f && scale.isFinite()) scale else IDENTITY.toFloat()
}

/**
 * Une grandeur rendue coupée en deux facteurs dont le produit la donne : [layout], ce que la mise en page mesure —
 * borné pour rester représentable —, et [layer], le facteur dont le calque agrandit ce qui a été mesuré.
 */
data class LayeredScale(val layout: Double, val layer: Double) {

    /** [layer] pour `graphicsLayer`, qui prend des `Float` : jamais infini. */
    val layerFloat: Float get() = min(layer, Float.MAX_VALUE.toDouble()).toFloat()

    companion object {
        /**
         * [total] mesuré jusqu'à [layoutCeiling], le reste au calque. Un total nul, négatif ou NaN ne peint rien ; un
         * total infini garde une mise en page bornée et le plus grand calque fini.
         */
        fun of(total: Double, layoutCeiling: Double): LayeredScale {
            if (!(total > 0.0)) return LayeredScale(layout = 0.0, layer = 1.0)
            if (total <= layoutCeiling) return LayeredScale(layout = total, layer = 1.0)
            val layer = total / layoutCeiling
            return LayeredScale(layout = layoutCeiling, layer = if (layer.isFinite()) layer else Double.MAX_VALUE)
        }
    }
}
