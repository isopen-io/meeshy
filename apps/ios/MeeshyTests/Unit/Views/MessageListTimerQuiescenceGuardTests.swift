import Foundation
import XCTest
@testable import Meeshy

/// **La liste ne RÉVEILLE plus rien sous ce qui la recouvre (#3947).**
///
/// `MessageListDormantRenderingSourceGuardTests` garde l'autre moitié : le
/// RENDU s'arrête (`vc.view.isHidden`) quand la Rivière ou le Résumé couvrent
/// le fil. Cette suite garde ce qu'`isHidden` ne peut pas atteindre.
///
/// Un `Timer` posé sur le RunLoop principal ignore complètement la visibilité
/// de la vue : masquée ou non, `seenTimer` continuait de se réveiller **quatre
/// fois par seconde**, indéfiniment, sans qu'un doigt touche l'écran. C'est
/// précisément le coût que la mesure de #3940 lit — le coût PÉRIODIQUE. Les
/// abonnements Combine d'`observeStore()`, eux, sont dirigés par événement et
/// ne coûtent rien tant que rien n'arrive : les citer dans le même souffle que
/// le timer confond deux natures de dépense.
///
/// > Une veille de RENDU n'est pas une veille d'HORLOGE. La question à poser à
/// > toute mise en sommeil n'est pas « la vue est-elle cachée ? » mais « qu'est-ce
/// > qui continue de se réveiller tout seul par-dessous ? ».
final class MessageListTimerQuiescenceGuardTests: XCTestCase {

    private func host() throws -> String {
        AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/MessageListViewController.swift"))
    }

    private func extensionSource() throws -> String {
        AppSourceGuard.stripComments(
            try AppSourceGuard.unit(
                "Meeshy/Features/Main/Views/MessageListViewController+SeenTracking.swift"))
    }

    // MARK: - L'horloge suit le mode

    func test_theReadingModeDidSet_syncsTheQuiescence() throws {
        XCTAssertTrue(
            try host().contains("syncThreadQuiescence()"),
            "Le `didSet` de `readingMode` est le SEUL instant où l'on apprend qu'un pane vient "
            + "de couvrir la liste — ou de la découvrir. Sans cet appel, le timer survit au "
            + "passage en Rivière et se réveille 4 fois par seconde pour personne."
        )
    }

    func test_theQuiescence_stopsTheClockUnderAnOpaquePane_andRestartsItOnReturn() throws {
        let source = try extensionSource()
        guard let body = Self.body(of: "func syncThreadQuiescence() {", in: source) else {
            return XCTFail("Corps de syncThreadQuiescence introuvable.")
        }
        XCTAssertTrue(body.contains("stopSeenTracking()"),
                      "Sous un pane opaque, l'horloge doit s'ARRÊTER.")
        XCTAssertTrue(body.contains("startSeenTracking()"),
                      "Au retour vers un mode rendu, elle doit REPARTIR — sinon le suivi de "
                      + "lecture est mort pour le reste de la conversation, ce qui serait un "
                      + "défaut PIRE que la dépense qu'on supprime.")
        XCTAssertTrue(body.contains("rendersThread"),
                      "La distinction « mode couvert » n'est pas réécrite : `rendersThread` est "
                      + "déjà la loi, et elle gouverne aussi le gate du suivi de lecture. Deux "
                      + "formulations de la même distinction finissent toujours par diverger.")
    }

    /// La reconfiguration INTÉGRALE des cellules — le geste le plus cher du
    /// `didSet` — ne se paie pas pour des pixels cachés.
    func test_theFullReconfigure_isNotPaidWhileCovered() throws {
        let source = try host()
        guard let body = Self.body(of: "var readingMode: ConversationReadingMode = .bubbles {",
                                   in: source) else {
            return XCTFail("Corps du didSet de readingMode introuvable.")
        }
        guard let apply = body.range(of: "applySnapshot(reconfigure: .allItems)") else {
            return XCTFail("La reconfiguration intégrale a disparu du didSet.")
        }
        XCTAssertTrue(
            body[..<apply.lowerBound].contains("if rendersThread {"),
            "`applySnapshot(reconfigure: .allItems)` redessine CHAQUE cellule dans la pose du "
            + "nouveau mode ; sous un pane opaque, personne ne voit le résultat. La passe se "
            + "rejoue au retour, ce `didSet` étant appelé dans les deux sens."
        )
    }

    // MARK: - Contre-épreuve : la garde sait dire NON

    func test_theGuards_wouldCatchTheirOwnRemoval() {
        XCTAssertNil(Self.body(of: "func syncThreadQuiescence() {", in: "func autreChose() {}"),
                     "Un corps absent doit rendre nil, jamais une chaîne vide qui passerait "
                     + "silencieusement les `contains` ci-dessus.")
        let avant = "didSet {\n applySnapshot(reconfigure: .allItems)\n }"
        XCTAssertFalse(avant.contains("if rendersThread {"),
                       "le code d'AVANT le correctif ne doit satisfaire aucune des gardes")
    }

    /// Extrait le corps d'une déclaration par équilibrage d'accolades — un
    /// `range(of:)` jusqu'à la prochaine `func` connue casserait au premier
    /// réordonnancement du fichier.
    private static func body(of header: String, in source: String) -> String? {
        guard let start = source.range(of: header) else { return nil }
        var depth = 0
        var index = source.index(before: start.upperBound)   // sur l'accolade ouvrante
        while index < source.endIndex {
            let character = source[index]
            if character == "{" { depth += 1 }
            if character == "}" {
                depth -= 1
                if depth == 0 {
                    return String(source[start.upperBound..<index])
                }
            }
            index = source.index(after: index)
        }
        return nil
    }
}
