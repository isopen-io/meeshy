package me.meeshy.sdk.model.reading

/** Le rang de la cascade d'assistance : agent local → agent serveur → pont déterministe (plancher). */
enum class AssistTier(val wire: String) {
    LOCAL_AGENT("localAgent"),
    SERVER_AGENT("serverAgent"),
    DETERMINISTIC("deterministic"),
    ;

    companion object {
        fun fromWire(value: String?): AssistTier? = entries.firstOrNull { it.wire == value }
    }
}

data class AssistTierInput(
    val deviceCapability: Boolean,
    /** `null` = mode de chiffrement inconnu ou absent. */
    val encryptionMode: ReadingEncryptionMode?,
    val userConsent: Boolean,
    /** Réservé : aucune branche de la cascade ne dépend du type de conversation. */
    val conversationType: ReadingConversationType,
)

/** Sonde de capacité d'agent local. Aujourd'hui aucun appareil n'est jamais capable. */
fun interface AssistCapabilityProbing {
    fun probe(conversationType: ReadingConversationType): Boolean

    companion object {
        val NEVER_CAPABLE: AssistCapabilityProbing = AssistCapabilityProbing { false }
    }
}

object AssistTierResolver {
    /**
     * Cascade de confidentialité — miroir de `resolveAssistTier`. GARDE NON NÉGOCIABLE : un chiffrement
     * `e2ee` exclut le rang serveur quels que soient la sonde et le consentement ; un appareil incapable
     * en e2ee retombe au rang déterministe, jamais au rang serveur.
     */
    fun resolve(input: AssistTierInput): AssistTier = when {
        input.deviceCapability -> AssistTier.LOCAL_AGENT
        input.encryptionMode == ReadingEncryptionMode.E2EE -> AssistTier.DETERMINISTIC
        input.userConsent -> AssistTier.SERVER_AGENT
        else -> AssistTier.DETERMINISTIC
    }
}
