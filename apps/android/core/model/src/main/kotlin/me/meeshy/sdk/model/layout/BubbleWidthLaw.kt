package me.meeshy.sdk.model.layout

/**
 * Largeur maximale d'une bulle de message — miroir de
 * `DeviceLayout.bubbleMaxWidth(containerWidth:sizeClass:)` (apps/ios/Meeshy/Core/DeviceLayout.swift).
 *
 * Le conteneur est la largeur REELLE de la liste qui porte la bulle (colonne, fenetre detachee,
 * split-screen), jamais l'ecran : l'ecart oppose a la bulle est ce qui distingue envoye et recu
 * d'un coup d'oeil, et une mesure prise sur la dalle l'effacerait des que la fenetre est plus
 * etroite qu'elle. Compact : 70 %, sans plafond. Medium / Expanded : 62 %, plafond 560 dp.
 */
object BubbleWidthLaw {
    const val COMPACT_RATIO: Float = 0.70f
    const val WIDE_RATIO: Float = 0.62f
    const val WIDE_CAP_DP: Float = 560f

    /** Largeur maximale en dp ; `0` pour un conteneur vide, negatif ou inconnu (NaN). */
    fun maxWidthDp(containerWidthDp: Float, widthClass: WindowWidthClass): Float {
        if (!(containerWidthDp > 0f)) return 0f
        return if (widthClass.isWide) {
            minOf(containerWidthDp * WIDE_RATIO, WIDE_CAP_DP)
        } else {
            containerWidthDp * COMPACT_RATIO
        }
    }
}
