import XCTest
@testable import Meeshy
import MeeshySDK

/// #10872 — un lien de connexion que cet appareil n'a PAS demandé (ouvert
/// ailleurs, ou forgé par un tiers qui l'a demandé pour SON compte) n'ouvre
/// rien sans « oui » : la passerelle rend l'identité, l'app la fait confirmer,
/// et seul le « oui » rejoue la preuve avec `confirm`.
@MainActor
final class SignInLinkDeviceConfirmationTests: XCTestCase {

    private static let attacker = LinkSignInAccount(id: "attacker", username: "mallory", displayName: "Mallory")

    private func makeSUT(decision: AccountReplacementDecision = .accepted)
        -> (auth: ConfirmingAuthorizer, toasts: MockFeedbackToast, signIn: MockLinkSignInConfirmation, replacement: CountingReplacementConfirmation) {
        (ConfirmingAuthorizer(), MockFeedbackToast(), MockLinkSignInConfirmation(decision: decision), CountingReplacementConfirmation())
    }

    private func open(_ link: SignInLink, _ sut: (auth: ConfirmingAuthorizer, toasts: MockFeedbackToast, signIn: MockLinkSignInConfirmation, replacement: CountingReplacementConfirmation)) async {
        await SignInLinkOpener.open(
            link, auth: sut.auth, toasts: sut.toasts, sessionGate: SessionOpeningGate(),
            celebration: MockArrivalCelebration(), confirmation: sut.replacement, signInConfirmation: sut.signIn
        )
    }

    func test_sameDevice_opensTheSession_withoutAnyQuestion() async {
        let sut = makeSUT()
        sut.auth.requiresConfirmationUnlessConfirmed = false

        await open(.magic(token: "m"), sut)

        XCTAssertEqual(sut.auth.confirmations, [false])
        XCTAssertEqual(sut.signIn.asked, [])
        XCTAssertEqual(sut.auth.openedSessions, ["jwt-mallory"])
    }

    func test_otherDevice_declined_opensNothing_andProvesOnlyOnce() async {
        let sut = makeSUT(decision: .declined)

        await open(.magic(token: "m"), sut)

        XCTAssertEqual(sut.signIn.asked, ["mallory"])
        XCTAssertEqual(sut.auth.confirmations, [false], "aucune preuve rejouée sans « oui »")
        XCTAssertEqual(sut.auth.openedSessions, [])
        XCTAssertEqual(sut.auth.switchedSessions, [])
        XCTAssertEqual(sut.toasts.successMessages, [])
    }

    func test_otherDevice_accepted_replaysWithConfirm_thenOpens() async {
        let sut = makeSUT(decision: .accepted)

        await open(.emailVerification(token: "t", email: "a@b.co"), sut)

        XCTAssertEqual(sut.auth.confirmations, [false, true])
        XCTAssertEqual(sut.auth.openedSessions, ["jwt-mallory"])
    }

    func test_aClaimQuestion_reachesTheSheet_withWhatTheYesDoes_andTheMaskedAddress() async {
        let sut = makeSUT(decision: .declined)
        let claim = LinkConfirmationRequired(account: Self.attacker, intent: .claimEmail, maskedEmail: "ma....e@e*****om")
        sut.auth.pendingQuestion = claim

        await open(.emailVerification(token: "t", email: "marie@example.com"), sut)

        XCTAssertEqual(sut.signIn.questions, [claim])
        XCTAssertEqual(sut.auth.openedSessions, [])
    }

    func test_questionUnavailable_saysSo_andOpensNothing() async {
        let sut = makeSUT(decision: .unavailable)

        await open(.magic(token: "m"), sut)

        XCTAssertEqual(sut.auth.openedSessions, [])
        XCTAssertEqual(sut.toasts.errorMessages.count, 1)
    }

    func test_signedInAsTheSameAccount_confirmsByItself() async {
        let sut = makeSUT(decision: .declined)
        sut.auth.isAuthenticated = true
        sut.auth.currentUser = MeeshyUser(id: "attacker", username: "mallory")

        await open(.magic(token: "m"), sut)

        XCTAssertEqual(sut.signIn.asked, [], "rien à usurper : c'est le compte ouvert")
        XCTAssertEqual(sut.auth.confirmations, [false, true])
    }

