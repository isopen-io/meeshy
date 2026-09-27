import XCTest
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

@MainActor
private final class SignupCardConfirmer: EmailVerificationConfirming {
    nonisolated deinit {}
    static let proven = EmailProvenSession(
        token: "jwt-code",
        sessionToken: "session-code",
        user: MeeshyUser(id: "code-user", username: "awa", displayName: "Awa")
    )
    var result: Result<EmailProvenSession?, Error> = .success(SignupCardConfirmer.proven)
    private(set) var requests: [EmailVerificationRequest] = []
    private(set) var opened: [EmailProvenSession] = []

    func verifyEmail(_ request: EmailVerificationRequest) async throws -> EmailProvenSession? {
        requests.append(request)
        return try result.get()
    }

    func openSession(_ proven: EmailProvenSession) {
        opened.append(proven)
    }
}

private final class ScriptedProofWatcher: EmailVerificationWatching, @unchecked Sendable {
    private let status: EmailVerificationWatchStatus
    init(_ status: EmailVerificationWatchStatus) { self.status = status }
    func emailVerificationStatus(pendingSessionToken: String) async throws -> EmailVerificationWatchStatus { status }
}

/// #8288 — la carte d'identité de l'inscription : « Valider mon compte
/// maintenant » crée le compte et y fait paraître le code ; le code juste — ou
/// le lien ouvert ailleurs — valide le compte ; « Parler aux autres » pose la
/// session et mène à l'onboarding. Aucune seconde machine : l'inscription
/// (`SignupRegistering`), le code (`EmailVerificationViewModel`).
@MainActor
final class SignupViewModelPhasesTests: XCTestCase {

    private static let held = EmailProvenSession(
        token: "jwt-held",
        sessionToken: "session-held",
        user: MeeshyUser(id: "held-user", username: "awa", displayName: "Awa"),
        origin: .registration
    )

    private func makeSUT(
        proof: EmailVerificationWatchStatus = .pending
    ) -> (sut: SignupViewModel, registrar: MockSignupRegistrar, confirmer: SignupCardConfirmer, celebration: MockArrivalCelebration) {
        let registrar = MockSignupRegistrar()
        let confirmer = SignupCardConfirmer()
        let celebration = MockArrivalCelebration()
        let watcher = ScriptedProofWatcher(proof)
        let sut = SignupViewModel(
            registrar: registrar,
            locale: Locale(identifier: "fr_FR"),
            referrals: MockPendingReferralStore(),
            confirmer: confirmer,
            celebration: celebration,
            makeCodeEntry: { step in
                EmailVerificationViewModel(
                    email: step.email,
                    accountCreated: true,
                    pendingSessionToken: step.pendingSessionToken,
                    authService: MockAuthServiceSDK(),
                    confirmer: confirmer,
                    watcher: watcher,
                    watchInterval: .zero,
                    watchLimit: .seconds(1),
                    celebration: celebration,
                    sessionOrigin: .registration,
                    celebratesArrival: false
                )
            }
        )
        return (sut, registrar, confirmer, celebration)
    }

    private func toCard(_ sut: SignupViewModel) {
        sut.skipPhone()
        sut.form.email = "awa@example.com"
    }

    // MARK: - Phases 1 à 3

    func test_skipPhone_revealsTheEmail() {
        let (sut, _, _, _) = makeSUT()
        XCTAssertEqual(sut.phase, .phone)
        sut.skipPhone()
        XCTAssertEqual(sut.phase, .email)
    }

    func test_plausiblePhone_revealsTheEmail() {
        let (sut, _, _, _) = makeSUT()
        sut.form.phoneDigits = "0612"
        XCTAssertEqual(sut.phase, .phone)
        sut.form.phoneDigits = "0612345678"
        XCTAssertEqual(sut.phase, .email)
    }

    func test_coherentEmail_revealsTheCard_andSignUpIsEnabled() {
        let (sut, _, _, _) = makeSUT()
        toCard(sut)
        XCTAssertEqual(sut.phase, .card)
        XCTAssertEqual(sut.primaryAction, .signUp(enabled: true))
    }

    // MARK: - Phase 4 — le code dans la carte

    func test_validateNow_createsTheAccount_holdsTheSession_andShowsTheCode() async {
        let (sut, registrar, confirmer, _) = makeSUT()
        registrar.holdResult = .success(.session(Self.held, pendingSessionToken: "attente-1"))
        toCard(sut)

        let created = await sut.validateNow()

        XCTAssertTrue(created)
        XCTAssertEqual(registrar.holdCallCount, 1)
        XCTAssertEqual(registrar.registerCallCount, 0, "la carte TIENT la session, elle ne la pose pas")
        XCTAssertEqual(sut.phase, .code)
        XCTAssertEqual(sut.codeEntry?.pendingSessionToken, "attente-1")
        XCTAssertEqual(sut.codeEntry?.email, "awa@example.com")
        XCTAssertTrue(confirmer.opened.isEmpty, "aucune session posée tant que la carte attend son code")
    }

