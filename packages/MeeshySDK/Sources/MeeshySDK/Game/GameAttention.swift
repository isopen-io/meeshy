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

// MARK: - Le bandeau revient quand quelque chose change (#17366, retouche 3)
//
// MIROIR de `bannerRecall` (`packages/shared/utils/game/banner-recall.ts`) et de `GameBannerRecall` Android
// (`apps/android/core/model/.../game/GameBannerRecall.kt`), rejoués sur les mêmes cas.
//
// Hors de l'ouverture de l'app, le bandeau du joueur revient quelques secondes quand deux lectures successives du bloc
// servi disent qu'un acte vient d'être réalisé, que l'Offrande vient d'être prête ou que la Flamme vient de passer à
// risque. Un signal déjà levé ne rappelle pas deux fois ; ce qui retombe ne rappelle rien ; la première lecture non
// plus. Aucune notification n'en découle (#17368).

/// Ce que le bandeau compare d'une lecture à l'autre.
public struct GameBannerMoment: Equatable, Sendable {
    public let actsDone: Int
    public let attention: GameAttention

    public init(actsDone: Int, attention: GameAttention) {
        self.actsDone = actsDone
        self.attention = attention
    }

    public static func of(_ game: GameBlock?, hidden: Bool) -> GameBannerMoment? {
        guard !hidden, let game else { return nil }
        return GameBannerMoment(actsDone: GameActsRing.of(game, hidden: false)?.done ?? 0,
                                attention: GameAttention.of(game, hidden: false))
    }
}

public enum GameBannerRecall: Equatable, Sendable {
    case offeringReady
    case act
    case flameAtRisk

    /// Le temps pendant lequel le bandeau rappelé reste à l'écran (`PLAYER_BANNER_RECALL_MS` du web).
    public static let seconds: Double = 5

    /// Ce qui vient de naître entre deux lectures, par ordre d'importance ; `nil` ⇒ le bandeau ne revient pas.
    public static func reason(before: GameBannerMoment?, after: GameBannerMoment?) -> GameBannerRecall? {
        guard let before, let after else { return nil }
        if after.attention.chestReady && !before.attention.chestReady { return .offeringReady }
        if after.actsDone > before.actsDone { return .act }
        if after.attention.flameAtRisk && !before.attention.flameAtRisk { return .flameAtRisk }
        return nil
    }
}
