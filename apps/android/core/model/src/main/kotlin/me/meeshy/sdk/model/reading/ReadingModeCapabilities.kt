package me.meeshy.sdk.model.reading

/** Seuil de participants actifs à partir duquel la Rivière s'ouvre au catalogue. */
const val RIVER_ELIGIBILITY_THRESHOLD: Int = 5

/**
 * POURQUOI la Rivière est fermée (ou ouverte) — miroir de `RiverEligibilityReasonKind`.
 * [wire] est le discriminant des vecteurs partagés.
 */
enum class RiverEligibilityReasonKind(val wire: String) {
    /** Conversation `direct` : aucun compte ne l'ouvrira. */
    NEVER_ELIGIBLE("neverEligible"),

    /** Type éligible, seuil non atteint — ou compte INCONNU ([RiverEligibilityReason.current] `null`). */
    BELOW_THRESHOLD("belowThreshold"),

    /** Le seuil est franchi ; la porte est ouverte par la loi. */
    ELIGIBLE("eligible"),
    ;

    companion object {
        fun fromWire(value: String?): RiverEligibilityReasonKind? = entries.firstOrNull { it.wire == value }
    }
}

/**
 * La raison de la Rivière grisée, en DONNÉES : le libellé (« jamais en conversation directe »,
 * « s'ouvrira à N personnes actives », « … — M aujourd'hui ») se compose côté écran à partir de ces
 * trois champs, jamais d'une chaîne figée ici.
 *
 * [current] `null` = compte de participants actifs INCONNU, pas « zéro » : le libellé se tait sur
 * le nombre plutôt que d'en fabriquer un.
 */
data class RiverEligibilityReason(
    val threshold: Int,
    val current: Int?,
    val riverReason: RiverEligibilityReasonKind,
)

/**
 * L'UNIQUE point de branchement invité/inscrit des lois de lecture. Toute autre lecture
 * d'« est anonyme » dans ces lois est un défaut de contrat.
 */
data class ReadingModeIdentity(val isAnonymous: Boolean)

data class ReadingModeCapabilities(
    val availableModes: List<ConversationReadingMode>,
    val riverEligible: Boolean,
    val riverEligibilityReason: RiverEligibilityReason,
)

data class ResolveCapabilitiesInput(
    val identity: ReadingModeIdentity,
    val isFlagEnabled: Boolean,
    /** Drapeau PROPRE à la Rivière (`riviere_mode`), distinct de [isFlagEnabled]. Absent = éteint. */
    val isRiverFlagEnabled: Boolean = false,
    val conversationType: ReadingConversationType,
    /** `null` = INCONNU : un compte inconnu ne rend jamais éligible (faux négatif toléré, jamais de faux positif). */
    val activeParticipantCount: Int?,
)

/**
 * Capacités de mode de lecture d'une conversation — miroir de `resolveCapabilities`
 * (`packages/shared/utils/reading-modes.ts`, qui fait foi).
 *
 * Drapeau éteint : `[bubbles]` et rien d'autre. Drapeau allumé : `[focal, script, summary]`
 * (un invité n'a pas `summary`, dont les endpoints exigent une authentification) puis `river` si
 * son drapeau est allumé ET la conversation éligible (≥ 5 actifs, jamais `direct`) — invités
 * éligibles compris. La raison de la Rivière est servie dans TOUS les cas.
 */
object ReadingModeCapabilitiesResolver {

    private val REGISTERED = listOf(
        ConversationReadingMode.FOCAL,
        ConversationReadingMode.SCRIPT,
        ConversationReadingMode.SUMMARY,
    )
    private val ANONYMOUS = listOf(ConversationReadingMode.FOCAL, ConversationReadingMode.SCRIPT)
    private val FLAG_DISABLED = listOf(ConversationReadingMode.BUBBLES)

    fun resolve(input: ResolveCapabilitiesInput): ReadingModeCapabilities {
        val count = input.activeParticipantCount
        val neverEligible = input.conversationType == ReadingConversationType.DIRECT
        val riverEligible = !neverEligible && count != null && count >= RIVER_ELIGIBILITY_THRESHOLD

        val kind = when {
            neverEligible -> RiverEligibilityReasonKind.NEVER_ELIGIBLE
            riverEligible -> RiverEligibilityReasonKind.ELIGIBLE
            else -> RiverEligibilityReasonKind.BELOW_THRESHOLD
        }
        val reason = RiverEligibilityReason(RIVER_ELIGIBILITY_THRESHOLD, count, kind)

        if (!input.isFlagEnabled) return ReadingModeCapabilities(FLAG_DISABLED, riverEligible, reason)

        val base = if (input.identity.isAnonymous) ANONYMOUS else REGISTERED
        val riverSelectable = input.isRiverFlagEnabled && riverEligible
        return ReadingModeCapabilities(
            availableModes = if (riverSelectable) base + ConversationReadingMode.RIVER else base,
            riverEligible = riverEligible,
            riverEligibilityReason = reason,
        )
    }
}
