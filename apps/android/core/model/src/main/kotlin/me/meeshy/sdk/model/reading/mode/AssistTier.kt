package me.meeshy.sdk.model.reading.mode

/** Le rang de la cascade d'assistance : agent local → agent serveur → pont déterministe (plancher). */
public enum class AssistTier(public val wire: String) {
    LOCAL_AGENT("localAgent"),
    SERVER_AGENT("serverAgent"),
    DETERMINISTIC("deterministic");

    public companion object {
        public fun fromWire(raw: String?): AssistTier? = entries.firstOrNull { it.wire == raw }
    }
}

/** Mode de chiffrement d'une conversation (`packages/shared/types/encryption.ts`) ; `null` hors ces trois valeurs. */
public enum class ReadingEncryptionMode(public val wire: String) {
    E2EE("e2ee"),
    SERVER("server"),
    HYBRID("hybrid");

    public companion object {
        public fun fromWire(raw: String?): ReadingEncryptionMode? = entries.firstOrNull { it.wire == raw }
    }
}

public data class AssistTierInput(
    val deviceCapability: Boolean,
    /** `null` = mode de chiffrement inconnu ou absent. */
    val encryptionMode: ReadingEncryptionMode?,
    val userConsent: Boolean,
    /** Réservé : aucune branche de la cascade ne dépend du type de conversation. */
    val conversationType: ReadingModeConversationType,
)

/** Sonde de capacité d'agent local. Aujourd'hui aucun appareil n'est jamais capable. */
public fun interface AssistCapabilityProbing {
    public fun probe(conversationType: ReadingModeConversationType): Boolean

    public companion object {
        public val NEVER_CAPABLE: AssistCapabilityProbing = AssistCapabilityProbing { false }
    }
}

/**
 * Cascade de confidentialité — miroir de `resolveAssistTier` (`packages/shared/utils/reading-modes.ts`).
 * GARDE NON NÉGOCIABLE : un chiffrement `e2ee` exclut le rang serveur quels que soient la sonde et le
 * consentement ; un appareil incapable en e2ee retombe au rang déterministe, jamais au rang serveur.
 */
public object AssistTierResolver {
    public fun resolve(input: AssistTierInput): AssistTier = when {
        input.deviceCapability -> AssistTier.LOCAL_AGENT
        input.encryptionMode == ReadingEncryptionMode.E2EE -> AssistTier.DETERMINISTIC
        input.userConsent -> AssistTier.SERVER_AGENT
        else -> AssistTier.DETERMINISTIC
    }
}
