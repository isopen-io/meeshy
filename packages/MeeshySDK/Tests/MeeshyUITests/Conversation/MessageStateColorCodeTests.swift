import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// #7599 — les états d'un message se lisent par leur COULEUR, avec un code
/// unique pour iOS et web-v2 (`--ios-state-*` dans `design-tokens/ios.css`).
/// Les hex ci-dessous sont le CONTRAT entre plateformes : ils s'écrivent en
/// littéral ici, jamais relus depuis `MeeshyColors`, sinon le témoin
/// confirmerait n'importe quelle valeur.
final class MessageStateColorCodeTests: XCTestCase {

    private let deadline = Date(timeIntervalSince1970: 2_000_000_000)

    func test_viewOnce_isTheFilledPictogram_inAccentViolet_withoutVisibleText() {
        let p = MessageProtectionChrome.presentation(for: .viewOnce)
        XCTAssertEqual(p.symbol, MessageProtectionSymbols.viewOnceFilled)
        XCTAssertEqual(p.tintHex, "6366F1")
        XCTAssertFalse(p.showsCountdown)
    }

    func test_blurred_isGrey_neverTheViewOnceViolet() {
        let p = MessageProtectionChrome.presentation(for: .blurred)
        XCTAssertEqual(p.tintHex, "6B7280")
        XCTAssertNotEqual(p.tintHex, MessageProtectionChrome.presentation(for: .viewOnce).tintHex)
        XCTAssertFalse(p.showsCountdown)
    }

    func test_ephemeralRunning_isTheOrangeFlameAlone() {
        let p = MessageProtectionChrome.presentation(for: .ephemeral(.running(deadline: deadline)))
        XCTAssertEqual(p.symbol, MessageProtectionSymbols.ephemeral)
        XCTAssertEqual(p.tintHex, "F97316")
        XCTAssertFalse(p.showsCountdown)
    }

    func test_ephemeralLastMinute_countsDown_inTheSameOrange() {
        let p = MessageProtectionChrome.presentation(for: .ephemeral(.imminent(deadline: deadline)))
        XCTAssertEqual(p.tintHex, "F97316")
        XCTAssertTrue(p.showsCountdown)
    }

    /// L'orange d'un éphémère n'est plus le rouge d'un échec d'envoi : les deux
    /// états partageaient `MeeshyColors.error`.
    func test_ephemeral_isNeverTheFailureRed() {
        let p = MessageProtectionChrome.presentation(for: .ephemeral(.running(deadline: deadline)))
        XCTAssertNotEqual(p.tintHex, MeeshyColors.stateFailedHex)
        XCTAssertNotEqual(p.tintHex, MeeshyColors.errorHex)
    }

    func test_ephemeralAwaitingReception_isOrange_withoutAVisibleDuration() {
        let p = MessageProtectionChrome.presentation(for: .ephemeral(.awaitingReception(duration: 300)))
        XCTAssertEqual(p.tintHex, "F97316")
        XCTAssertFalse(p.showsCountdown)
    }

    func test_stateHexTwins_matchTheCrossPlatformContract() {
        XCTAssertEqual(MeeshyColors.stateViewOnceHex, "6366F1")
        XCTAssertEqual(MeeshyColors.stateOpenedHex, "9CA3AF")
        XCTAssertEqual(MeeshyColors.stateEphemeralHex, "F97316")
        XCTAssertEqual(MeeshyColors.stateConcealedHex, "6B7280")
        XCTAssertEqual(MeeshyColors.stateFailedHex, "EF4444")
    }

    /// Le texte retiré de l'écran reste au lecteur d'écran (règle 5).
    func test_accessibilityLabels_keepEveryStateRemovedFromTheScreen() {
        let descriptor = MessageProtectionDescriptor.resolve(
            flags: [.viewOnce, .blurred], servedExpiresAt: nil, ephemeralDuration: nil,
            localReceivedAt: nil, now: deadline
        )
        let labels = MessageProtectionChrome.accessibilityLabels(for: descriptor, now: deadline)
        XCTAssertTrue(labels.contains(MessageProtectionChrome.viewOnceA11y))
        XCTAssertTrue(labels.contains(MessageProtectionChrome.blurredLabel))
    }
}
