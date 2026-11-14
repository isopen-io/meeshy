import XCTest
import SwiftUI
import MeeshySDK
@testable import MeeshyUI

/// **L'échelle du menu suit le bouton qu'on glisse, en accordéon** (#18201).
///
/// Avant : l'échelle se posait depuis la position PERSISTÉE du bouton, écrite à
/// la LEVÉE du doigt ; menu ouvert, les barreaux restaient plantés pendant tout
/// le glisser puis sautaient. La loi ci-dessous dit, par rang, comment un
/// barreau suit : avec quel ressort (retard croissant = la chaîne) et à quelle
/// échelle (le disque grossit à 1,15 pendant le glisser, l'échelle décroît le
/// long des barreaux). Le SUIVI est une information et existe toujours ; la
/// chaîne et l'échelle sont du décor, absentes sous Reduce Motion et quand la
/// batterie commande la sobriété (`MediaPolicy.animatesDecoration`).
final class FloatingMenuLadderFollowTests: XCTestCase {

    private let decorated = FloatingMenuLadderFollow(reduceMotion: false, animatesDecoration: true)

    // MARK: - La chaîne : chaque rang suit avec un peu plus de retard

    func test_response_growsWithTheRung_soTheLadderFollowsAsAChain() {
        let r0 = decorated.response(rung: 0)
        let r1 = decorated.response(rung: 1)
        let r5 = decorated.response(rung: 5)

        XCTAssertGreaterThan(r1, r0, "le deuxième barreau arrive après le premier")
        XCTAssertGreaterThan(r5, r1, "le retard croît le long de l'échelle")
        XCTAssertEqual((r5 - r1) / 4, r1 - r0, accuracy: 1e-9, "la chaîne est régulière : même pas entre deux rangs voisins")
    }

    func test_response_firstRung_isBrisk_lastRung_staysUnderHalfASecond() {
        XCTAssertLessThanOrEqual(decorated.response(rung: 0), 0.3, "le premier barreau colle presque au disque")
        XCTAssertLessThan(decorated.response(rung: 7), 0.45, "huit barreaux : le dernier ne traîne pas une demi-seconde derrière — mesuré à 0,54 s, la chaîne s'étirait trop sur un glisser vif (recette du 2026-11-14)")
    }

    func test_animation_decorated_isASpring_perRung() {
        XCTAssertNotNil(decorated.animation(rung: 0))
        XCTAssertNotNil(decorated.animation(rung: 6))
    }

    // MARK: - L'échelle : le disque grossit à 1,15, les barreaux décroissent

    func test_scale_whileDragging_startsAtTheDiscScale_andDecreasesAlongTheLadder() {
        XCTAssertEqual(decorated.scale(rung: 0, dragging: true), FloatingMenuLadderFollow.discScale, accuracy: 1e-9)
        XCTAssertEqual(FloatingMenuLadderFollow.discScale, 1.15, "la même échelle que le disque glissé (`FreeFloatingButton`)")
        XCTAssertLessThan(decorated.scale(rung: 1, dragging: true), decorated.scale(rung: 0, dragging: true))
        XCTAssertLessThan(decorated.scale(rung: 3, dragging: true), decorated.scale(rung: 1, dragging: true))
    }

    func test_scale_neverShrinksBelowRest_evenOnALongLadder() {
        XCTAssertGreaterThanOrEqual(decorated.scale(rung: 40, dragging: true), 1)
    }

    func test_scale_atRest_isOne_onEveryRung() {
        for rung in 0..<8 {
            XCTAssertEqual(decorated.scale(rung: rung, dragging: false), 1, "au repos, un barreau garde sa taille (rang \(rung))")
        }
    }

    // MARK: - Sobriété : Reduce Motion ou batterie ⇒ suivi rigide, sans décor

    func test_reduceMotion_followsRigidly_noSpring_noScale() {
        let sober = FloatingMenuLadderFollow(reduceMotion: true, animatesDecoration: true)

        XCTAssertFalse(sober.isDecorated)
        XCTAssertNil(sober.animation(rung: 0), "aucun ressort : le barreau se pose là où est le disque, à l'image")
        XCTAssertNil(sober.animation(rung: 5))
        XCTAssertEqual(sober.scale(rung: 0, dragging: true), 1)
        XCTAssertEqual(sober.scale(rung: 3, dragging: true), 1)
    }

    func test_lowPower_followsRigidly_likeReduceMotion() {
        let sober = FloatingMenuLadderFollow(reduceMotion: false, animatesDecoration: false)

        XCTAssertFalse(sober.isDecorated)
        XCTAssertNil(sober.animation(rung: 0))
        XCTAssertEqual(sober.scale(rung: 0, dragging: true), 1)
    }

    func test_mediaPolicy_lowPower_isWhatTurnsTheDecorOff() {
        let policy = MediaPolicy(thermalState: .nominal, lowPower: true, tier: .high)
        let follow = FloatingMenuLadderFollow(reduceMotion: false, animatesDecoration: policy.animatesDecoration)

        XCTAssertFalse(follow.isDecorated, "l'économie d'énergie est le signal déjà partagé par toutes les décorations animées")
    }

    // MARK: - Le centre vivant : position persistée + course du doigt

    func test_liveCenter_addsTheDragToTheRestingCenter() {
        let resting = CGPoint(x: 350, y: 300)

        XCTAssertEqual(FloatingMenuLadderFollow.liveCenter(resting: resting, drag: CGSize(width: -40, height: 25)), CGPoint(x: 310, y: 325))
    }

    func test_liveCenter_withoutDrag_isTheRestingCenter() {
        let resting = CGPoint(x: 350, y: 300)

        XCTAssertEqual(FloatingMenuLadderFollow.liveCenter(resting: resting, drag: nil), resting)
    }
}

/// **Le conteneur du SDK REMONTE la course vive, et ne la persiste jamais.**
///
/// `FreeFloatingButton.dragOffset` était un `@State` privé : rien, au-dessus,
/// ne pouvait savoir où le disque était pendant le geste. Le bouton publie
/// désormais sa course à chaque image (`onDragChanged(translation)`) et la
/// retire à la levée (`onDragChanged(nil)`) ; l'écriture de la position reste
/// le fait du seul `onDragEnded` (garde `FeedButtonAnchorTests`, côté app).
final class FloatingButtonsLiveDragSourceGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = ComposerSourceGuard.packageRoot
            .appendingPathComponent("Sources/MeeshyUI/Primitives/FloatingButtons.swift")
        return ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    func test_freeFloatingButton_reportsTheLiveTranslation_onEveryChange() throws {
        let code = try source()
        XCTAssertTrue(
            code.contains("onDragChanged?(value.translation)"),
            "le glisser doit publier sa course à chaque `onChanged` — c'est elle que l'échelle du menu suit"
        )
    }

    func test_freeFloatingButton_clearsTheLiveTranslation_whenTheFingerLifts() throws {
        let code = try source()
        XCTAssertTrue(
            code.contains("onDragChanged?(nil)"),
            "à la levée, la course vive est retirée (`nil`) : l'échelle se repose sur la position persistée, et `scale` revient à 1"
        )
    }

    func test_container_exposesTheRightButtonLiveDrag() throws {
        let code = try source()
        XCTAssertTrue(
            code.contains("onRightDragChanged"),
            "`FreeFloatingButtonsContainer` expose la course vive du bouton de droite (le Menu) à l'app qui pose l'échelle"
        )
    }
}
