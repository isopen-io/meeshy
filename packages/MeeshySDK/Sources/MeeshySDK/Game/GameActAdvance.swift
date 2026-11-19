import Foundation

// MARK: - L'acte qui avance (#17367, tranche iOS #19716)
//
// MIROIR de `actAdvance` (`packages/shared/utils/game/act-advance.ts`), rejoué sur les mêmes cas.
//
// Après un envoi qui fait avancer un acte du Rêve, une pastille discrète dit « Acte II · 3 sur 5 » dans la
// conversation, puis s'efface. Le client ne recalcule AUCUNE règle : la progression de chaque acte est décidée par la
// passerelle et servie dans le bloc `game` (`missions.items[].progress`, `target`). La loi compare deux lectures
// successives du bloc et dit quel acte vient d'avancer. Seul un MÊME acte (même `id`) d'une MÊME journée (`dayKey`) se
// compare : un nouveau jour ou un acte relancé n'est pas une avancée. Deux actes avancés ensemble : le premier dans
// l'ordre du jour parle.
//
// `nil` ⇒ aucune pastille : « Jeu masqué », lecture absente (cache vide, ancien serveur), actes pas encore ouverts,
// aucune progression montée. Aucune notification n'en découle (#17368).

public struct GameActAdvance: Equatable, Sendable {
    public let difficulty: MissionDifficulty
    public let progress: Int
    public let target: Int

    public init(difficulty: MissionDifficulty, progress: Int, target: Int) {
        self.difficulty = difficulty
        self.progress = progress
        self.target = target
    }

    /// La loi, sur la seule part du bloc qu'elle lit.
    public static func between(_ before: GameBlock.Missions?, _ after: GameBlock.Missions?, hidden: Bool) -> GameActAdvance? {
        guard !hidden, let before, let after else { return nil }
        guard after.unlocked, before.dayKey == after.dayKey else { return nil }
        let previous = Dictionary(before.items.map { ($0.id, $0.progress) }, uniquingKeysWith: { first, _ in first })
        let moved = after.items.first { item in
            guard let was = previous[item.id] else { return false }
            return item.progress > was
        }
        guard let moved else { return nil }
        return GameActAdvance(difficulty: moved.difficulty, progress: min(moved.progress, moved.target), target: moved.target)
    }
}
