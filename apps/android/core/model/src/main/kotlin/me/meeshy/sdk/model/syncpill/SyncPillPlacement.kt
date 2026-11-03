package me.meeshy.sdk.model.syncpill

import kotlin.math.max

/**
 * Où la pastille se pose : juste au-dessus du chrome bas, et elle suit le clavier avec lui (miroir d'iOS
 * `SyncPillPlacement`, #10840). Fonctions PURES en dp : c'est la DÉCISION qui se teste, le rendu n'a qu'un point de montage.
 */
object SyncPillPlacement {
    /** L'air entre le bas de la pastille et le haut du chrome bas. */
    const val GAP_ABOVE_CHROME: Float = 8f

    fun bottomPadding(dockedChromeHeight: Float): Float = max(dockedChromeHeight, 0f) + GAP_ABOVE_CHROME

    /** Le bord contre lequel la pastille se pose : le haut du clavier quand il est levé, la zone sûre sinon. */
    fun keyboardAwareEdge(safeAreaBottom: Float, keyboardHeight: Float): Float =
        max(max(keyboardHeight, safeAreaBottom), 0f)

    /** Le bord bas = max(clavier, zone sûre) + hauteur amarrée + 8. */
    fun bottomFromScreenEdge(safeAreaBottom: Float, keyboardHeight: Float, dockedChromeHeight: Float): Float =
        keyboardAwareEdge(safeAreaBottom, keyboardHeight) + bottomPadding(dockedChromeHeight)

    /** La hauteur qu'un chrome déclare depuis sa propre mesure, plus l'air que son hôte laisse sous lui. */
    fun dockedHeight(measuredHeight: Float, liftAboveEdge: Float = 0f): Float =
        max(measuredHeight, 0f) + max(liftAboveEdge, 0f)

    /** La hauteur déclarée depuis la position du HAUT du chrome (hôte qui ignore la zone sûre, ex. le lecteur de story). */
    fun dockedHeightFromTop(chromeTopFromScreenBottom: Float, safeAreaBottom: Float, keyboardHeight: Float): Float =
        max(chromeTopFromScreenBottom - keyboardAwareEdge(safeAreaBottom, keyboardHeight), 0f)
}
