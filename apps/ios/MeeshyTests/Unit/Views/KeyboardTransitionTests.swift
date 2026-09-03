import XCTest
import UIKit
@testable import Meeshy

/// **Le clavier ANNONCE son animation ; le fil doit la rejouer (#4949).**
///
/// `keyboardWillShow`/`keyboardWillHide` arrivent AVANT le mouvement et
/// portent trois faits : la frame d'arrivée, la durée et la courbe. La vue de
/// conversation n'en lisait qu'un — la frame — et jetait les deux autres, si
/// bien que la réserve basse du fil (`contentInset`) était posée en un pas SEC
/// pendant que la barre de composition, elle, glissait sur la courbe système.
///
/// Le décodage est un value type précisément pour être vérifiable ici, sur un
/// `userInfo` synthétique : ni clavier, ni fenêtre, ni simulateur.
@MainActor
final class KeyboardTransitionTests: XCTestCase {

    private let keyboardFrame = CGRect(x: 0, y: 500, width: 393, height: 336)

    private func userInfo(
        frame: CGRect? = nil,
        duration: Double? = nil,
        curve: Int? = nil
    ) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = [:]
        if let frame { info[UIResponder.keyboardFrameEndUserInfoKey] = frame }
        if let duration { info[UIResponder.keyboardAnimationDurationUserInfoKey] = duration }
        if let curve { info[UIResponder.keyboardAnimationCurveUserInfoKey] = curve }
        return info
    }

    // MARK: - Présentation

    func test_init_presenting_readsHeightDurationAndCurve() throws {
        let transition = try XCTUnwrap(
            KeyboardTransition(
                userInfo: userInfo(frame: keyboardFrame, duration: 0.35, curve: 7),
                isPresenting: true
            )
        )

        XCTAssertEqual(transition.height, 336)
        XCTAssertEqual(transition.duration, 0.35, accuracy: 0.0001)
        // La courbe du clavier est un `UIView.AnimationCurve` brut : UIKit
        // l'attend décalé de 16 bits dans le masque d'options.
        XCTAssertEqual(transition.curve, UIView.AnimationOptions(rawValue: 7 << 16))
    }

    func test_init_presenting_bridgedNSNumbers_readsDurationAndCurve() throws {
        // Le vrai `userInfo` porte des `NSNumber`, pas des littéraux Swift :
        // la garde vaut aussi pour ce pont-là.
        var info: [AnyHashable: Any] = [:]
        info[UIResponder.keyboardFrameEndUserInfoKey] = keyboardFrame
        info[UIResponder.keyboardAnimationDurationUserInfoKey] = NSNumber(value: 0.25)
        info[UIResponder.keyboardAnimationCurveUserInfoKey] = NSNumber(value: 7)

        let transition = try XCTUnwrap(KeyboardTransition(userInfo: info, isPresenting: true))

        XCTAssertEqual(transition.duration, 0.25, accuracy: 0.0001)
        XCTAssertEqual(transition.curve, UIView.AnimationOptions(rawValue: 7 << 16))
    }

    func test_init_presenting_withoutFrame_returnsNil() {
        // Sans frame d'arrivée, la présentation n'apprend RIEN sur la hauteur :
        // l'ancien code faisait un `return` sec, celui-ci rend `nil` — dans les
        // deux cas la hauteur connue est préservée, jamais remise à zéro.
        XCTAssertNil(KeyboardTransition(userInfo: userInfo(duration: 0.25, curve: 7), isPresenting: true))
        XCTAssertNil(KeyboardTransition(userInfo: nil, isPresenting: true))
    }

    // MARK: - Masquage

    func test_init_dismissing_heightIsZero_evenThoughFrameIsFullHeight() throws {
        // Au masquage la notification porte encore la frame du clavier PLEIN
        // (il descend, il ne rétrécit pas) : lire sa hauteur gèlerait le
        // composeur alors que le clavier s'en va.
        let transition = try XCTUnwrap(
            KeyboardTransition(
                userInfo: userInfo(frame: keyboardFrame, duration: 0.25, curve: 7),
                isPresenting: false
            )
        )

        XCTAssertEqual(transition.height, 0)
        XCTAssertEqual(transition.duration, 0.25, accuracy: 0.0001)
        XCTAssertEqual(transition.curve, UIView.AnimationOptions(rawValue: 7 << 16))
    }

    func test_init_dismissing_withoutUserInfo_stillDescribesADismissal() throws {
        let transition = try XCTUnwrap(KeyboardTransition(userInfo: nil, isPresenting: false))

        XCTAssertEqual(transition.height, 0)
    }

    // MARK: - Valeurs par défaut

    func test_init_withoutDuration_fallsBackToTheUIKitDefault() throws {
        let transition = try XCTUnwrap(
            KeyboardTransition(userInfo: userInfo(frame: keyboardFrame, curve: 7), isPresenting: true)
        )

        XCTAssertEqual(transition.duration, KeyboardTransition.fallbackDuration, accuracy: 0.0001)
        XCTAssertEqual(KeyboardTransition.fallbackDuration, 0.25, accuracy: 0.0001)
    }

    func test_init_withoutCurve_fallsBackToEaseInOut() throws {
        let transition = try XCTUnwrap(
            KeyboardTransition(userInfo: userInfo(frame: keyboardFrame, duration: 0.3), isPresenting: true)
        )

        XCTAssertEqual(transition.curve, .curveEaseInOut)
        // `curveEaseInOut` vaut 0 dans le masque : le décalage d'une courbe 0
        // rend donc exactement la même valeur, aucun cas particulier à écrire.
        XCTAssertEqual(transition.curve.rawValue, 0)
    }

    func test_init_negativeCurve_fallsBackToEaseInOut() throws {
        // `UInt(-1) << 16` planterait : une valeur aberrante retombe sur la
        // courbe neutre au lieu de faire tomber l'app.
        let transition = try XCTUnwrap(
            KeyboardTransition(userInfo: userInfo(frame: keyboardFrame, curve: -1), isPresenting: true)
        )

        XCTAssertEqual(transition.curve, .curveEaseInOut)
    }

    // MARK: - Projection vers la liste

    func test_listInset_carriesDurationAndCurveUnchanged() throws {
        let transition = try XCTUnwrap(
            KeyboardTransition(
                userInfo: userInfo(frame: keyboardFrame, duration: 0.35, curve: 7),
                isPresenting: true
            )
        )

        XCTAssertEqual(
            transition.listInset,
            ListInsetTransition(duration: 0.35, curve: UIView.AnimationOptions(rawValue: 7 << 16))
        )
    }

    // MARK: - Une transition ne vit que le temps du mouvement annoncé

    /// Servie sans fin, la dernière annonce du clavier animait sur sa courbe
    /// des pas qui ne lui appartenaient pas : la croissance du composeur
    /// clavier BAISSÉ (tiroir, bandeau de réponse, tuile de lieu) traînait de
    /// 0,25 s derrière SwiftUI, qui l'anime déjà image par image.
    func test_isLive_duringTheAnnouncedMovement_isTrue() throws {
        let transition = try XCTUnwrap(
            KeyboardTransition(userInfo: userInfo(frame: keyboardFrame, duration: 0.25, curve: 7), isPresenting: true)
        )
        XCTAssertTrue(transition.isLive(at: transition.announcedAt.addingTimeInterval(0.2)))
    }

    /// Le pas de `safeAreaBottom` atterrit dans une passe ULTÉRIEURE à la
    /// notification : la marge (`liveSlack`) est là pour lui.
    func test_isLive_withinTheSlackAfterTheMovement_isTrue() throws {
        let transition = try XCTUnwrap(
            KeyboardTransition(userInfo: userInfo(frame: keyboardFrame, duration: 0.25, curve: 7), isPresenting: true)
        )
        XCTAssertTrue(
            transition.isLive(at: transition.announcedAt.addingTimeInterval(0.25 + KeyboardTransition.liveSlack / 2))
        )
    }

    func test_isLive_afterTheMovementAndItsSlack_isFalse() throws {
        let transition = try XCTUnwrap(
            KeyboardTransition(userInfo: userInfo(frame: keyboardFrame, duration: 0.25, curve: 7), isPresenting: true)
        )
        XCTAssertFalse(
            transition.isLive(at: transition.announcedAt.addingTimeInterval(0.25 + KeyboardTransition.liveSlack + 0.05))
        )
    }

    /// La hauteur, elle, reste vraie tant que le clavier est là : seul le
    /// TEMPO expire.
    func test_height_outlivesTheTransition() throws {
        let transition = try XCTUnwrap(
            KeyboardTransition(userInfo: userInfo(frame: keyboardFrame, duration: 0.25, curve: 7), isPresenting: true)
        )
        XCTAssertFalse(transition.isLive(at: transition.announcedAt.addingTimeInterval(5)))
        XCTAssertEqual(transition.height, 336)
    }
}

