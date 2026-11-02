package me.meeshy.sdk.model.composer

/**
 * Ce que la vignette d'une slide propose d'ÉDITER (miroir de `SlideThumbEditAffordance` iOS, #5041) : le FOND de sa slide.
 *
 * La règle décide d'une ABSENCE. Une slide de texte, de dessin ou vierge n'a rien à ouvrir, et une entrée « Éditer le
 * fond » qui n'ouvrirait rien serait la loi 4 prise en défaut — pire qu'absente, elle a l'air de marcher jusqu'au toucher.
 */
object SlideThumbEditAffordance {

    /** L'identifiant du fond à ouvrir, ou `null` — auquel cas la vignette n'offre aucune entrée d'édition. */
    fun editableBackgroundId(backgroundMediaId: String?, hostServesEditor: Boolean): String? =
        backgroundMediaId?.takeIf { hostServesEditor && it.isNotBlank() }
}
