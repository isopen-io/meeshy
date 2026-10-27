package me.meeshy.sdk.model.game

import kotlin.math.max

/** Une ligne du coffre ouvert : ce qui sort, dans l'ordre où l'écran le dit. */
public sealed interface ChestLine {
    /** Ce qui revient à l'effort : le total crédité MOINS la prime, qui a sa ligne. */
    public data class Points(val amount: Int) : ChestLine
    public data class Glory(val amount: Int) : ChestLine
    public data class Bonus(val kind: ChestBonus, val points: Int) : ChestLine
    public data object Fragment : ChestLine
    public data object Freeze : ChestLine
}

/**
 * Les lignes d'un coffre OUVERT (iOS `GameChestLines.of`) — lues sur la récompense que la passerelle a rendue, jamais
 * calculées : `points` est le total crédité, prime comprise. Un coffre ouvert avant #10011 n'a ni Gloire ni prime.
 */
public object GameChestLines {
    public fun of(reward: DailyChest): List<ChestLine> = buildList {
        add(ChestLine.Points(max(0, reward.points - reward.bonusPoints)))
        if (reward.glory > 0) add(ChestLine.Glory(reward.glory))
        val bonus = reward.bonus
        if (reward.bonusPoints > 0 && bonus != null && bonus != ChestBonus.NoBonus) add(ChestLine.Bonus(bonus, reward.bonusPoints))
        if (reward.fragment) add(ChestLine.Fragment)
        if (reward.freeze) add(ChestLine.Freeze)
    }
}

/** Les quatre états de l'Offrande à l'écran. */
public enum class ChestPhase {
    Locked,
    Ready,

    /** Ouverte, mais la passerelle n'a pas encore rendu ce qu'elle contient : le contenu n'est jamais deviné. */
    Opening,
    Claimed,
    ;

    public companion object {
        /** Miroir de `GameChestCard.phase` (iOS) : le geste en vol et l'Offrande ouverte se lisent par leur contenu. */
        public fun of(status: ChestStatus, opening: Boolean, hasReward: Boolean): ChestPhase = when {
            opening || status == ChestStatus.Claimed -> if (hasReward) Claimed else Opening
            status == ChestStatus.Ready -> Ready
            else -> Locked
        }
    }
}
