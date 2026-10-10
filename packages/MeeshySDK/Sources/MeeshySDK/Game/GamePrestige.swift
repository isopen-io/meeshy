import Foundation

// MARK: - Le Prestige (#9389)
//
// MIROIR de `packages/shared/utils/game/prestige.ts` — la vie après le niveau 100.
// Au niveau 100, on peut passer en Prestige : le niveau retombe à 1 (le score en
// poche repart de zéro), une étoile se pose sur l'anneau (cinq au plus), le
// joueur gagne `GameGlory.points.prestige` de Gloire et un trophée de Prestige numéroté.
//
// **Ce que le passage ne touche PAS** : le trésor (les Meeshes gardées), la
// Gloire acquise et le rang, les badges, la Flamme.
//
// Le niveau RECORD retombe à 1 avec le niveau : sinon le Vent arrière (+25 %
// « jusqu'à revenir au niveau record ») resterait actif sur les cent niveaux de
// la nouvelle boucle. Conséquence à DIRE à l'utilisateur : la ligue (niveau 10)
// et le duo (niveau 20) se lisent sur le record — la confirmation l'annonce.

public enum PrestigeRefusal: String, Sendable, Hashable {
    case levelTooLow = "level-too-low"
    case atMaximum = "at-maximum"
}

public struct PrestigePassage: Sendable, Equatable {
    public let prestigeAfter: Int
    public let scoreAfter = 0
    public let levelAfter = 1
    public let levelRecordAfter = 1
    public let gloryGained: Int
    public let trophyKey: String

    public init(prestigeAfter: Int, gloryGained: Int, trophyKey: String) {
        self.prestigeAfter = prestigeAfter
        self.gloryGained = gloryGained
        self.trophyKey = trophyKey
    }
}

public enum PrestigeTransition: Sendable, Equatable {
    case allowed(PrestigePassage)
    case refused(PrestigeRefusal)
}

public enum GamePrestige {
    /// Le niveau 100 demande un million de points ET ses dix étapes (#9706) : le record prouve les étapes,
    /// le score en poche prouve les points.
    public static func transition(score: Int, prestige: Int, levelRecord: Int?) -> PrestigeTransition {
        let stars = max(0, prestige)
        if stars >= GameLevels.maxPrestige { return .refused(.atMaximum) }
        if GameLevels.levelForUnlocks(score: score, levelRecord: levelRecord) < GameLevels.prestigeLevel { return .refused(.levelTooLow) }
        let after = stars + 1
        return .allowed(PrestigePassage(
            prestigeAfter: after,
            gloryGained: GameGlory.points.prestige,
            trophyKey: GameTrophies.key(of: .prestige(number: after))
        ))
    }
}
