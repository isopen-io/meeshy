package me.meeshy.sdk.model

/**
 * #13628 — ce que l'appareil SAIT du mode d'une conversation avant de lui envoyer du CLAIR. Un mode nul est ambigu : servi nul
 * par la passerelle (conversation claire historique) ou nul faute de lecture (ligne en cache périmé, servie hors ligne). Seule
 * la première lecture autorise le clair ; la seconde est [UNKNOWN] et ne s'envoie jamais.
 */
enum class ConversationClearance {
    /** Mode connu et sans bout en bout : le clair peut partir. */
    CLEAR,

    /** Chiffrée de bout en bout (registre ou mode lu) : aucun clair, jamais. */
    END_TO_END,

    /** Mode jamais servi à cet appareil : il faut le relire avant tout envoi. */
    UNKNOWN,
    ;

    companion object {
        /**
         * [cachedMode] est le mode de la ligne en cache (nul si la ligne manque ou ne porte rien) ; [servedClearConfirmed] dit
         * que la passerelle a SERVI cette conversation sans bout en bout (registre des conversations confirmées claires).
         */
        fun of(sealedInLedger: Boolean, cachedMode: String?, servedClearConfirmed: Boolean): ConversationClearance = when {
            sealedInLedger || EndToEndRegime.isEndToEnd(cachedMode) -> END_TO_END
            !cachedMode.isNullOrBlank() || servedClearConfirmed -> CLEAR
            else -> UNKNOWN
        }

        /** Le mode que la passerelle vient de servir : nul servi = claire, jamais inconnu. */
        fun ofServed(servedMode: String?): ConversationClearance =
            if (EndToEndRegime.isEndToEnd(servedMode)) END_TO_END else CLEAR
    }
}
