import Foundation
import MeeshySDK

// MARK: - Ce que disent les précisions d'un élément (#9564, amendement n° 2)
//
// PROVISOIRE : les clés `game.detail.*` sont écrites d'abord par le lot web (#9563) et reprises ici phrase pour
// phrase. En attendant, la feuille ne dit que des phrases DÉJÀ au catalogue — le pourquoi et le comment du
// concept dont l'élément relève. Aucun texte n'est inventé de ce côté.
enum GameDetailText {
    /// « C'est quoi » — la phrase de la famille (`game.detail.<famille>.what`).
    static func what(_ kind: GameElementKind) -> String {
        ConceptText.why(kind.concept ?? .level)
    }

    /// « Comment l'obtenir » ou « ce que ça donne » — la phrase de la famille (`game.detail.<famille>.how`).
    static func how(_ kind: GameElementKind) -> String {
        ConceptText.how(kind.concept ?? .level)
    }

    /// La phrase d'une donnée (`game.detail.fact.<donnée>`).
    static func fact(_ key: GameDetailFactKey) -> String {
        ConceptText.ficheWhere
    }

    static var obtainLabel: String { ConceptText.ficheEarn }
    static var givesLabel: String { ConceptText.ficheEarn }
    static var earned: String { AchievementCopy.earned }
    static func earnedOn(_ date: String) -> String { ProgressionCopyBridge.obtained(date) }
    static var locked: String { String(localized: "achievement.locked", defaultValue: "verrouillé", bundle: .main) }
    static func missing(_ what: String) -> String { ConceptText.chipMissing(what) }
    /// « Voir la fiche » — depuis un écran qui n'est pas la fiche du concept.
    static var seeFiche: String { ConceptText.cardHint }
    /// Ce que VoiceOver ajoute à un élément qui se touche : son toucher ouvre ses précisions.
    static var open: String { ConceptText.ficheWhere }
    static var rarity: String { ConceptText.ficheWhere }
    static var elanActive: String { AchievementCopy.earned }
    static var elanIdle: String { ConceptText.valueNoElan }
    static func elanPoints(_ points: String) -> String { "+" + points }
    static var close: String { String(localized: "common.close", defaultValue: "Fermer", bundle: .main) }
}

/// Le pont provisoire vers la phrase « Obtenu le … » déjà au catalogue.
enum ProgressionCopyBridge {
    static func obtained(_ date: String) -> String {
        String(localized: "progression.obtained", defaultValue: "Obtenu le \(date)", bundle: .main)
    }
}
