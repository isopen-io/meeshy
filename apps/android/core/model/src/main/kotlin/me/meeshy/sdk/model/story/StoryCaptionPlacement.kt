package me.meeshy.sdk.model.story

import kotlin.math.PI
import kotlin.math.max

/**
 * Où la légende d'une story se pose — miroir de `StoryCaptionPlacement` + `CaptionExpansionSpace` (iOS). Les valeurs
 * sont des dp (ou des pixels pour les fonctions de mesure) : l'appelant garde son unité.
 */
object StoryCaptionPlacement {
    /** Retrait latéral de la légende, comme les couches voisines du canevas. */
    const val SIDE_INSET_DP: Float = 20f

    /** Bande que le rail d'actions occupe à droite de la scène. */
    const val RAIL_BAND_DP: Float = 68f

    /** Opacité de la scène pendant que la légende est dépliée : on efface la scène, on n'ajoute pas de voile. */
    const val EXPANDED_SCENE_OPACITY: Float = 0.28f

    const val SPRING_RESPONSE: Float = 0.38f
    const val SPRING_DAMPING: Float = 0.82f

    private const val TOP_CHROME_EXTRA: Float = 100f

    /** Raideur Compose équivalente à `spring(response:)` SwiftUI : (2π / réponse)². */
    fun springStiffness(): Float {
        val omega = (2 * PI / SPRING_RESPONSE).toFloat()
        return omega * omega
    }

    /**
     * Le bas de la légende épouse la hauteur MESURÉE du composeur ; sans composeur, ou chrome masqué, il se pose au ras
     * du bas sur le seul retrait.
     */
    fun bottomInset(composerBlockHeight: Float?, composerBottomPadding: Float, isComposerShown: Boolean): Float {
        val height = composerBlockHeight?.takeIf { isComposerShown && it > 0f } ?: return composerBottomPadding
        return composerBottomPadding + height
    }

    /** La bande du rail rendue au repère de l'écran quand la colonne du canevas déborde du viewport. */
    fun railClearanceInset(columnWidth: Float, viewportWidth: Float): Float =
        max(0f, (columnWidth - viewportWidth) / 2f) + RAIL_BAND_DP

    /** La bande haute (barre d'état + entête) que la zone de retour en tête ne recouvre pas. */
    fun topChromeReserve(topInset: Float): Float = topInset + TOP_CHROME_EXTRA

    fun sceneOpacity(captionExpanded: Boolean): Float = if (captionExpanded) EXPANDED_SCENE_OPACITY else 1f
}
