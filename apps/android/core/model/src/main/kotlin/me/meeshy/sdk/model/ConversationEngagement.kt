package me.meeshy.sdk.model

/**
 * Ce que la pastille d'engagement de l'en-tête déplié MONTRE (miroir de `ConversationPointsForm`
 * iOS, #9570/#9571, et de `engagementPillModel` web) : une série court ⇒ « 🔥 4 · 1,2 k » ; aucune
 * série ⇒ le cumul SEUL, sans flamme ; cumul nul ou aucun instantané ⇒ rien. L'instantané reçu est
 * déjà relu au jour du lecteur ([ConversationEngagementSnapshot.forDay]).
 */
sealed interface ConversationPointsForm {
    val totalPoints: Int

    /** 0 pour la forme « cumul seul ». */
    val streakDays: Int

    data class Streak(override val streakDays: Int, override val totalPoints: Int) : ConversationPointsForm

    data class Total(override val totalPoints: Int) : ConversationPointsForm {
        override val streakDays: Int get() = 0
    }

    companion object {
        fun of(snapshot: ConversationEngagementSnapshot?): ConversationPointsForm? = when {
            snapshot == null || snapshot.totalPoints <= 0 -> null
            snapshot.streakDays <= 0 -> Total(snapshot.totalPoints)
            else -> Streak(snapshot.streakDays, snapshot.totalPoints)
        }
    }
}
