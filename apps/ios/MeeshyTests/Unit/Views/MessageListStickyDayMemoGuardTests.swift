// apps/ios/MeeshyTests/Unit/Views/MessageListStickyDayMemoGuardTests.swift

import Foundation
import XCTest
@testable import Meeshy

/// **Le mémo de la pastille de jour ne survit pas à une invalidation de
/// layout (#4602).**
///
/// `updateStickyDayLabel` sort tôt quand l'item de tête n'a pas changé
/// d'IDENTITÉ. C'est juste tant que la GÉOMÉTRIE ne bouge pas — et une bascule
/// de mode de lecture change les hauteurs de rangée sans changer les items. Le
/// même message reste en tête pendant qu'un séparateur de date d'un AUTRE jour
/// entre dans la bande de la pastille : la sticky gardait le jour d'avant,
/// superposé au séparateur natif. Deux pastilles, deux dates — « Saturday,
/// June 20 » par-dessus « Thursday, June 18 » sur la capture de l'issue — et
/// une résorption spontanée dès le premier défilement qui change l'item de
/// tête.
///
/// > **La clé d'un mémo doit porter TOUT ce qui change son résultat.** C'est la
/// > même forme que #3946, où l'empreinte du fil était aveugle au Prisme : une
/// > traduction qui arrive ne change ni le nombre de messages ni leurs
/// > identifiants. Ici la géométrie ne change ni l'un ni l'autre non plus.
///
/// Ces témoins gardent le MÉCANISME. La preuve VISUELLE — aucun chevauchement
/// après une bascule — reste au simulateur, comme le demande le critère de fin
/// de l'issue : aucun test unitaire ne voit deux vues se superposer.
final class MessageListStickyDayMemoGuardTests: XCTestCase {

    private func host() throws -> String {
        AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/MessageListViewController.swift"))
    }

    /// Corps d'une fonction ou d'un bloc, accolades équilibrées depuis son ancre.
    private func body(of anchor: String, in source: String) throws -> String {
        let start = try XCTUnwrap(source.range(of: anchor), "ancre introuvable : \(anchor)")
        var depth = 0
        var opened = false
        var out = ""
        for character in source[start.lowerBound...] {
            out.append(character)
            if character == "{" { depth += 1; opened = true }
            if character == "}" {
                depth -= 1
                if opened && depth == 0 { return out }
            }
        }
        throw XCTSkip("bloc non refermé pour \(anchor)")
    }

    // MARK: - Le mémo est vidé là où la géométrie change

    func test_leChangementDeMode_videLeMemoDeLaPastille() throws {
        let didSet = try body(of: "var readingMode: ConversationReadingMode", in: try host())
        let invalidation = try XCTUnwrap(didSet.range(of: "invalidateLayout()"))
        let vidage = try XCTUnwrap(
            didSet.range(of: "lastStickyTopItem = nil"),
            "Sans ce vidage, la pastille garde un jour calculé pour une géométrie qui n'existe plus."
        )

        XCTAssertTrue(
            invalidation.lowerBound < vidage.lowerBound,
            "Le vidage suit l'invalidation : c'est elle qui rend le mémo faux, et le recalcul juste "
            + "a lieu plus tard, dans la complétion d'`applySnapshot`, quand les cellules sont en place."
        )
    }

    /// **Ce témoin est ce qui empêche le précédent de garder le vide.** Si
    /// l'écriture anticipée disparaissait, il n'y aurait plus de mémo à vider
    /// et la garde ci-dessus passerait au vert en ne protégeant rien.
    func test_leMemoExisteEncore_etSaSortieAnticipeeAussi() throws {
        let source = try host()

        XCTAssertTrue(source.contains("guard topItem != lastStickyTopItem else { return }"),
                      "La sortie anticipée est la raison d'être du vidage.")
        XCTAssertTrue(source.contains("lastStickyTopItem = topItem"),
                      "et le mémo est bien écrit — sinon il ne pourrait pas se périmer")
    }

    /// **Une énumération devient un mécanisme.** Le contrôleur n'invalide le
    /// layout qu'à UN endroit ; le vidage y est donc complet. Un second site
    /// d'invalidation fera tomber ce témoin — c'est exactement le moment où il
    /// faut se redemander si le mémo y survit.
    func test_leControleurNInvalideLeLayout_quAUnSeulEndroit() throws {
        let occurrences = try host().components(separatedBy: "invalidateLayout()").count - 1

        XCTAssertEqual(
            occurrences, 1,
            "Un site d'invalidation neuf périme le mémo de la pastille sans qu'aucun autre témoin "
            + "ne tombe : ou bien il vide `lastStickyTopItem`, ou bien le vidage remonte dans un "
            + "site partagé."
        )
    }
}
