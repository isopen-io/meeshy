package me.meeshy.sdk.model.game

/**
 * **L'anneau des actes du jour** (#17768) — autour du bouton du menu, un segment s'allume par acte du rêve du jour
 * réalisé.
 *
 * Miroir de `gameActsRing` (`packages/shared/utils/game/acts-ring.ts`) et de `GameActsRing` iOS
 * (`packages/MeeshySDK/.../Game/GameActsRing.swift`), rejoué sur les mêmes cas. Le client ne recalcule AUCUNE règle :
 * le jour du joueur, ses actes et leur réalisation sont décidés par la passerelle et servis dans le bloc `game`
 * (`missions.unlocked`, `missions.items[].completedAt`). La loi LIT ce bloc — le cache d'abord.
 *
 * `null` ⇒ aucun anneau : « Jeu masqué », aucun bloc (cache vide, ancien serveur), actes pas encore ouverts (avant le
 * niveau 5) ou jour servi sans acte. Aucune notification n'en découle (#17368).
 */
public data class GameActsRing(val done: Int, val total: Int) {

    /** Tous les actes du jour sont réalisés. */
    val isComplete: Boolean get() = done >= total

    public companion object {
        /** La loi, sur la seule part du bloc qu'elle lit. */
        public fun of(missions: GameMissions, hidden: Boolean): GameActsRing? {
            if (hidden || !missions.unlocked || missions.items.isEmpty()) return null
            return GameActsRing(done = missions.items.count { it.isCompleted }, total = missions.items.size)
        }

        public fun of(game: GameBlock?, hidden: Boolean): GameActsRing? = game?.let { of(it.missions, hidden) }
    }
}

/**
 * Où commence et où finit chaque segment de l'anneau, en fractions du tour, à partir du haut et dans le sens des
 * aiguilles — miroir de `MenuActsRingGeometry` (MeeshyUI) et de `MenuActsRing` (web).
 */
public object MenuActsRingGeometry {
    /** Le jour entre deux segments, en fraction du tour (14 unités sur 300, comme le web et iOS). */
    public const val GAP: Double = 14.0 / 300.0

    /** L'anneau déborde le disque de quelques points, sans le toucher. */
    public const val OVERHANG_DP: Float = 5f

    public const val LINE_WIDTH_DP: Float = 3.5f

    public data class Segment(val from: Double, val to: Double, val isDone: Boolean)

    public fun segments(ring: GameActsRing): List<Segment> {
        if (ring.total <= 0) return emptyList()
        val part = 1.0 / ring.total
        return (0 until ring.total).map { index ->
            Segment(from = index * part + GAP / 2, to = (index + 1) * part - GAP / 2, isDone = index < ring.done)
        }
    }
}
