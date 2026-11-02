package me.meeshy.sdk.model.relation

/** Pourquoi le serveur refuserait une demande de cran — miroir de `RelationRequestRefusalCode` (`relation-request.ts`, #13933). */
public enum class RelationRequestRefusal(public val code: String) {
    PHASE_SKIP("RELATION_PHASE_SKIP"),
    COOLDOWN("RELATION_COOLDOWN"),
    NOT_ELIGIBLE("RELATION_NOT_ELIGIBLE"),
}

public sealed interface RelationRequestVerdict {
    public data object Allowed : RelationRequestVerdict
    public data class Refused(val refusal: RelationRequestRefusal) : RelationRequestVerdict
}

/**
 * **LA LOI D'UNE DEMANDE DE CRAN** — miroir de `evaluateRelationRequest` (`packages/shared/utils/relation-request.ts`) et de
 * `RelationRequestRule.swift`, rejoué sur les cas COMMUNS `packages/shared/fixtures/relation-request-cases.json` (#13938).
 *
 * Le miroir ne décide d'AUCUNE demande : le serveur reste l'autorité. Il sert à ne pas PROPOSER celle qu'il refusera. Pur,
 * sans état, sans I/O. Les refus se disent dans l'ordre du serveur : saut de phase, cool-down, éligibilité.
 */
public object RelationRequestRule {

    /** Le seul cran qu'une demande peut viser depuis [level] (RG-03 : jamais de saut) ; `null` au sommet. */
    public fun rungAfter(level: RelationLevel): RelationLevel? = when (level) {
        RelationLevel.PUBLIC, RelationLevel.COMMUNITY -> RelationLevel.ACQUAINTANCE
        RelationLevel.ACQUAINTANCE -> RelationLevel.FRIEND
        RelationLevel.FRIEND -> RelationLevel.CLOSE
        RelationLevel.CLOSE -> RelationLevel.BLOOD
        RelationLevel.BLOOD -> null
    }

    public fun evaluate(
        target: RelationLevel,
        current: RelationLevel,
        eligibleFor: RelationLevel?,
        cooldownUntilMillis: Long?,
        nowMillis: Long,
    ): RelationRequestVerdict {
        if (rungAfter(current) != target) return RelationRequestVerdict.Refused(RelationRequestRefusal.PHASE_SKIP)
        if (cooldownUntilMillis != null && cooldownUntilMillis > nowMillis) {
            return RelationRequestVerdict.Refused(RelationRequestRefusal.COOLDOWN)
        }
        if (requiresSeries(target) && eligibleFor != target) {
            return RelationRequestVerdict.Refused(RelationRequestRefusal.NOT_ELIGIBLE)
        }
        return RelationRequestVerdict.Allowed
    }

    /** Proche et Sang exigent leur série (RG-04) ; Connaissance et Ami n'en ont pas. */
    private fun requiresSeries(target: RelationLevel): Boolean =
        target == RelationLevel.CLOSE || target == RelationLevel.BLOOD
}
