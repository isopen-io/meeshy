package me.meeshy.sdk.model

/**
 * Quelles pièces d'une visionneuse le bouclier de capture protège — une valeur opaque
 * que l'hôte pose et que les pages lisent. Miroir de `CaptureShieldScope` (iOS).
 * `allExcept` est fermé par défaut : une pièce absente de la liste, ou sans
 * identifiant, est protégée.
 */
class CaptureShieldScope private constructor(
    private val rule: Rule,
    private val freeContentIds: Set<String>,
) {

    private enum class Rule { NONE, ALL, ALL_EXCEPT }

    fun shields(contentId: String?): Boolean = when (rule) {
        Rule.NONE -> false
        Rule.ALL -> true
        Rule.ALL_EXCEPT -> contentId?.let { it !in freeContentIds } ?: true
    }

    override fun equals(other: Any?): Boolean =
        other is CaptureShieldScope && other.rule == rule && other.freeContentIds == freeContentIds

    override fun hashCode(): Int = 31 * rule.hashCode() + freeContentIds.hashCode()

    companion object {
        val None: CaptureShieldScope = CaptureShieldScope(Rule.NONE, emptySet())
        val All: CaptureShieldScope = CaptureShieldScope(Rule.ALL, emptySet())

        /** Toutes les pièces sont protégées, sauf celles-ci. */
        fun allExcept(freeContentIds: Set<String>): CaptureShieldScope =
            CaptureShieldScope(Rule.ALL_EXCEPT, freeContentIds)
    }
}