    func test_signedInAsAnotherAccount_theQuestionNamesIt_andTheYesSwitchesWithoutASecondQuestion() async {
        let sut = makeSUT(decision: .accepted)
        sut.auth.isAuthenticated = true
        sut.auth.currentUser = MeeshyUser(id: "me", username: "moi")

        await open(.magic(token: "m"), sut)

        XCTAssertEqual(sut.signIn.signedIn, ["moi"])
        XCTAssertEqual(sut.replacement.count, 0)
        XCTAssertEqual(sut.auth.switchedSessions, ["jwt-mallory"])
        XCTAssertEqual(sut.auth.openedSessions, [])
    }

    func test_signedInAsAnotherAccount_declined_keepsTheOpenAccount() async {
        let sut = makeSUT(decision: .declined)
        sut.auth.isAuthenticated = true
        sut.auth.currentUser = MeeshyUser(id: "me", username: "moi")

        await open(.magic(token: "m"), sut)

        XCTAssertEqual(sut.auth.switchedSessions, [])
        XCTAssertEqual(sut.auth.currentUser?.id, "me")
    }

    func test_questionText_namesTheLinkAccount_andTheOpenOne() {
        XCTAssertTrue(LinkSignInConfirmationContent(account: Self.attacker, signedIn: nil).title.contains("@mallory"))
        let replacing = LinkSignInConfirmationContent(account: Self.attacker, signedIn: MeeshyUser(id: "me", username: "moi", displayName: "Moi")).message
        XCTAssertTrue(replacing.contains("Mallory (@mallory)"))
        XCTAssertTrue(replacing.contains("Moi (@moi)"))
    }
}

@MainActor
private final class ConfirmingAuthorizer: SignInLinkAuthorizing {
    nonisolated deinit {}
    var isAuthenticated = false
    var currentUser: MeeshyUser?
    var requiresConfirmationUnlessConfirmed = true
    var pendingQuestion = LinkConfirmationRequired(account: LinkSignInAccount(id: "attacker", username: "mallory", displayName: "Mallory"))
    private(set) var confirmations: [Bool] = []
    private(set) var openedSessions: [String] = []
    private(set) var switchedSessions: [String] = []

    private func prove(confirmed: Bool) throws -> EmailProvenSession {
        confirmations.append(confirmed)
        if requiresConfirmationUnlessConfirmed && !confirmed {
            throw pendingQuestion
        }
        return EmailProvenSession(token: "jwt-mallory", sessionToken: nil, user: MeeshyUser(id: "attacker", username: "mallory"))
    }

    func verifyEmail(_ request: EmailVerificationRequest) async throws -> EmailProvenSession? {
        try prove(confirmed: request.confirm == true)
    }

    func verifyMagicLink(token: String, confirmed: Bool) async throws -> EmailProvenSession {
        try prove(confirmed: confirmed)
    }

    func openSession(_ proven: EmailProvenSession) -> Bool {
        openedSessions.append(proven.token)
        isAuthenticated = true
        return true
    }

    func switchToProvenAccount(_ proven: EmailProvenSession) async -> ProvenAccountSwitchOutcome {
        switchedSessions.append(proven.token)
        currentUser = proven.user
        return .switched
    }

    func discardProvenSession(_ proven: EmailProvenSession) async {}
}

@MainActor
private final class MockLinkSignInConfirmation: LinkSignInConfirming {
    nonisolated deinit {}
    let decision: AccountReplacementDecision
    private(set) var asked: [String] = []
    private(set) var questions: [LinkConfirmationRequired] = []
    private(set) var signedIn: [String] = []

    init(decision: AccountReplacementDecision) { self.decision = decision }

    func confirmSignIn(_ question: LinkConfirmationRequired, signedIn current: MeeshyUser?) async -> AccountReplacementDecision {
        asked.append(question.account.username)
        questions.append(question)
        if let current { signedIn.append(current.username) }
        return decision
    }
}

@MainActor
private final class CountingReplacementConfirmation: AccountReplacementConfirming {
    nonisolated deinit {}
    private(set) var count = 0

    func confirmReplacing(signedIn current: MeeshyUser?, with incoming: MeeshyUser) async -> AccountReplacementDecision {
        count += 1
        return .declined
    }
}
