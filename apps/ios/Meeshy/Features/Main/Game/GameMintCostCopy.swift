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
                      defaultValue: "Pièce entière \(GameCopy.formatCount(base)) · \(rate) % au niveau \(GameCopy.formatCount(level))",
                      bundle: .main)
    }

    /// Le passage de niveau que la frappe coûte (#10892) : la poche fait le niveau, la frappe la dépense.
    struct LevelPassage: Equatable {
        /// « Niveau 9 → 8 ».
        let text: String
        /// « Ton niveau passera de 9 à 8 » — une phrase, jamais une flèche.
        let accessibilityLabel: String
    }

    /// Lu sur la VÉRITÉ (`shownLevels`, #9688) ; `nil` quand la frappe ne coûte aucun niveau.
    static func levelPassage(_ mint: GameMintPreview) -> LevelPassage? {
        let levels = mint.shownLevels
        guard levels.levelsLost > 0, levels.levelAfter < levels.levelBefore else { return nil }
        return LevelPassage(text: levelPassageText(before: levels.levelBefore, after: levels.levelAfter),
                            accessibilityLabel: levelPassageSpoken(before: levels.levelBefore, after: levels.levelAfter))
    }

    static func levelPassageText(before: Int, after: Int) -> String {
        let passage = "\(GameCopy.formatCount(before)) → \(GameCopy.formatCount(after))"
        return String(localized: "game.mint.chip.level", defaultValue: "Niveau \(passage)", bundle: .main)
    }

    static func levelPassageSpoken(before: Int, after: Int) -> String {
        let from = GameCopy.formatCount(before)
        let to = GameCopy.formatCount(after)
        return String(localized: "game.mint.chip.level_a11y", defaultValue: "Ton niveau passera de \(from) à \(to)", bundle: .main)
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

    /// « Tu dois encore 300 étincelles : la frappe reprendra une fois la dette réglée. » — sans montant servi
    /// (`blockedBy: 'debt'` seul), la phrase dit la dette sans inventer de nombre.
    static func debtText(_ debt: Int) -> String {
        guard debt > 0 else {
            return String(localized: "game.mint.blocked.debt_plain",
                          defaultValue: "Une ombre voile ta lumière : tes prochaines étincelles la dissiperont. Tant qu’elle est là, on ne frappe pas.",
                          bundle: .main)
        }
        return String(localized: "game.mint.blocked.debt",
                      defaultValue: "Une ombre voile \(GameCopy.formatCount(debt)) étincelles de ta lumière : tes prochaines étincelles la dissiperont, puis tu pourras frapper.",
                      bundle: .main)
    }

    /// Le message d'une frappe REFUSÉE : la dette (son montant quand il est connu), la réserve fermée, sinon le repli.
    static func mintFailureMessage(code: GameErrorCode?, debt: Int?) -> String {
        switch code {
        case .mintBlockedByDebt: debtText(debt ?? 0)
        case .treasuryLocked: GameCopy.errorMessage(for: .treasuryLocked)
        case .priceChanged: GameCopy.errorMessage(for: .priceChanged)
        default: genericFailure
        }
    }

    static var genericFailure: String {
        String(localized: "progression.meesh.mint_error", defaultValue: "La frappe n'a pas abouti — réessayez", bundle: .main)
    }

    /// « Cette Meesh ouvrirait le Coffre : il faut le rang Voix I. »
    static func lockedText(reserve: String, rank: String) -> String {
        String(localized: "game.mint.blocked.reserve",
               defaultValue: "Cette Meesh ouvrirait la réserve « \(reserve) » : il faut le rang \(rank).",
               bundle: .main)
    }
}
