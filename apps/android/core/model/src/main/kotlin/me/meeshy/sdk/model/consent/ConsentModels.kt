package me.meeshy.sdk.model.consent

import kotlinx.serialization.Serializable

/**
 * Les cinq finalités d'un consentement — miroir de `CONSENT_PURPOSES` / `CONSENT_PARENT`
 * (`packages/shared/types/consents.ts`) et de `ConsentPurpose` (iOS `ConsentModels.swift`).
 * La hiérarchie est un ARBRE : `analytics` et `voice-data` sont frères sous `data-processing`.
 */
public enum class ConsentPurpose(public val wire: String, public val parent: ConsentPurpose?) {
    DATA_PROCESSING("data-processing", null),
    ANALYTICS("analytics", DATA_PROCESSING),
    VOICE_DATA("voice-data", DATA_PROCESSING),
    VOICE_PROFILE("voice-profile", VOICE_DATA),
    VOICE_CLONING("voice-cloning", VOICE_PROFILE),
    ;

    /** Les ancêtres, racine d'abord — jamais la finalité elle-même. */
    public val ancestors: List<ConsentPurpose>
        get() = parent?.let { it.ancestors + it }.orEmpty()

    /** La finalité suivie de ses ancêtres : ce qu'un octroi réussi rend accordé. */
    public val lineage: List<ConsentPurpose>
        get() = listOf(this) + (parent?.lineage.orEmpty())

    /** Tous les descendants (enfants, petits-enfants…), les plus profonds d'abord. */
    public val descendants: List<ConsentPurpose>
        get() = entries.filter { it.parent == this }.flatMap { it.descendants + it }

    /** Profondeur dans l'arbre : 0 pour la racine (sert à l'indentation). */
    public val depth: Int get() = ancestors.size

    public companion object {
        public fun fromWire(value: String?): ConsentPurpose? = entries.firstOrNull { it.wire == value }
    }
}

public object ConsentPolicy {
    /** Miroir de `CONSENT_POLICY_VERSION_DEFAULT` ; la passerelle répond 409 à toute autre valeur. */
    public const val DEFAULT_VERSION: String = "2026-08-30"
}

/**
 * Une entrée servie par `GET /me/consents` ou rendue par `PUT /me/consents/{purpose}`. [purpose]
 * reste une chaîne : une finalité ajoutée par une passerelle plus récente ne casse pas le
 * décodage des autres (elle est ignorée par [ConsentSnapshot.from]).
 */
@Serializable
public data class ConsentEntry(
    val purpose: String = "",
    val granted: Boolean = false,
    val grantedAt: String? = null,
    val policyVersion: String? = null,
) {
    val consentPurpose: ConsentPurpose? get() = ConsentPurpose.fromWire(purpose)
}

/** Le corps de `GET /me/consents` ; les blocs voisins (`gameConsents`, `derived`) sont ignorés. */
@Serializable
public data class ConsentsPayload(val consents: List<ConsentEntry> = emptyList())

/** Le corps entier de `PUT /me/consents/{purpose}` — le serveur horodate seul. */
@Serializable
public data class ConsentUpdateRequest(val granted: Boolean, val policyVersion: String)

/** Ce que le client sait des consentements : les finalités accordées et la politique en vigueur. */
public data class ConsentSnapshot(
    val granted: Set<ConsentPurpose> = emptySet(),
    val policyVersion: String = ConsentPolicy.DEFAULT_VERSION,
) {
    public fun isGranted(purpose: ConsentPurpose): Boolean = purpose in granted

    /**
     * Fail-closed : un traitement n'est permis que si la finalité ET tous ses ancêtres sont
     * accordés (la passerelle exige la même chaîne — `ConsentValidationService`).
     */
    public fun allows(purpose: ConsentPurpose): Boolean = purpose.lineage.all { it in granted }

    public companion object {
        /** Les entrées inconnues sont écartées sans erreur ; la version vient de la première entrée servie. */
        public fun from(entries: List<ConsentEntry>): ConsentSnapshot = ConsentSnapshot(
            granted = entries.filter { it.granted }.mapNotNull { it.consentPurpose }.toSet(),
            policyVersion = entries.firstNotNullOfOrNull { it.policyVersion?.takeIf(String::isNotBlank) }
                ?: ConsentPolicy.DEFAULT_VERSION,
        )
    }
}
