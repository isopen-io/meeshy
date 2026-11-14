import Foundation

// MARK: - L'anneau des actes du jour (#17768)
//
// MIROIR de `gameActsRing` (`packages/shared/utils/game/acts-ring.ts`), rejoué sur les mêmes cas.
//
// Autour du bouton du menu, un segment s'allume par acte du rêve du jour réalisé. Le client ne recalcule AUCUNE
// règle : le jour du joueur, ses actes et leur réalisation sont décidés par la passerelle et servis dans le bloc
// `game` (`missions.unlocked`, `missions.items[].completedAt`). La loi LIT ce bloc — le cache d'abord — et dit combien
// d'actes sont faits sur ceux du jour.
//
// `nil` ⇒ aucun anneau : « Jeu masqué », aucun bloc (cache vide, ancien serveur), actes pas encore ouverts (avant le
// niveau 5) ou jour servi sans acte. Aucune notification n'en découle (#17368).

public struct GameActsRing: Equatable, Sendable {
    public let done: Int
    public let total: Int

    public init(done: Int, total: Int) {
        self.done = done
        self.total = total
    }

    /// La loi, sur la seule part du bloc qu'elle lit.
    public static func of(missions: GameBlock.Missions, hidden: Bool) -> GameActsRing? {
        guard !hidden, missions.unlocked, !missions.items.isEmpty else { return nil }
        return GameActsRing(done: missions.items.filter(\.isCompleted).count, total: missions.items.count)
    }

    public static func of(_ game: GameBlock?, hidden: Bool) -> GameActsRing? {
        guard let game else { return nil }
        return of(missions: game.missions, hidden: hidden)
    }

    /// Tous les actes du jour sont réalisés.
    public var isComplete: Bool { done >= total }
}
