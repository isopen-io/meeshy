import Foundation
import MeeshySDK

/// LES FICHES DE L'HÉRITAGE ET DES ÉTINCELLES (#11180, épopée § 3.3 et § 5) — ce que la tête des deux fiches et le
/// cadre de la frappe écrivent. En tête ce qu'on POSSÈDE (ta lumière, les Meeshes gardées), en petit le « depuis
/// toujours », le prix UNE fois dans une phrase. Le contenant se dit avec son article et son possessif : une clé par
/// contenant, l'accord ne se calcule pas.
///
/// MIROIR clé pour clé de `apps/web/src/lib/interface-catalogs/catalog-game-fiche-<langue>.ts` : les mêmes clés
/// disent les mêmes mots dans les sept langues (`ios-catalog-parity.test.ts`). Les nombres arrivent déjà formatés.
enum GameFicheCopy {

    /// « Ta lumière » — le nom de la tête des Étincelles.
    static var lightLabel: String { String(localized: "game.fiche.light.label", defaultValue: "Ta lumière", bundle: .main) }

    /// « Une ombre sur 300 étincelles » — l'Ombre en une ligne de carte : elle passe avant le « depuis toujours ».
    static func shadow(_ debt: String) -> String {
        String(localized: "game.sparks.debt", defaultValue: "Une ombre sur \(debt) étincelles", bundle: .main)
    }

    /// Le lien de la fiche des Étincelles vers l'Héritage, où vivent le prix et le manque de la prochaine Meesh.
    static var toHeritage: String {
        String(localized: "game.fiche.light.to_heritage", defaultValue: "Ouvrir ton Héritage", bundle: .main)
    }

    /// « Ton Coffret » — le contenant qu'on possède ; « Ton Héritage » sans Meesh gardée.
    static func held(_ tier: TreasuryTierKey?) -> String {
        switch tier {
        case nil: String(localized: "game.fiche.heritage.held.none", defaultValue: "Ton Héritage", bundle: .main)
        case .bourse: String(localized: "game.fiche.heritage.held.bourse", defaultValue: "Ta Bourse", bundle: .main)
        case .escarcelle: String(localized: "game.fiche.heritage.held.escarcelle", defaultValue: "Ton Escarcelle", bundle: .main)
        case .coffret: String(localized: "game.fiche.heritage.held.coffret", defaultValue: "Ton Coffret", bundle: .main)
        case .coffre: String(localized: "game.fiche.heritage.held.coffre", defaultValue: "Ton Coffre", bundle: .main)
        case .tresor: String(localized: "game.fiche.heritage.held.tresor", defaultValue: "Ton Trésor", bundle: .main)
        case .reserve: String(localized: "game.fiche.heritage.held.reserve", defaultValue: "Ta Réserve", bundle: .main)
        }
    }

    /// « le Coffre s’ouvre à 100 » — le contenant suivant, avec son article.
    static func opens(_ tier: TreasuryTierKey, at minHeld: Int) -> String {
        let count = GameCopy.formatCount(minHeld)
        return switch tier {
        case .bourse: String(localized: "game.fiche.heritage.opens.bourse", defaultValue: "la Bourse s’ouvre à \(count)", bundle: .main)
        case .escarcelle: String(localized: "game.fiche.heritage.opens.escarcelle", defaultValue: "l’Escarcelle s’ouvre à \(count)", bundle: .main)
        case .coffret: String(localized: "game.fiche.heritage.opens.coffret", defaultValue: "le Coffret s’ouvre à \(count)", bundle: .main)
        case .coffre: String(localized: "game.fiche.heritage.opens.coffre", defaultValue: "le Coffre s’ouvre à \(count)", bundle: .main)
        case .tresor: String(localized: "game.fiche.heritage.opens.tresor", defaultValue: "le Trésor s’ouvre à \(count)", bundle: .main)
        case .reserve: String(localized: "game.fiche.heritage.opens.reserve", defaultValue: "la Réserve s’ouvre à \(count)", bundle: .main)
        }
    }

    /// « 91 frappées depuis toujours ».
    static func minted(_ count: Int) -> String {
        let number = GameCopy.formatCount(count)
        return GameCopy.isSingular(count)
            ? String(localized: "game.fiche.heritage.minted.one", defaultValue: "\(number) frappée depuis toujours", bundle: .main)
            : String(localized: "game.fiche.heritage.minted.other", defaultValue: "\(number) frappées depuis toujours", bundle: .main)
    }

    /// « Elle fige 10 423 étincelles de ta lumière, qui en compte 108 233. » — le prix, UNE fois, avec ta lumière.
    static func mintSentence(price: String, held: String) -> String {
        String(localized: "game.fiche.mint.sentence", defaultValue: "Elle fige \(price) de ta lumière, qui en compte \(held).", bundle: .main)
    }

    /// « Il en manque encore 1 839 pour la frapper. » — le manque nomme sa cible : la pièce du cadre.
    static func mintMissing(_ missing: String) -> String {
        String(localized: "game.fiche.mint.missing", defaultValue: "Il en manque encore \(missing) pour la frapper.", bundle: .main)
    }

    /// « La n° 100 sera d’or. »
    static func meeNextGold(_ number: String) -> String {
        String(localized: "game.fiche.mint.mee.next_gold", defaultValue: "La n° \(number) sera d’or.", bundle: .main)
    }

    /// « La n° 1 000 sera de prisme. »
    static func meeNextPrism(_ number: String) -> String {
        String(localized: "game.fiche.mint.mee.next_prism", defaultValue: "La n° \(number) sera de prisme.", bundle: .main)
    }

    static var meeGold: String {
        String(localized: "game.fiche.mint.mee.gold", defaultValue: "Celle-ci sera d’or : tes aïeux la verront.", bundle: .main)
    }

    static var meePrism: String {
        String(localized: "game.fiche.mint.mee.prism", defaultValue: "Celle-ci sera de prisme : toutes les langues y brilleront.", bundle: .main)
    }

    static var meeWait: String {
        String(localized: "game.fiche.mint.mee.wait", defaultValue: "Encore un peu de lumière, et on frappe ensemble.", bundle: .main)
    }
}
