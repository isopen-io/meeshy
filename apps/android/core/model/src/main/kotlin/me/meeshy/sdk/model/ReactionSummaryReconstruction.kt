package me.meeshy.sdk.model

/**
 * Les réactions d'un message reconstruites depuis la charge AGRÉGÉE de la passerelle
 * (`reactionSummary` émoji → compte, `currentUserReactions`) — miroir de
 * `MeeshyReaction.reconstructFromSummary` (iOS).
 *
 * Un compte négatif ou nul ne produit rien ; un compte démesuré est borné.
 */
public data class ReconstructedReaction(val emoji: String, val count: Int, val includesMe: Boolean)

public object ReactionSummaryReconstruction {

    public const val MAX_COUNT: Int = 10_000

    public fun reconstruct(
        reactionSummary: Map<String, Int>?,
        currentUserReactions: Collection<String>?,
    ): List<ReconstructedReaction> {
        val mine = currentUserReactions.orEmpty().toSet()
        return reactionSummary.orEmpty().mapNotNull { (emoji, count) ->
            val bounded = count.coerceIn(0, MAX_COUNT)
            if (bounded == 0) null else ReconstructedReaction(emoji, bounded, emoji in mine)
        }
    }
}
