package me.meeshy.app.calls

/**
 * Le verre de l'appel est ADAPTATIF (`docs/product/appels-vue-finale.md` loi 3, vues P15 et L5) : sur un contenu
 * clair — un écran partagé reçu — il s'assombrit pour garder le contraste, en-tête et pilule compris. Sur une image de
 * caméra, il garde exactement les valeurs déjà livrées. La planche : `.glass.onlight`, `rgba(18,22,30,.58)`.
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
         * Un écran REÇU tient la scène : en duo, le pair partage ; en groupe, l'écran d'un membre est à la une (la grille
         * ne compte pas, mon propre partage ne passe jamais à la une chez moi, loi 12).
         */
        fun showsReceivedScreen(isGroupStage: Boolean, duoPeerSharing: Boolean, groupScreenAtTheFront: Boolean): Boolean =
            if (isGroupStage) groupScreenAtTheFront else duoPeerSharing
    }
}