    func test_validateNow_usernameTaken_staysOnTheCard_withSuggestions() async {
        let (sut, registrar, _, _) = makeSUT()
        registrar.holdResult = .failure(MeeshyError.rejected(APIRejection(
            statusCode: 409, code: "USERNAME_TAKEN", field: "username",
            message: "pris", suggestions: ["awa2", "awa3"], violations: []
        )))
        toCard(sut)

        let created = await sut.validateNow()

        XCTAssertFalse(created)
        XCTAssertEqual(sut.phase, .card)
        XCTAssertEqual(sut.usernameSuggestions, ["awa2", "awa3"])
        XCTAssertNil(sut.codeEntry)
    }

    func test_correctCode_verifiesTheAccount_andTheButtonBecomesTalk() async {
        let (sut, registrar, _, _) = makeSUT()
        registrar.holdResult = .success(.session(Self.held, pendingSessionToken: nil))
        toCard(sut)
        await sut.validateNow()

        await sut.codeEntry?.verifyCode("123456")

        XCTAssertEqual(sut.phase, .verified)
        XCTAssertEqual(sut.primaryAction, .talk)
    }

    func test_talk_afterTheCode_opensTheProvenSession_asARegistration_withoutASecondCelebration() async {
        let (sut, registrar, confirmer, celebration) = makeSUT()
        registrar.holdResult = .success(.session(Self.held, pendingSessionToken: nil))
        toCard(sut)
        await sut.validateNow()
        await sut.codeEntry?.verifyCode("123456")

        sut.sessionOpener()?()

        XCTAssertEqual(confirmer.opened.map(\.token), ["jwt-code"])
        XCTAssertEqual(confirmer.opened.first?.origin, .registration)
        XCTAssertTrue(celebration.celebratedUserIds.isEmpty, "le feu d'artifice a déjà joué DANS la carte")
    }

    func test_linkOpenedElsewhere_isReflectedInTheCard_andOpensTheHeldSession() async {
        let (sut, registrar, confirmer, _) = makeSUT(proof: .proven)
        registrar.holdResult = .success(.session(Self.held, pendingSessionToken: "attente-1"))
        toCard(sut)
        await sut.validateNow()

        await sut.codeEntry?.watchProof()

        XCTAssertEqual(sut.phase, .verified)
        sut.sessionOpener()?()
        XCTAssertEqual(confirmer.opened.map(\.token), ["jwt-held"])
    }

    func test_signUpWithoutCode_opensTheHeldSession_withoutRegisteringTwice() async {
        let (sut, registrar, confirmer, _) = makeSUT()
        registrar.holdResult = .success(.session(Self.held, pendingSessionToken: nil))
        toCard(sut)
        await sut.validateNow()

        XCTAssertEqual(sut.primaryAction, .signUp(enabled: true))
        sut.sessionOpener()?()

        XCTAssertEqual(registrar.holdCallCount, 1)
        XCTAssertEqual(registrar.registerCallCount, 0)
        XCTAssertEqual(confirmer.opened.map(\.token), ["jwt-held"])
    }

    /// Une revendication d'adresse (#8214) n'a pas de session : elle n'entre
    /// que par son code, et le lien ouvert ailleurs ne l'ouvre pas ici.
    func test_accountWithoutSession_waitsForItsCodeInTheCard() async {
        let (sut, registrar, _, _) = makeSUT(proof: .proven)
        registrar.registerResult = .success(.verificationRequired(PendingEmailVerification(email: "awa@example.com", accountCreated: true, pendingSessionToken: "attente-2")))
        toCard(sut)

        await sut.submit()
        await sut.codeEntry?.watchProof()

        XCTAssertEqual(sut.phase, .code)
        XCTAssertEqual(sut.primaryAction, .signUp(enabled: false))
        XCTAssertNil(sut.sessionOpener())
    }

    // MARK: - L'alerte « sans numéro » (#8040)

    func test_requestSubmit_emailOnlyChosen_createsWithoutNudging() async {
        let (sut, registrar, _, _) = makeSUT()
        toCard(sut)

        let outcome = await sut.requestSubmit()

        XCTAssertEqual(outcome, .created)
        XCTAssertFalse(sut.isPhoneNudgePresented)
        XCTAssertEqual(registrar.registerCallCount, 1)
    }
}
