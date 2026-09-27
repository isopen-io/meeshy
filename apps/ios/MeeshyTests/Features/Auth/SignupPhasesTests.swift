import XCTest
@testable import Meeshy

/// #8288 — l'inscription en phases vivantes, la LOI sans vue : téléphone
/// d'abord ; l'adresse au numéro donné ou passé ; la carte d'identité à
/// l'adresse cohérente ; le code dans la carte ; « Parler aux autres » au
/// compte validé. Miroir web : `apps/web/src/lib/view/signup-phases.ts`.
final class SignupPhasesTests: XCTestCase {

    private let card = SignupProgress(emailShown: true, cardShown: true)

    // MARK: - Phases

    func test_phase_atOpening_isPhone() {
        XCTAssertEqual(SignupPhases.phase(progress: .initial, card: .editing), .phone)
    }

    func test_advanced_incompletePhone_opensNothing() {
        XCTAssertEqual(SignupProgress.initial.advanced(phoneGiven: false, phoneSkipped: false, emailValid: false), .initial)
    }

    func test_advanced_phoneGiven_revealsEmail() {
        let progress = SignupProgress.initial.advanced(phoneGiven: true, phoneSkipped: false, emailValid: false)
        XCTAssertEqual(SignupPhases.phase(progress: progress, card: .editing), .email)
    }

    func test_advanced_phoneSkipped_revealsEmail() {
        let progress = SignupProgress.initial.advanced(phoneGiven: false, phoneSkipped: true, emailValid: false)
        XCTAssertTrue(progress.emailShown)
    }

    func test_advanced_validEmailAfterEmailShown_revealsCard() {
        let email = SignupProgress.initial.advanced(phoneGiven: false, phoneSkipped: true, emailValid: false)
        let progress = email.advanced(phoneGiven: false, phoneSkipped: true, emailValid: true)
        XCTAssertEqual(SignupPhases.phase(progress: progress, card: .editing), .card)
    }

    func test_advanced_validEmailWithoutPhoneOrSkip_neverOpensCard() {
        XCTAssertFalse(SignupProgress.initial.advanced(phoneGiven: false, phoneSkipped: false, emailValid: true).cardShown)
    }

    func test_advanced_isMonotone_correctingTheAddressClosesNothing() {
        XCTAssertEqual(card.advanced(phoneGiven: false, phoneSkipped: false, emailValid: false), card)
    }

    func test_phase_accountAwaitingItsCode_isCode() {
        XCTAssertEqual(SignupPhases.phase(progress: card, card: .awaitingCode(signedIn: true)), .code)
    }

    func test_phase_accountVerified_isVerified() {
        XCTAssertEqual(SignupPhases.phase(progress: card, card: .verified), .verified)
    }

    // MARK: - Bouton principal

    func test_primaryAction_beforeTheCard_isADisabledSignUp() {
        XCTAssertEqual(SignupPhases.primaryAction(progress: .initial, card: .editing, formReady: true), .signUp(enabled: false))
    }

    func test_primaryAction_cardShown_signUpIsEnabled_withoutCode() {
        XCTAssertEqual(SignupPhases.primaryAction(progress: card, card: .editing, formReady: true), .signUp(enabled: true))
    }

    func test_primaryAction_cardCarriesARefusal_staysDisabled() {
        XCTAssertEqual(SignupPhases.primaryAction(progress: card, card: .editing, formReady: false), .signUp(enabled: false))
    }

    func test_primaryAction_createdAndHeldSession_entersWithoutCode() {
        XCTAssertEqual(SignupPhases.primaryAction(progress: card, card: .awaitingCode(signedIn: true), formReady: true), .signUp(enabled: true))
    }

    func test_primaryAction_accountWithoutSession_entersOnlyByItsCode() {
        XCTAssertEqual(SignupPhases.primaryAction(progress: card, card: .awaitingCode(signedIn: false), formReady: true), .signUp(enabled: false))
    }

    func test_primaryAction_verified_becomesTalkToOthers() {
        XCTAssertEqual(SignupPhases.primaryAction(progress: card, card: .verified, formReady: false), .talk)
    }

    // MARK: - Alerte « sans numéro » (#8040)

    func test_shouldNudgePhone_noPhone_nudges() {
        XCTAssertTrue(SignupPhases.shouldNudgePhone(hasPhone: false, phoneSkipped: false))
    }

    func test_shouldNudgePhone_emailOnlyChosen_staysSilent() {
        XCTAssertFalse(SignupPhases.shouldNudgePhone(hasPhone: false, phoneSkipped: true))
    }

    func test_shouldNudgePhone_phoneGiven_staysSilent() {
        XCTAssertFalse(SignupPhases.shouldNudgePhone(hasPhone: true, phoneSkipped: false))
    }
}

/// #8288 — la vague de frappe du composeur universel, rejouée par le verre du
/// téléphone de l'inscription. Miroir web : `apps/web/src/lib/view/typing-wave.ts`.
final class TypingWaveTests: XCTestCase {

    func test_stretch_matchesTheUniversalComposerBar() {
        XCTAssertEqual(TypingWave.stretchX, 1.015)
        XCTAssertEqual(TypingWave.squashY, 0.97)
    }

    func test_scale_atRest_isIdentity() {
        XCTAssertEqual(TypingWave.scale(waving: false, reduceMotion: false), TypingWave.Scale(x: 1, y: 1))
    }

    func test_scale_waving_stretchesAndSquashes() {
        XCTAssertEqual(TypingWave.scale(waving: true, reduceMotion: false), TypingWave.Scale(x: 1.015, y: 0.97))
    }

    func test_scale_reduceMotion_neverMoves() {
        XCTAssertEqual(TypingWave.scale(waving: true, reduceMotion: true), TypingWave.Scale(x: 1, y: 1))
    }
}
