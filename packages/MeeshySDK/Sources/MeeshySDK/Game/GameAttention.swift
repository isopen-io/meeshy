import Foundation

// MARK: - Ce que le Jeu signale hors de ses écrans (#17796)
//
// MIROIR de `gameAttention` (`packages/shared/utils/game/attention.ts`) et de `GameAttention` Android
// (`apps/android/core/model/.../game/GameAttention.kt`), rejoués sur les mêmes cas.
//
// L'Offrande du jour est prête, la Flamme est à risque : le client ne recalcule AUCUNE règle (ni la précocité, ni le
// jour du joueur, ni l'état de la Flamme). Il LIT `chest.status` et `flame.status` servis dans le bloc `game` — le
// cache d'abord — et en tire deux booléens. « Jeu masqué » ou aucun bloc ⇒ rien. Aucune notification n'en découle.

public struct GameAttention: Equatable, Sendable {
    /// L'Offrande du jour est prête à s'ouvrir.
    public let chestReady: Bool
    /// La Flamme s'éteindra si rien n'est fait aujourd'hui.
    public let flameAtRisk: Bool

    public static let none = GameAttention(chestReady: false, flameAtRisk: false)

    public init(chestReady: Bool, flameAtRisk: Bool) {
        self.chestReady = chestReady
        self.flameAtRisk = flameAtRisk
    }

    /// La loi, sur la seule part du bloc qu'elle lit.
    public init(missionsUnlocked: Bool, chest: GameBlock.Chest.Status, flame: FlameStatus, flameDays: Int) {
        self.chestReady = missionsUnlocked && chest == .ready
        self.flameAtRisk = flame == .atRisk && flameDays > 0
    }

    public static func of(_ game: GameBlock?, hidden: Bool) -> GameAttention {
        guard !hidden, let game else { return .none }
        return GameAttention(missionsUnlocked: game.missions.unlocked, chest: game.chest.status,
                             flame: game.flame.status, flameDays: game.flame.days)
    }

    /// Au moins un signal à montrer.
    public var isRaised: Bool { chestReady || flameAtRisk }
}
