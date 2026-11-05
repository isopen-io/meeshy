import XCTest
@testable import Meeshy

/// **Ce que la zone d'écriture occupe, la scène le rend** (directive porteur
/// 2026-09-05).
///
/// > « Quand on active la zone d'édition de texte en bas, il faut rétrécir plus
/// > la scène pour le mode édition du contenu de poste que pour le mode ajout
/// > de description de scène. »
///
/// Deux garanties distinctes, et la première manquait complètement :
///
/// 1. **la réserve existe dans les DEUX modes.** Le prédicat ne testait que
///    `editsSceneDescription` : en mode CONTENU la scène ne se rétractait pas
///    du tout, et la zone lui passait par-dessus. Les deux zones écrivaient
///    pourtant déjà la même hauteur mesurée — le défaut ne vivait ni dans la
///    mesure, ni dans la zone, mais dans le prédicat ENTRE les deux ;
/// 2. **le contenu en prend PLUS que la description.** Les deux zones sont le
///    même composant (#4890), donc à texte égal leur hauteur est identique : la
///    différence doit être PRODUITE, jamais espérée. Elle passe par le nombre de
///    lignes montrées — ce que la zone occupe RÉELLEMENT — et non par un
///    supplément en points chez l'hôte, qui décollerait la scène de la zone.
final class ComposerBottomReservationGuardTests: XCTestCase {

    private func source() throws -> String {
        try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Composer/MeeshyComposerHost+Surfaces.swift")
    }

    private func block(from start: String, to end: String, in text: String) -> String {
        guard let s = text.range(of: start) else { return "" }
        let tail = text[s.upperBound...]
        guard let e = tail.range(of: end) else { return String(tail) }
        return String(tail[..<e.lowerBound])
    }

    // MARK: - 1. Une seule zone en bas : celle du corps

    /// **Il n'y a plus qu'UNE zone en bas, et l'exclusivité a changé de porteur.**
    ///
    /// L'ancien témoin lisait `if editsSceneDescription / else if editsPostContent`
    /// dans `textEditingZones` : c'était le `else` qui garantissait que la réserve
    /// unifiée ne serve jamais la hauteur d'une zone fermée. Depuis #6126 la
    /// LÉGENDE n'a plus de zone — elle s'édite en place —, donc ce `else` n'a plus
    /// de second terme et l'exclusivité se joue ailleurs : les deux portes se
    /// ferment l'une l'autre (`ComposerContentDoorWiringGuardTests`).
    ///
    /// > Réécrire ce témoin sur `textEditingZones` l'aurait rendu vert par
    /// > omission : un `if` seul y satisfait n'importe quelle exigence de
    /// > non-recouvrement. Ce qu'il faut garder est que la zone RESTANTE est bien
    /// > celle du CORPS, et qu'aucune ne revienne pour la légende.
    func test_laZoneRestante_estCelleDuCorps_etElleEstSeule() throws {
        let text = try source()
        let zones = block(from: "var textEditingZones: some View {", to: "\n    }", in: text)
        XCTAssertFalse(zones.isEmpty, "`textEditingZones` introuvable")
        XCTAssertTrue(
            zones.contains("if editsPostContent"),
            "Le CORPS du post garde sa zone du bas — c'est le contraste que la directive décrit."
        )
        XCTAssertFalse(
            zones.contains("sceneDescriptionEditor"),
            "La zone basse de la LÉGENDE ne doit pas revenir : elle s'écrit là où elle se lit (#6126)."
        )
    }

    // MARK: - 2. Le contenu en prend plus que la description

    func test_leContenu_montrePlusDeLignesQueLaDescription() throws {
        let text = try source()
        let editeurContenu = block(from: "var postContentEditor: some View {", to: "\n    }", in: text)
        XCTAssertFalse(editeurContenu.isEmpty, "`postContentEditor` introuvable")

        XCTAssertTrue(
            editeurContenu.contains("collapsedLineLimit:"),
            "Le corps du post doit DÉCLARER son nombre de lignes : c'est le seul levier " +
            "honnête de la différence demandée. Sans lui il hérite du défaut de la " +
            "description, et les deux zones rétractent la scène d'autant — la directive " +
            "du 2026-09-05 n'aurait aucun effet visible."
        )

        let lignes = ComposerBottomReservationGuardTests.entier(after: "collapsedLineLimit:", in: editeurContenu)
        XCTAssertNotNil(lignes, "Le nombre de lignes du corps doit être un littéral lisible")
        XCTAssertGreaterThan(
            lignes ?? 0, 6,
            "Le corps du post doit montrer PLUS de lignes que la description (6 par défaut) " +
            "— c'est ce qui fait que la scène se rétracte davantage pour lui."
        )
    }

    private static func entier(after marqueur: String, in texte: String) -> Int? {
        guard let r = texte.range(of: marqueur) else { return nil }
        let suite = texte[r.upperBound...].prefix(12)
        let chiffres = suite.drop(while: { $0 == " " }).prefix(while: \.isNumber)
        return Int(chiffres)
    }
}
