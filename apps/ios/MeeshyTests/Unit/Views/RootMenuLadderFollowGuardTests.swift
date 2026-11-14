// apps/ios/MeeshyTests/Unit/Views/RootMenuLadderFollowGuardTests.swift

import XCTest
@testable import Meeshy

/// **L'échelle du menu suit le bouton qu'on glisse** (#18201).
///
/// `RootFloatingChrome.menuLadder` se posait depuis la position PERSISTÉE du
/// bouton Menu — écrite à la LEVÉE du doigt — pendant que le disque, lui, suivait
/// le doigt image par image dans un `@State` privé du SDK. Menu ouvert, les
/// barreaux restaient plantés tout le glisser puis sautaient. Ces gardes
/// épinglent le câblage : la course vive est LUE par l'échelle (jamais écrite),
/// la loi de suivi est celle du SDK (`FloatingMenuLadderFollow`), et la batterie
/// y entre par le signal que toute décoration animée lit déjà.
final class RootMenuLadderFollowGuardTests: XCTestCase {

    private func chrome() throws -> String {
        let unit = try AppSourceGuard.unitURLs("Meeshy/Features/Main/Views/RootFloatingChrome.swift")
            .map { try String(contentsOf: $0, encoding: .utf8) }
            .joined(separator: "\n")
        XCTAssertFalse(unit.isEmpty, "la garde lit une source vide : chemin faux")
        return AppSourceGuard.stripComments(unit)
    }

    /// La course vive du bouton de droite est reçue du conteneur du SDK.
    func test_menuChrome_readsTheLiveDragOfTheMenuButton() throws {
        let code = try chrome()
        XCTAssertTrue(
            code.contains("onRightDragChanged: { menuLiveDrag = $0 }"),
            "le conteneur publie la course vive du Menu ; sans ce câblage, l'échelle ne connaît que la position persistée"
        )
    }

    /// L'échelle se pose sur le centre VIVANT, par la loi du SDK, et non sur la
    /// seule position persistée.
    func test_menuLadder_positionsRungsOnTheLiveCenter_viaTheSharedLaw() throws {
        let code = try chrome()
        XCTAssertTrue(
            code.contains("FloatingMenuLadderFollow.liveCenter(resting: restingCenter, drag: menuLiveDrag)"),
            "le centre que l'échelle suit = position au repos + course du doigt"
        )
        XCTAssertTrue(
            code.contains(".animation(follow.animation(rung: index), value: anchor)"),
            "chaque barreau porte SON ressort (retard croissant par rang) — c'est la chaîne"
        )
        XCTAssertTrue(
            code.contains(".scaleEffect(follow.scale(rung: index, dragging: anchor.dragging))"),
            "chaque barreau porte SON échelle (décroissante depuis le disque) pendant le glisser"
        )
    }

    /// Le sens d'ouverture se lit sur la position AU REPOS : décidé sur le centre
    /// vivant, il basculerait haut/bas sous le doigt à chaque passage du seuil.
    func test_menuLadder_opensFromTheRestingCenter_notTheLiveOne() throws {
        let code = try chrome()
        XCTAssertTrue(
            code.contains("geometry.menuOpensDownward(from: globalCenter, ladderExtent: ladderExtent)"),
            "le sens d'ouverture reste celui de la position persistée pendant le glisser"
        )
    }

    /// La sobriété vient de DEUX signaux : Reduce Motion (système ou in-app) et
    /// la politique média (Économie d'énergie) — jamais d'un troisième réglage.
    func test_menuLadder_turnsTheDecorOff_onReduceMotion_andOnLowPower() throws {
        let code = try chrome()
        XCTAssertTrue(
            code.contains("MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userForcedReduceMotion)"),
            "Reduce Motion système ET in-app coupent la chaîne"
        )
        XCTAssertTrue(
            code.contains("MediaPolicyMonitor.shared.policy.animatesDecoration"),
            "l'Économie d'énergie coupe la chaîne par le signal partagé de toutes les décorations animées"
        )
        XCTAssertTrue(
            code.contains("MediaPolicyMonitor.shared.$policy"),
            "la politique est SUIVIE : brancher l'économie d'énergie en cours de session change l'échelle sans relance"
        )
    }
}
