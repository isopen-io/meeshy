package me.meeshy.sdk.model.e2ee

import me.meeshy.sdk.model.EndToEndRegime

/** Les modes qu'une activation propose — les valeurs que la passerelle accepte (`SetEncryptionModeBodySchema`). */
enum class ConversationEncryptionModeChoice(val wire: String, val isOfferedOnThisPhone: Boolean) {
    /**
     * Retenu tant que ce téléphone n'est pas un appareil chiffré (#13015) : l'activer ici
     * couperait l'écriture de l'utilisateur dans sa propre conversation, sans retour (#12949).
     */
    E2EE("e2ee", isOfferedOnThisPhone = false),
    SERVER("server", isOfferedOnThisPhone = true),
    HYBRID("hybrid", isOfferedOnThisPhone = true),
    ;

    companion object {
        val offeredOnThisPhone: List<ConversationEncryptionModeChoice> get() = values().filter { it.isOfferedOnThisPhone }

        /** Le mode d'un régime servi ; `null` pour une ancienne conversation sans mode. */
        fun of(regime: ConversationEncryptionRegime): ConversationEncryptionModeChoice? = when (regime) {
            ConversationEncryptionRegime.NONE -> null
            ConversationEncryptionRegime.SERVER -> SERVER
            ConversationEncryptionRegime.HYBRID -> HYBRID
            ConversationEncryptionRegime.END_TO_END -> E2EE
        }

        /**
         * Les modes vers lesquels un régime AU REPOS passe directement (décision du 2026-11-01) :
         * tous sauf le sien, dans l'ordre de l'écran. Le bout en bout ne passe à rien (#12949).
         */
        fun switchTargets(regime: ConversationEncryptionRegime): List<ConversationEncryptionModeChoice> = when (regime) {
            ConversationEncryptionRegime.END_TO_END -> emptyList()
            else -> values().filter { it != of(regime) }
        }
    }
}

/** La rangée de sécurité de la fiche de conversation (#12880). */
object ConversationSecurityRow {
    /**
     * Un groupe lit son numéro de sécurité seulement une fois chiffré de bout en bout : un groupe
     * `server` n'a aucun numéro à comparer, et le dire « de bout en bout » serait faux.
     */
    fun showsSafetyNumber(isDirect: Boolean, regime: ConversationEncryptionRegime): Boolean =
        !isDirect && regime == ConversationEncryptionRegime.END_TO_END
}

/**
 * Ce que la feuille Chiffrement rend. Le chiffrement au repos ne se désactive plus
 * (`409 ENCRYPTION_AT_REST_PERMANENT`, décision du 2026-11-01) : Serveur et Hybride passent
 * directement à un autre mode, et le bout en bout ne se quitte jamais (#12949).
 */
sealed interface ConversationEncryptionContent {
    data object Loading : ConversationEncryptionContent

    /** @param offersModeChange le rôle autorisé peut faire passer ce régime au repos à un autre mode. */
    data class Active(val offersModeChange: Boolean) : ConversationEncryptionContent
    data object Activation : ConversationEncryptionContent
    data object InactiveReadOnly : ConversationEncryptionContent
}

/** La feuille Chiffrement, résolue : le régime à dire, l'écart servi, le droit, et le contenu. */
data class ConversationEncryptionView(
    val regime: ConversationEncryptionRegime,
    /** Le serveur sert sans bout en bout une conversation que cet appareil a vue chiffrée (#12949). */
    val servedGap: Boolean,
    val mayToggle: Boolean,
    val content: ConversationEncryptionContent,
    val pairEndToEndConversationId: String?,
) {
    companion object {
        /**
         * @param sealed cet appareil a déjà vu la conversation chiffrée de bout en bout : le bout en
         *   bout vu l'emporte sur un régime servi qui ne le dit plus (une passerelle compromise ne
         *   rouvre pas le clair).
         * @param fallbackMayToggle le droit tant que la passerelle n'a pas servi le sien ; fermé par défaut.
         */
        fun resolve(
            status: ConversationEncryptionStatus?,
            sealed: Boolean,
            isDirect: Boolean,
            loading: Boolean,
            fallbackMayToggle: Boolean = false,
        ): ConversationEncryptionView {
            val displayedMode = when {
                sealed || status?.isEndToEnd == true -> EndToEndRegime.MODE
                status?.isEncrypted == true -> status.mode
                else -> null
            }
            val regime = ConversationEncryptionRegime.of(displayedMode)
            val mayToggle = isDirect && !sealed && (status?.canToggleEncryption ?: fallbackMayToggle)
            val isEncrypted = displayedMode != null
            val content = when {
                loading -> ConversationEncryptionContent.Loading
                isEncrypted -> ConversationEncryptionContent.Active(
                    offersModeChange = mayToggle && regime != ConversationEncryptionRegime.END_TO_END,
                )
                mayToggle -> ConversationEncryptionContent.Activation
                else -> ConversationEncryptionContent.InactiveReadOnly
            }
            return ConversationEncryptionView(
                regime = regime,
                servedGap = sealed && status != null && !status.isEndToEnd,
                mayToggle = mayToggle,
                content = content,
                pairEndToEndConversationId = status?.pairEndToEndConversationId
                    ?.takeIf { it.isNotEmpty() && regime != ConversationEncryptionRegime.END_TO_END },
            )
        }
    }
}
