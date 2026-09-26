import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
private final class MockSignInLinkAuthorizer: SignInLinkAuthorizing {
    nonisolated deinit {}
    static let proven = EmailProvenSession(
        token: "jwt-link",
        sessionToken: "session-link",
        user: MeeshyUser(id: "link-user", username: "link", displayName: "Link")
    )

    var isAuthenticated = false
    var currentUser: MeeshyUser?
    var emailResult: Result<EmailProvenSession?, Error> = .success(MockSignInLinkAuthorizer.proven)
    var magicResult: Result<EmailProvenSession, Error> = .success(MockSignInLinkAuthorizer.proven)
    private(set) var openedSessions: [String] = []
    private(set) var events: [String] = []

    func logout() async {
        events.append("logout")
        isAuthenticated = false
    }

    func verifyEmail(_ request: EmailVerificationRequest) async throws -> EmailProvenSession? {
        events.append("verify")
        return try emailResult.get()
    }

    func verifyMagicLink(token: String) async throws -> EmailProvenSession {
        events.append("verify")
        return try magicResult.get()
    }

    func openSession(_ proven: EmailProvenSession) {
        events.append("open")
        openedSessions.append(proven.token)
        isAuthenticated = true
    }
}

/// #8076 — un lien reçu par e-mail ouvert PENDANT que l'écran de connexion
/// présente une porte d'accès (feuille du code, lien de connexion, inscription)
/// ne pose plus la session sous la feuille : il la prouve, demande à l'hôte de
/// refermer sa présentation, et la session s'ouvre une fois la feuille partie —
/// la même séquence que le code (#8059).
@MainActor
final class SignInLinkDuringPresentationTests: XCTestCase {

    private func makeSUT(presenting: Bool) -> (gate: SessionOpeningGate, auth: MockSignInLinkAuthorizer, toasts: MockFeedbackToast) {
        let gate = SessionOpeningGate()
        if presenting { gate.presentationBegan() }
        return (gate, MockSignInLinkAuthorizer(), MockFeedbackToast())
    }

    func test_verificationLink_whileCodeSheetPresented_dismissesFirstThenOpensSession() async {
        let (gate, auth, toasts) = makeSUT(presenting: true)

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate)

        XCTAssertEqual(auth.openedSessions, [], "la session ne doit pas s'ouvrir sous la feuille")
        XCTAssertTrue(gate.dismissalRequested)

        gate.presentationEnded()

        XCTAssertEqual(auth.openedSessions, ["jwt-link"])
        XCTAssertFalse(gate.dismissalRequested)
    }

    func test_magicLink_whilePresentationShown_dismissesFirstThenOpensSession() async {
        let (gate, auth, toasts) = makeSUT(presenting: true)

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate)

        XCTAssertEqual(auth.openedSessions, [])
        XCTAssertTrue(gate.dismissalRequested)

        gate.presentationEnded()

        XCTAssertEqual(auth.openedSessions, ["jwt-link"])
    }

    func test_link_withoutPresentation_opensSessionAtOnce() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate)

        XCTAssertEqual(auth.openedSessions, ["jwt-link"])
        XCTAssertFalse(gate.dismissalRequested)
        XCTAssertEqual(toasts.successMessages.count, 1)
    }

    func test_refusedLink_whilePresented_leavesThePresentationInPlace() async {
        let (gate, auth, toasts) = makeSUT(presenting: true)
        auth.emailResult = .failure(MeeshyError.server(statusCode: 400, message: "Lien expiré"))

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate)
        gate.presentationEnded()

        XCTAssertFalse(gate.dismissalRequested)
        XCTAssertEqual(auth.openedSessions, [])
        XCTAssertEqual(toasts.errorMessages.count, 1)
    }

    func test_verifiedWithoutSession_opensNothing() async {
        let (gate, auth, toasts) = makeSUT(presenting: true)
        auth.emailResult = .success(nil)

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate)

        XCTAssertFalse(gate.dismissalRequested)
        XCTAssertEqual(auth.openedSessions, [])
        XCTAssertEqual(toasts.successMessages.count, 1)
    }

    /// Le compte courant est ENTIÈREMENT déconnecté (caches, sockets, clés
    /// E2EE) AVANT que le lien ne soit validé — jamais une session posée sur
    /// une autre encore vivante.
    func test_magicLink_whileAnotherAccountIsSignedIn_signsOutBeforeValidating() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        auth.isAuthenticated = true

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate)

        XCTAssertEqual(auth.events, ["logout", "verify", "open"])
    }

    func test_verificationLink_ofTheSignedInAccount_keepsItsSession() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        auth.isAuthenticated = true
        auth.currentUser = MeeshyUser(id: "me", username: "me", email: "A@b.co")

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate)

        XCTAssertEqual(auth.events, ["verify", "open"])
    }

    // MARK: - SessionOpeningGate

    func test_gate_codeHandOff_waitsForTheSheetWithoutForcingItClosed() {
        let gate = SessionOpeningGate()
        gate.presentationBegan()
        var opened = 0

        gate.openWhenDismissed { opened += 1 }

        XCTAssertEqual(opened, 0)
        XCTAssertFalse(gate.dismissalRequested, "la saisie du code se referme elle-même, après « Email vérifié ! »")

        gate.presentationEnded()
        gate.presentationEnded()

        XCTAssertEqual(opened, 1)
    }

    func test_gate_withoutPresentation_opensAtOnce() {
        let gate = SessionOpeningGate()
        var opened = 0

        gate.openWhenDismissed { opened += 1 }
        gate.open { opened += 1 }

        XCTAssertEqual(opened, 2)
        XCTAssertFalse(gate.dismissalRequested)
    }
}
