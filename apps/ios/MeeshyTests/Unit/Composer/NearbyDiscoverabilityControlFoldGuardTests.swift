import XCTest
@testable import Meeshy

/// **#3905 (exigence 2) — `NearbyDiscoverabilityControl` se replie par défaut.**
///
/// Avant ce correctif, `header` (le `Toggle` + titre + sous-titre) était
/// TOUJOURS peint — le contrôle occupait en permanence une bande large de
/// l'écran de publication pour un réglage secondaire. La garde prouve, par
/// la SOURCE (suite tournée sans UIKit réel, R5/R15, même patron que
/// `ComposerToolRowLeadingAccessoryGuardTests`) : un résumé compact toujours
/// visible, et le détail complet (`header`/`tierPicker`/`notices`) gaté sur
/// un état de repli, REPLIÉ par défaut.
final class NearbyDiscoverabilityControlFoldGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Components/NearbyDiscoverabilityControl.swift")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func body(of anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor) else { return nil }
        var depth = 0
        var result = ""
        for character in code[start.lowerBound...] {
            result.append(character)
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 { return result }
            }
        }
        return nil
    }

    func test_isExpanded_declaredAsAStateProperty_collapsedByDefault() throws {
        let code = try source()
        XCTAssertTrue(
            code.contains("@State private var isExpanded = false"),
            "`isExpanded` doit être un `@State` REPLIÉ par défaut (`false`) — la spec exige un résumé "
                + "compact par défaut, jamais le détail complet à l'ouverture."
        )
    }

    /// **Renommé au #4034** : le résumé est devenu l'ENTÊTE, et il porte
    /// désormais le nom du lieu, la bascule et la croix. Ce que la garde
    /// protège n'a pas changé — replié, le composant montre quelque chose.
    func test_body_alwaysRendersAHeader_regardlessOfExpansion() throws {
        let code = try source()
        guard let bodyBlock = body(of: "var body: some View {", in: code) else {
            return XCTFail("`body` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            bodyBlock.contains("placeHeader"),
            "`body` doit toujours peindre `placeHeader` — sans entête, replié n'affiche RIEN, ce qui "
                + "masquerait le contrôle plutôt que de le réduire."
        )
        // Extrait le bloc `if isExpanded { … }` et assertit dessus plutôt que
        // sur un littéral indenté (revue Opus 2026-08-27) : un `XCTAssertFalse`
        // sur une chaîne à indentation FIXE ne rougit plus si `summary` migre
        // dans le bloc à une profondeur différente — la garde passait au vert
        // sans plus rien protéger (fiche « gardes négatives meurent en
        // silence »).
        guard let detail = body(of: "if isExpanded {", in: bodyBlock) else {
            return XCTFail("Aucun bloc `if isExpanded {` dans `body` — le détail complet n'est plus gaté.")
        }
        XCTAssertFalse(
            detail.contains("placeHeader"),
            "`placeHeader` ne doit PAS être gaté par `isExpanded` — c'est lui qui reste visible replié."
        )
    }

    /// **#3905 gatait le `Toggle` derrière le pli ; #4034 l'en SORT.**
    ///
    /// Ce n'est pas un relâchement de la garde, c'est un renversement de la
    /// spec, demandé par le porteur le 2026-08-27 : l'entête doit porter
    /// « les infos d'activation/désactivation ». Ce que le pli cache est
    /// désormais le DÉTAIL — l'explication, le grain, les notices — et non plus
    /// l'ÉTAT. Sans cette réécriture, la garde aurait exigé l'ancienne forme et
    /// rougi sur la nouvelle, en croyant protéger quelque chose.
    func test_body_gatesTheDetail_butNoLongerTheState() throws {
        let code = try source()
        guard let bodyBlock = body(of: "var body: some View {", in: code) else {
            return XCTFail("`body` introuvable — la garde ne mesurerait rien.")
        }
        guard let detail = body(of: "if isExpanded {", in: bodyBlock) else {
            return XCTFail("Aucun bloc `if isExpanded {` dans `body` — le détail complet n'est plus gaté.")
        }
        XCTAssertTrue(
            detail.contains("discoverabilityDetail"),
            "L'EXPLICATION du second opt-in doit rester derrière le pli — c'est elle que la spec veut voir "
                + "disparaître à l'état replié."
        )
        XCTAssertTrue(
            detail.contains("tierPicker") && detail.contains("notices"),
            "Le grain et les notices doivent rester derrière le pli : ce sont eux qui font la hauteur."
        )
    }

    /// **La moitié POSITIVE du renversement**, et c'est elle qui compte : sans
    /// elle, supprimer la bascule de l'entête ne rougirait nulle part.
    func test_theHeader_carriesTheState_thePlaceName_andItsRemoval() throws {
        let code = try source()
        guard let header = body(of: "private var placeHeader: some View {", in: code) else {
            return XCTFail("`placeHeader` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            header.contains("Toggle(\"\", isOn: isDiscoverable)"),
            "L'entête doit porter la BASCULE — « les infos d'activation/désactivation dans son entête » (#4034)."
        )
        XCTAssertTrue(
            header.contains("removePlaceButton"),
            "L'entête doit porter la croix qui SUPPRIME le lieu (#4034)."
        )
        XCTAssertTrue(
            header.contains("expander"),
            "L'entête doit porter le titre — le NOM DU LIEU, pas le mot « Position » (#4034)."
        )

        guard let etiquette = body(of: "private var expanderLabel: some View {", in: code) else {
            return XCTFail("`expanderLabel` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            etiquette.contains("Text(placeName)"),
            "Le titre doit être `placeName` — le lieu RÉEL. Un libellé de catégorie ne dit pas LEQUEL part."
        )

        guard let croix = body(of: "private var removePlaceButton: some View {", in: code) else {
            return XCTFail("`removePlaceButton` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            croix.contains("adaptiveGlass(in: Circle())"),
            "La croix doit être en VERRE (#4034) — même matériau que la fermeture de la barre haute."
        )
        XCTAssertFalse(
            croix.contains("glassControlForeground()"),
            "`glassControlForeground()` peint `indigo950` sous un thème CLAIR, et ce contrôle est peint sur "
                + "un plateau toujours sombre : le premier plan doit rester posé explicitement."
        )
        XCTAssertTrue(
            croix.contains("onRemovePlace()"),
            "La croix doit appeler `onRemovePlace` — un bouton sans effet est ce que la loi 4 interdit."
        )
    }

    /// **Le composant se monte sur le LIEU, pas sur l'opt-in (#4034).**
    ///
    /// Le chip de lieu ayant quitté la rangée d'outils, garder l'ancienne garde
    /// (`documentOffersNearbyDiscoverability`, qui exige une audience PUBLIQUE)
    /// aurait fait disparaître de l'écran le lieu d'un post privé — et avec lui
    /// le seul moyen de le retirer.
    func test_theComposer_mountsTheCardOnThePlace_notOnTheOptIn() throws {
        let hote = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost.swift"),
            encoding: .utf8
        )
        let code = AppSourceGuard.stripComments(hote)
        XCTAssertFalse(code.isEmpty, "Source du meuble introuvable — la garde serait verte par omission.")

        guard let montage = body(of: ".safeAreaInset(edge: .bottom) {", in: code) else {
            return XCTFail("Le montage du composant est introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(
            montage.contains("if let place = documentLocation {"),
            "Le composant doit se monter sur le LIEU : gaté sur l'opt-in, un post privé perdrait son lieu "
                + "à l'écran ET le moyen de le retirer."
        )
        XCTAssertTrue(
            montage.contains("offersDiscoverability: documentOffersNearbyDiscoverability"),
            "…et la découvrabilité doit rester gouvernée par SA règle, portée à l'intérieur du composant."
        )
        XCTAssertTrue(
            montage.contains("onRemovePlace: { documentLocation = nil }"),
            "La croix de l'entête doit vraiment effacer le lieu du meuble."
        )
    }
}