/// **Garde source — la réserve basse du fil rejoint sa valeur SUR une courbe.**
///
/// Le décodage ci-dessus n'a de valeur que s'il atteint le fil : c'est la
/// leçon « qui AFFICHE ce que le résolveur élit ». Trois maillons se vérifient
/// à la source, faute de toolchain Swift dans cette passe :
/// `ConversationView` observe le clavier par le nouveau modificateur et passe
/// sa courbe, `MessageListView` la transporte, et `updateUIViewController`
/// appelle bien la variante à transition.
@MainActor
final class KeyboardTransitionWiringGuardTests: XCTestCase {

    private var viewsDirectory: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Views
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func source(_ name: String) throws -> String {
        AppSourceGuard.stripComments(
            try String(contentsOf: viewsDirectory.appendingPathComponent(name), encoding: .utf8)
        )
    }

    /// L'UNITÉ `ConversationView`, jamais son seul fichier-tête : le décodage
    /// clavier a désormais un fichier VOISIN naturel (`+Keyboard.swift`, où
    /// vivent l'observateur et les deux `onReceive`), et une garde négative qui
    /// ne lit que la tête passerait au vert dès que l'interdit y revient —
    /// c'est-à-dire à l'endroit le plus probable. `AppSourceGuard.unit` balaie
    /// par GLOB, donc aucune extension future ne peut lui échapper.
    private func conversationViewUnit() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.conversationViewSource())
    }

    func test_conversationView_observesTheKeyboardThroughTheTransitionModifier() throws {
        let conversationView = try conversationViewUnit()

        XCTAssertTrue(
            conversationView.contains("observingKeyboardTransition($keyboardTransition)"),
            "ConversationView n'observe plus le clavier par son modificateur : la durée et la courbe système sont à nouveau perdues."
        )
        XCTAssertFalse(
            conversationView.contains("keyboardFrameEndUserInfoKey"),
            "Le décodage du clavier est reparti dans la vue : il n'a plus qu'un site, `KeyboardTransition`."
        )
    }

    func test_conversationView_handsTheCurveToTheMessageList() throws {
        XCTAssertTrue(
            try conversationViewUnit().contains("bottomInsetTransition: listInsetTransition"),
            "Le fil ne reçoit plus la courbe du clavier : sa réserve basse redeviendrait un pas sec."
        )
    }

    /// La courbe n'est servie que PENDANT le mouvement du clavier : servie
    /// sans fin, elle faisait traîner de 0,25 s chaque croissance du composeur
    /// clavier baissé.
    func test_conversationView_servesTheCurveOnlyWhileTheKeyboardMoves() throws {
        let unit = try conversationViewUnit()
        let declaration = try XCTUnwrap(unit.range(of: "var listInsetTransition: ListInsetTransition?"))
        let body = String(unit[declaration.lowerBound...].prefix(400))
        XCTAssertTrue(
            body.contains(".isLive()"),
            "`listInsetTransition` doit consulter `isLive()` : une transition expirée anime des pas qui ne sont pas les siens."
        )
    }

    func test_messageListView_appliesTheBottomInsetOnTheCallersCurve() throws {
        let listView = try source("MessageListView.swift")

        XCTAssertTrue(
            listView.contains("var bottomInsetTransition: ListInsetTransition?"),
            "`MessageListView` ne transporte plus la transition d'inset."
        )
        XCTAssertTrue(
            listView.contains("vc.applyBottomInset(bottomInset, transition: bottomInsetTransition)"),
            "`updateUIViewController` repose l'inset à sec : le fil se téléporterait pendant que le clavier glisse."
        )
    }

    /// Le MONTAGE, lui, reste sec : animer un inset depuis 0 sur un contrôleur
    /// qui vient de naître ferait glisser le fil à l'ouverture de l'écran.
    func test_messageListView_mountAppliesTheBottomInsetDryly() throws {
        let listView = try source("MessageListView.swift")
        let make = try XCTUnwrap(listView.range(of: "func makeUIViewController"))
        let update = try XCTUnwrap(listView.range(of: "func updateUIViewController"))
        let mountBody = String(listView[make.lowerBound..<update.lowerBound])

        XCTAssertTrue(
            mountBody.contains("vc.applyBottomInset(bottomInset)"),
            "Le montage doit poser l'inset sans transition."
        )
        XCTAssertFalse(
            mountBody.contains("transition: bottomInsetTransition"),
            "Le montage anime son inset : le fil glisserait à chaque ouverture de conversation."
        )
    }
}
