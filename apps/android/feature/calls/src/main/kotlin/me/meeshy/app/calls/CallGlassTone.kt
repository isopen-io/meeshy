package me.meeshy.app.calls

import me.meeshy.sdk.model.call.group.GroupCallSpotlight
import me.meeshy.sdk.model.call.group.GroupCallStageFocus

/**
 * Le verre de l'appel est ADAPTATIF (`docs/product/appels-vue-finale.md` loi 3, vues P15 et L5) : sur un contenu
 * clair — un écran partagé reçu — il s'assombrit pour garder le contraste, en-tête et pilule compris. Sur une image de
 * caméra, il garde exactement les valeurs déjà livrées. La planche : `.glass.onlight`, `rgba(18,22,30,.58)`, dont l'encre est
 * le jeton [CallPalette.OnLightGlass].
 *
 * [veilAlpha] voile le bloc de la pilule, [neutralFillAlpha] remplit un bouton inactif, [chipScrimAlpha] la puce durée.
 */
internal enum class CallGlassTone(val veilAlpha: Float, val neutralFillAlpha: Float, val chipScrimAlpha: Float, val isDarkFill: Boolean) {
    OverPicture(veilAlpha = 0.2f, neutralFillAlpha = 0.16f, chipScrimAlpha = 0.35f, isDarkFill = false),
    OverLightContent(veilAlpha = 0.58f, neutralFillAlpha = 0.58f, chipScrimAlpha = 0.58f, isDarkFill = true),
    ;

    companion object {
        fun of(showsReceivedScreen: Boolean): CallGlassTone = if (showsReceivedScreen) OverLightContent else OverPicture

        /**
         * Un écran REÇU tient la scène. En duo : le pair partage, et mon image n'a pas pris le plein écran par une
         * permutation (sur ma caméra, le verre ne bouge pas). En groupe : l'écran d'un membre est à la une ; la grille
         * ne compte pas, et mon propre partage à la une non plus (loi 12).
         */
        fun showsReceivedScreen(
            isGroupStage: Boolean,
            duoPeerSharing: Boolean,
            duoMyImageFullScreen: Boolean,
            groupFocus: GroupCallStageFocus,
        ): Boolean = if (isGroupStage) receivedScreenAtTheFront(groupFocus) else duoPeerSharing && !duoMyImageFullScreen

        private fun receivedScreenAtTheFront(focus: GroupCallStageFocus): Boolean =
            focus is GroupCallStageFocus.Spotlight && focus.isScreenShare && !GroupCallSpotlight.featuresLocal(focus)
    }

    /**
     * Le ton des boutons posés DANS un bloc de verre déjà voilé par ce ton (la pilule) : le voile du bloc porte le
     * sombre, ses boutons gardent le disque clair — une pilule uniforme (P15), jamais un disque sombre sur un voile sombre.
     */
    val withinVeiledBlock: CallGlassTone
        get() = OverPicture
}
