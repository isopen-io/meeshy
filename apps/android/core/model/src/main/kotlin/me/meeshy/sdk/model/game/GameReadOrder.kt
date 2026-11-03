package me.meeshy.sdk.model.game

import kotlin.math.max

/**
 * L'ORDRE DES LECTURES SERVIES (#10898) : la machine d'état du jeu reste MONOTONE. Une lecture qui a quitté le client
 * AVANT une autre, ou avant le dernier geste, a lu un état plus ancien que celui que l'écran montre déjà ; elle ne le
 * repeint jamais. La relecture que le geste lance lui-même, partie après lui, rend la vérité. Miroir de
 * `GameReadOrder` (iOS) et de `shouldApplyGameState` (`packages/shared/types/game-sync-order.ts`).
 */
public class GameReadOrder {
    /** Le ticket d'une lecture, pris à son DÉPART. */
    public class Ticket internal constructor(internal val number: Int, internal val era: Int) {
        override fun equals(other: Any?): Boolean = other is Ticket && other.number == number && other.era == era
        override fun hashCode(): Int = 31 * number + era
    }

    private var issued = 0
    private var era = 0
    private var latestPosed = 0

    public fun issue(): Ticket {
        issued += 1
        return Ticket(issued, era)
    }

    /** Un geste commence : toute lecture partie avant lui a lu l'état d'avant. */
    public fun beginGesture() {
        era += 1
    }

    /**
     * Vrai si la lecture peut se poser — et la retient alors comme la plus récente posée. Une même lecture peut se
     * poser deux fois (le cache, puis le réseau, sous le même ticket).
     */
    public fun admits(ticket: Ticket): Boolean {
        if (ticket.era != era || ticket.number < latestPosed) return false
        latestPosed = ticket.number
        return true
    }

    /**
     * Ce que la passerelle a CONFIRMÉ : la plus haute révision de l'état du jeu et le plus grand nombre de Meeshes
     * frappées. Ni l'un ni l'autre ne redescend.
     */
    public data class Confirmed(val revision: Long? = null, val minted: Int = 0) {
        public fun raised(revision: Long?, minted: Int?): Confirmed = Confirmed(
            revision = listOfNotNull(this.revision, revision).maxOrNull(),
            minted = max(this.minted, minted ?: 0),
        )
    }

    public companion object {
        /**
         * Une charge servie est à jour si elle n'est pas EN RETARD sur ce qui a été confirmé : sa révision, quand la
         * passerelle la sert ; sinon ses Meeshes frappées. Un serveur qui ne sert ni l'une ni les autres n'est jamais
         * déclaré en retard.
         */
        public fun isCurrent(servedRevision: Long?, servedMinted: Int?, confirmed: Confirmed): Boolean {
            val known = confirmed.revision
            if (servedRevision != null && known != null && servedRevision < known) return false
            if (servedMinted == null) return true
            return servedMinted >= confirmed.minted
        }
    }
}
