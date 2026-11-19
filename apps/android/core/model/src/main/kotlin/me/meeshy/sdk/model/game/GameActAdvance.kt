package me.meeshy.sdk.model.game

/**
 * L'ACTE QUI AVANCE (#17367, tranche Android #19717) — MIROIR de `actAdvance`
 * (`packages/shared/utils/game/act-advance.ts`) et de `GameActAdvance` (SDK Swift), rejoué sur les mêmes cas.
 *
 * Après un envoi qui fait avancer un acte du Rêve, une pastille discrète dit « Acte II · 3 sur 5 » dans la
 * conversation, puis s'efface. Le client ne recalcule AUCUNE règle : la progression de chaque acte est décidée par la
 * passerelle et servie dans le bloc `game` (`missions.items[].progress`, `target`). La loi compare deux lectures
 * successives du bloc et dit quel acte vient d'avancer. Seul un MÊME acte (même `id`) d'une MÊME journée (`dayKey`) se
 * compare : un nouveau jour ou un acte relancé n'est pas une avancée. Deux actes avancés ensemble : le premier dans
 * l'ordre du jour parle.
 *
 * `null` ⇒ aucune pastille : « Jeu masqué », lecture absente (cache vide, ancien serveur), actes pas encore ouverts,
 * aucune progression montée. Aucune notification n'en découle (#17368).
 */
public data class GameActAdvance(val difficulty: MissionDifficulty, val progress: Int, val target: Int) {
    public companion object {
        public fun between(before: GameMissions?, after: GameMissions?, hidden: Boolean): GameActAdvance? {
            if (hidden || before == null || after == null) return null
            if (!after.unlocked || before.dayKey != after.dayKey) return null
            val previous = before.items.associate { it.id to it.progress }
            val moved = after.items.firstOrNull { item -> previous[item.id]?.let { item.progress > it } == true }
                ?: return null
            return GameActAdvance(moved.difficulty, minOf(moved.progress, moved.target), moved.target)
        }
    }
}

/**
 * Le GUET de l'acte qui avance, miroir de `watchActAdvance` (web) et de `ConversationActAdvanceWatch` (iOS) : l'envoi
 * l'ARME [ARMED_MILLIS] ; pendant ce temps, chaque nouvelle lecture du bloc se compare à la précédente par
 * [GameActAdvance.between]. Hors du guet une lecture devient seulement l'« avant » de la suivante. Valeur immuable :
 * chaque fait rend le guet suivant.
 */
public data class GameActAdvanceWatch(
    val last: GameMissions? = null,
    val armedUntilMillis: Long? = null,
) {
    public fun isArmed(nowMillis: Long): Boolean = armedUntilMillis?.let { nowMillis < it } == true

    /** Un message est parti : le guet s'arme, et le bloc en cache sert d'« avant » ; un cache vide garde le dernier. */
    public fun armed(nowMillis: Long, cached: GameMissions?, hidden: Boolean): GameActAdvanceWatch =
        if (hidden) this else GameActAdvanceWatch(last = cached ?: last, armedUntilMillis = nowMillis + ARMED_MILLIS)

    /** Une nouvelle lecture du bloc : elle devient l'« avant » de la suivante, et parle si le guet est armé. */
    public fun received(nowMillis: Long, missions: GameMissions?, hidden: Boolean): Reading {
        if (missions == null) return Reading(this, null)
        val next = copy(last = missions)
        val advance = if (isArmed(nowMillis)) GameActAdvance.between(last, missions, hidden) else null
        return Reading(next, advance)
    }

    public data class Reading(val watch: GameActAdvanceWatch, val advance: GameActAdvance?)

    public companion object {
        /** Le temps, après un envoi, pendant lequel une avancée d'acte lui est attribuée. */
        public const val ARMED_MILLIS: Long = 15_000

        /** Le temps pendant lequel la pastille reste lisible avant de s'effacer. */
        public const val SHOWN_MILLIS: Long = 2_600
    }
}
