import Foundation
import XCTest
@testable import Meeshy

/// **La liste ne se dessine pas sous ce qui la recouvre (#3947).**
///
/// En Rivière et en Résumé, un pane au fond OPAQUE est posé par-dessus le fil
/// dans le même ZStack — et le représentable UIKit restait pleinement visible
/// aux yeux d'UIKit : `UICollectionView` composait, mesurait ses cellules
/// self-sizing et réalisait leurs `UIHostingConfiguration` pour des pixels que
/// personne ne voit.
///
/// Le représentable reste MONTÉ, et c'est voulu : le démonter perdrait la
/// position de lecture, qui est la promesse du milestone. Ce qui s'arrête est
/// le RENDU, jamais les données.
///
/// La garde porte deux exigences, et la seconde est celle qu'on oublie : la
/// veille doit être posée **dès le montage** aussi. Une conversation ouverte
/// DIRECTEMENT en Rivière (le mode de lecture est persistant) rendrait sinon
/// le fil une fois pour rien avant la première mise à jour.
final class MessageListDormantRenderingSourceGuardTests: XCTestCase {

    private func source() throws -> String {
        AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/MessageListView.swift")
        )
    }

    /// La veille est posée aux DEUX sites du représentable : `make` et
    /// `update`. Compter les occurrences, et non seulement les chercher, est
    /// ce qui distingue « posé » de « posé partout ».
    func test_theRepresentable_hidesItsViewUnderAnOpaquePane_atBothSites() throws {
        let source = try source()
        XCTAssertEqual(
            Self.dormancyStatements(in: source), 2,
            "La veille de rendu doit être posée à la fois dans `makeUIViewController` (ouverture "
            + "DIRECTE en Rivière) et dans `updateUIViewController` (changement de mode). "
            + "Un seul des deux laisse un trou que rien d'autre ne ferme."
        )
    }

    /// La condition n'est pas RÉÉCRITE : `rendersThread` est déjà la loi qui
    /// distingue les modes couverts, et elle gouverne aussi le suivi de
    /// lecture. Deux formulations de la même distinction divergent — c'est le
    /// motif de jumelle que le dépôt paie le plus cher.
    func test_theDormancyCondition_reusesTheExistingLaw_ratherThanRestatingIt() throws {
        let source = try source()
        XCTAssertFalse(
            source.contains("readingMode == .river") || source.contains("readingMode != .river"),
            "La distinction « mode couvert » est réécrite au lieu d'appeler "
            + "`MessageListViewController.rendersThread(_:)`. Une seconde formulation de la même "
            + "loi finit toujours par diverger de la première."
        )
    }

    /// Contre-épreuve — la garde doit savoir dire NON. Une garde positive
    /// écrite sur du code déjà conforme peut naître verte et ne rien protéger.
    func test_theGuardAbove_wouldCatchTheDormancyBeingRemoved() {
        XCTAssertEqual(Self.dormancyStatements(in: "vc.readingMode = readingMode"), 0,
                       "le code d'AVANT le correctif ne doit compter aucune veille")
        XCTAssertEqual(
            Self.dormancyStatements(
                in: "vc.view.isHidden = !MessageListViewController.rendersThread(readingMode)"
            ),
            1
        )
    }

    /// La loi elle-même, par le comportement : ce sont bien les deux modes
    /// RECOUVERTS qui suspendent le rendu, et eux seuls.
    @MainActor
    func test_onlyTheTwoOpaquePanes_suspendTheRendering() {
        XCTAssertFalse(MessageListViewController.rendersThread(.river))
        XCTAssertFalse(MessageListViewController.rendersThread(.summary))
        XCTAssertTrue(MessageListViewController.rendersThread(.bubbles))
        XCTAssertTrue(MessageListViewController.rendersThread(.script))
        XCTAssertTrue(MessageListViewController.rendersThread(.focal))
    }

    private static func dormancyStatements(in source: String) -> Int {
        source.components(
            separatedBy: "vc.view.isHidden = !MessageListViewController.rendersThread(readingMode)"
        ).count - 1
    }
}
