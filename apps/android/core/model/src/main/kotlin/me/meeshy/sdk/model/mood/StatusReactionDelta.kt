package me.meeshy.sdk.model.mood

/**
 * Le delta PRUDENT d'un résumé de réactions d'humeur (`status:reacted` / `status:unreacted`) : ses propres réactions
 * sont ignorées (déjà posées en optimiste), un compteur ne devient jamais négatif et un emoji épuisé quitte le résumé.
 */
object StatusReactionDelta {
    /** L'écho de sa propre réaction n'est pas rejoué ; sans identité connue, tout événement est étranger. */
    fun isOwn(actorId: String?, selfId: String?): Boolean = actorId != null && actorId == selfId

    fun apply(summary: Map<String, Int>?, emoji: String, delta: Int, actorId: String?, selfId: String?): Map<String, Int>? {
        if (isOwn(actorId, selfId) || delta == 0) return summary
        val current = summary?.get(emoji) ?: 0
        val next = (current + delta).coerceAtLeast(0)
        if (summary == null) return if (next == 0) null else mapOf(emoji to next)
        return if (next == 0) summary - emoji else summary + (emoji to next)
    }
}
