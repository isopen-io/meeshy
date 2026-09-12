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

    /// **Le calcul a quitté le site d'appel au #6126** — et la garde le suit.
    ///
    /// La réserve s'écrivait en ternaire DANS `.storyComposerCanvasBottomReservation(…)`.
    /// Elle est désormais une propriété nommée, `canvasBottomReservation`, parce
    /// que les deux zones ne prennent plus le bas de la même façon : le CORPS du
    /// post monte une zone dont on mesure la hauteur, la LÉGENDE s'écrit en place
    /// et ce qui la menace est le CLAVIER.
    ///
    /// > Lire le site d'APPEL aurait laissé cette garde verte sur le seul nom de
    /// > la propriété — une garde qui ne mesure plus rien, et qui a l'air de
    /// > mesurer. Elle lit donc le CORPS, et vérifie d'abord qu'il n'est pas vide.
    func test_laReserve_couvreLesDeuxZonesDEcriture() throws {
        let text = try source()
        XCTAssertTrue(
            text.contains(".storyComposerCanvasBottomReservation(canvasBottomReservation)"),
            "La réserve basse doit être DÉCLARÉE au canvas — sans elle la saisie recouvre la scène."
        )
        let corps = block(from: "var canvasBottomReservation: CGFloat {", to: "\n    }", in: text)
        XCTAssertFalse(corps.isEmpty, "`canvasBottomReservation` introuvable — la garde ne mesurerait rien.")

        XCTAssertTrue(
            corps.contains("editsSceneDescription") && corps.contains("editsPostContent"),
            "La réserve doit s'appliquer aux DEUX modes d'écriture. Ne tester que la " +
            "description laisse la zone de CONTENU passer par-dessus la scène, sans que " +
            "rien ne le signale : la hauteur est bien mesurée, elle n'est simplement pas servie."
        )
        XCTAssertTrue(
            corps.contains("keyboardTransition"),
            "La LÉGENDE réserve la hauteur du CLAVIER (#6126) : elle s'écrit en place, aucune " +
            "zone ne monte pour elle. Reprendre `sceneDescriptionEditorHeight` servirait `0` " +
            "sans que rien ne rougisse — la mesure existe toujours, la zone qui l'écrivait non."
        )
    }

    /// **Il n'y a plus qu'UNE zone en bas, et l'exclusivité a changé de porteur.**
    ///
    /// L'ancien témoin lisait `if editsSceneDescription / else if editsPostContent`
    /// dans `textEditingZones` : c'était le `else` qui garantissait que la réserve
    /// unifiée ne serve jamais la hauteur d'une zone fermée. Depuis #6126 la
    /// LÉGENDE n'a plus de zone — elle s'édite en place —, donc ce `else` n'a plus
    /// de second terme et l'exclusivité se joue ailleurs : chaque branche de
    /// `canvasBottomReservation` RETOURNE, et les deux portes se ferment l'une
    /// l'autre (`ComposerContentDoorWiringGuardTests`).
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
        let corps = block(from: "var canvasBottomReservation: CGFloat {", to: "\n    }", in: text)
        XCTAssertEqual(
            corps.components(separatedBy: "return").count - 1, 3,
            "Chaque branche de la réserve doit RETOURNER (légende, corps, repos) : c'est ce qui " +
            "rend les deux hauteurs incapables de s'additionner ou de se confondre."
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
        // Re-pointé au #6126 sur le CORPS de la propriété : lu au site d'appel,
        // ce témoin ne verrait plus qu'un identifiant, où aucun `+` ne peut
        // apparaître — vert pour toujours, et pour la mauvaise raison.
        let corps = block(from: "var canvasBottomReservation: CGFloat {", to: "\n    }", in: text)
        XCTAssertFalse(corps.isEmpty, "`canvasBottomReservation` introuvable")
        XCTAssertFalse(
            corps.contains("+"),
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
