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
            sealedInLedger -> END_TO_END
            !cachedMode.isNullOrBlank() -> ofServed(cachedMode)
            servedClearConfirmed -> CLEAR
            else -> UNKNOWN
        }

        /**
         * Le mode que la passerelle vient de servir : nul servi = claire, jamais inconnu. Seuls les modes que le serveur LIT
         * (`server`, `hybrid`) sont clairs ; un mode que cette version ne connaît pas (un futur protocole) est tenu pour chiffré :
         * un ancien client n'envoie jamais de clair vers lui.
         */
        fun ofServed(servedMode: String?): ConversationClearance {
            val mode = servedMode?.trim()?.lowercase()
            return when {
                mode.isNullOrEmpty() || mode in SERVER_READABLE_MODES -> CLEAR
                else -> END_TO_END
            }
        }

        private val SERVER_READABLE_MODES: Set<String> = setOf("server", "hybrid")
    }
}
