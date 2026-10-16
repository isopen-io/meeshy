import Foundation
import MeeshySDK

/// Ce que l'écran de frappe dit du COÛT et de ce qui BLOQUE (#10847, #10848).
///
/// - Le prix montré est le prix EFFECTIF (servi) ; quand un facteur de niveau l'a réduit, une ligne dit d'où il
///   vient : le prix de base de la pièce et le tarif du niveau actuel.
/// - Ce qui bloque, dans l'ordre (`GameMintPreview.blocker`) : la DETTE d'étincelles, puis la réserve du trésor que
///   le rang n'ouvre pas encore. Les étincelles qui manquent ont déjà leur phrase dans la rangée de dépense.
enum GameMintCostCopy {

    /// `nil` au plein tarif, ou devant un serveur qui ne sert ni le prix de base ni le facteur.
    static func costLine(_ mint: GameMintPreview) -> String? {
        guard let base = mint.basePrice, let factor = mint.costFactor, factor < 1 else { return nil }
        return costLineText(base: base, percent: (factor * 1000).rounded() / 10, level: mint.costLevel ?? mint.shownLevels.levelBefore)
    }

    /// « Prix de base 1 221 · 54,5 % au niveau 9 ».
    static func costLineText(base: Int, percent: Double, level: Int) -> String {
        let rate = percent.formatted(.number.precision(.fractionLength(0...1)))
        return String(localized: "game.mint.cost.line",
                      defaultValue: "Prix de base \(GameCopy.formatCount(base)) · \(rate) % au niveau \(GameCopy.formatCount(level))",
                      bundle: .main)
    }

    static func blockerMessage(_ mint: GameMintPreview) -> String? {
        switch mint.blocker {
        case .sparksDebt(let debt):
            return debtText(debt)
        case .treasuryLocked(let lock):
            let division = GloryDivision5(rawValue: lock.requires.division5)
            return lockedText(reserve: GameCopy.treasuryName(lock.tier),
                              rank: GameCopy.rankLabel(lock.requires.rank, division5: division))
        case .missingSparks, nil:
            return nil
        }
    }

    /// « Tu dois encore 300 étincelles : la frappe reprendra une fois la dette réglée. »
    static func debtText(_ debt: Int) -> String {
        String(localized: "game.mint.blocked.debt",
               defaultValue: "Tu dois encore \(GameCopy.formatCount(debt)) étincelles : la frappe reprendra une fois la dette réglée.",
               bundle: .main)
    }

    /// « Cette Meesh ouvrirait le Coffre : il faut le rang Voix I. »
    static func lockedText(reserve: String, rank: String) -> String {
        String(localized: "game.mint.blocked.reserve",
               defaultValue: "Cette Meesh ouvrirait la réserve « \(reserve) » : il faut le rang \(rank).",
               bundle: .main)
    }
}
