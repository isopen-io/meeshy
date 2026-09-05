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
        try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift")
    }

    private func block(from start: String, to end: String, in text: String) -> String {
        guard let s = text.range(of: start) else { return "" }
        let tail = text[s.upperBound...]
        guard let e = tail.range(of: end) else { return String(tail) }
        return String(tail[..<e.lowerBound])
    }

    // MARK: - 1. La réserve vaut pour les deux zones

    func test_laReserve_couvreLesDeuxZonesDEcriture() throws {
        let text = try source()
        let appel = block(from: ".storyComposerCanvasBottomReservation(", to: ")", in: text)
        XCTAssertFalse(appel.isEmpty, "La réserve basse est introuvable — la garde ne mesurerait rien.")

        XCTAssertTrue(
            appel.contains("editsSceneDescription") && appel.contains("editsPostContent"),
            "La réserve doit s'appliquer aux DEUX modes d'écriture. Ne tester que la " +
            "description laisse la zone de CONTENU passer par-dessus la scène, sans que " +
            "rien ne le signale : la hauteur est bien mesurée, elle n'est simplement pas servie."
        )
    }

    /// La hauteur servie est celle de la zone MONTÉE — les deux ne peuvent pas
    /// s'ouvrir ensemble. Sans cette exclusivité, la réserve unifiée servirait
    /// la hauteur d'une zone fermée.
    func test_lesDeuxZones_sontExclusives() throws {
        let text = try source()
        let zones = block(from: "var textEditingZones: some View {", to: "\n    }", in: text)
        XCTAssertFalse(zones.isEmpty, "`textEditingZones` introuvable")
        XCTAssertTrue(
            zones.contains("if editsSceneDescription") && zones.contains("else if editsPostContent"),
            "Les deux zones partagent une seule hauteur mesurée : elles DOIVENT être " +
            "exclusives, sinon la réserve sert la hauteur de la zone qui n'est pas montée."
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

    /// **La différence ne passe pas par un supplément en points.** Un littéral
    /// de hauteur ajouté chez l'hôte ferait se rétracter la scène de plus que ce
    /// que la zone occupe : une bande vide apparaîtrait entre les deux, et la
    /// mesure remontée par la zone cesserait de décrire ce qu'on voit.
    func test_laDifference_nePasseParAucunSupplementEnPoints() throws {
        let text = try source()
        let appel = block(from: ".storyComposerCanvasBottomReservation(", to: ")", in: text)
        XCTAssertFalse(
            appel.contains("+"),
            "La réserve doit servir la hauteur MESURÉE, sans addition : la différence entre " +
            "les deux modes vient de ce que la zone occupe réellement (son nombre de lignes), " +
            "jamais d'un supplément posé ici."
        )
    }

    private static func entier(after marqueur: String, in texte: String) -> Int? {
        guard let r = texte.range(of: marqueur) else { return nil }
        let suite = texte[r.upperBound...].prefix(12)
        let chiffres = suite.drop(while: { $0 == " " }).prefix(while: \.isNumber)
        return Int(chiffres)
    }
}
