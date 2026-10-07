import Foundation
import MeeshySDK

// MARK: - Ce que disent les précisions d'un élément (#9564, amendement n° 2)
//
// PROVISOIRE : les clés `game.detail.<élément>.*` sont écrites d'abord par le lot web (#9563) et reprises ici
// phrase pour phrase. En attendant, la feuille ne dit que des phrases DÉJÀ au catalogue : le pourquoi et le
// comment du concept dont l'élément relève. Aucun texte n'est inventé de ce côté.
enum GameDetailText {
    /// « C'est quoi » — la phrase de la famille de l'élément.
    static func what(_ kind: GameElementKind, concept: ProgressionConcept) -> String {
        ConceptText.why(concept)
    }

    /// « Comment l'obtenir » ou « ce que ça donne » — la phrase de la famille de l'élément.
    static func how(_ kind: GameElementKind, concept: ProgressionConcept) -> String {
        ConceptText.how(concept)
    }

    /// Le titre de la seconde section : comment l'obtenir tant qu'on ne l'a pas, ce que ça donne ensuite.
    static func howTitle(_ kind: GameElementKind, obtained: Bool) -> String {
        String(localized: "game.door.rules", defaultValue: "Comment ça marche", bundle: .main)
    }

    static var obtained: String { AchievementCopy.earned }

    static var locked: String { String(localized: "achievement.locked", defaultValue: "verrouillé", bundle: .main) }

    /// « Voir la fiche » — depuis un écran qui n'est pas la fiche du concept.
    static var seeSheet: String { ConceptText.cardHint }

    /// Ce que VoiceOver ajoute à un élément qui se touche : son toucher ouvre ses précisions.
    static var hint: String { ConceptText.ficheWhere }

    static var close: String { String(localized: "common.close", defaultValue: "Fermer", bundle: .main) }
}
