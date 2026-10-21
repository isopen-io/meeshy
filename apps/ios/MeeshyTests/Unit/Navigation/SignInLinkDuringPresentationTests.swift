import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
private final class MockSignInLinkAuthorizer: SignInLinkAuthorizing {
    nonisolated deinit {}
    /// Datée à CHAQUE lecture (#10513) : l'ouverture lit l'âge de la preuve.
    static var proven: EmailProvenSession { EmailProvenSession(
        token: "jwt-link",
        sessionToken: "session-link",
        user: MeeshyUser(id: "link-user", username: "link", displayName: "Link")
    ) }

    var isAuthenticated = false
    var currentUser: MeeshyUser?
    var emailResult: Result<EmailProvenSession?, Error> = .success(MockSignInLinkAuthorizer.proven)
    var magicResult: Result<EmailProvenSession, Error> = .success(MockSignInLinkAuthorizer.proven)
    private(set) var openedSessions: [String] = []
    private(set) var switchedSessions: [String] = []
    private(set) var discardedSessions: [String] = []
    private(set) var events: [String] = []
    /// Faux ⇒ la garde du SDK refuse la session (#10450).
    var opens = true
    /// Ce que rend la bascule du SDK (#10518).
    var switchOutcome: ProvenAccountSwitchOutcome = .switched

    func verifyEmail(_ request: EmailVerificationRequest) async throws -> EmailProvenSession? {
        events.append("verify")
        return try emailResult.get()
    }

    func verifyMagicLink(token: String, confirmed: Bool) async throws -> EmailProvenSession {
        events.append("verify")
        return try magicResult.get()
    }

    func openSession(_ proven: EmailProvenSession) -> Bool {
        events.append("open")
        openedSessions.append(proven.token)
        guard opens else { return false }
        isAuthenticated = true
        return true
    }

    func switchToProvenAccount(_ proven: EmailProvenSession) async -> ProvenAccountSwitchOutcome {
        events.append("switch")
        switchedSessions.append(proven.token)
        guard switchOutcome == .switched else { return switchOutcome }
        currentUser = proven.user
        isAuthenticated = true
        return .switched
    }

    func discardProvenSession(_ proven: EmailProvenSession) async {
        events.append("discard")
        discardedSessions.append(proven.token)
    }
}

@MainActor
private final class MockAccountReplacementConfirmation: AccountReplacementConfirming {
    nonisolated deinit {}
    let decision: AccountReplacementDecision
    private(set) var questions: [[String]] = []
    private(set) var askedUsers: [(current: MeeshyUser?, incoming: MeeshyUser)] = []

    init(answer: Bool) { self.decision = answer ? .accepted : .declined }
    init(decision: AccountReplacementDecision) { self.decision = decision }

    func confirmReplacing(signedIn current: MeeshyUser?, with incoming: MeeshyUser) async -> AccountReplacementDecision {
        questions.append([current?.username ?? "", incoming.username])
        askedUsers.append((current, incoming))
        return decision
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

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration())

        XCTAssertEqual(auth.openedSessions, [], "la session ne doit pas s'ouvrir sous la feuille")
        XCTAssertTrue(gate.dismissalRequested)

        gate.presentationEnded()

        XCTAssertEqual(auth.openedSessions, ["jwt-link"])
        XCTAssertFalse(gate.dismissalRequested)
    }

    func test_magicLink_whilePresentationShown_dismissesFirstThenOpensSession() async {
        let (gate, auth, toasts) = makeSUT(presenting: true)

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration())

        XCTAssertEqual(auth.openedSessions, [])
        XCTAssertTrue(gate.dismissalRequested)

        gate.presentationEnded()

        XCTAssertEqual(auth.openedSessions, ["jwt-link"])
    }

    func test_link_withoutPresentation_opensSessionAtOnce() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration())

        XCTAssertEqual(auth.openedSessions, ["jwt-link"])
        XCTAssertFalse(gate.dismissalRequested)
        XCTAssertEqual(toasts.successMessages.count, 1)
    }

    func test_refusedLink_whilePresented_leavesThePresentationInPlace() async {
        let (gate, auth, toasts) = makeSUT(presenting: true)
        auth.emailResult = .failure(MeeshyError.server(statusCode: 400, message: "Lien expiré"))

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration())
        gate.presentationEnded()

        XCTAssertFalse(gate.dismissalRequested)
        XCTAssertEqual(auth.openedSessions, [])
        XCTAssertEqual(toasts.errorMessages.count, 1)
    }

    func test_verifiedWithoutSession_opensNothing() async {
        let (gate, auth, toasts) = makeSUT(presenting: true)
        auth.emailResult = .success(nil)

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration())

        XCTAssertFalse(gate.dismissalRequested)
        XCTAssertEqual(auth.openedSessions, [])
        XCTAssertEqual(toasts.successMessages.count, 1)
    }

    // MARK: - #10445 — aucun lien ne déconnecte ; un AUTRE compte se demande

    private func signedInAs(_ auth: MockSignInLinkAuthorizer, id: String = "me", email: String? = "a@b.co") {
        auth.isAuthenticated = true
        auth.currentUser = MeeshyUser(id: id, username: id, email: email)
    }

    /// Fixation de session : un lien magique transmis par un autre compte ne
    /// déconnecte rien AVANT la preuve, et n'ouvre rien sans question.
    func test_magicLink_ofAnotherAccount_provesThenAsks_neverSignsOut() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth)
        let confirmation = MockAccountReplacementConfirmation(answer: false)

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: confirmation)

        XCTAssertEqual(confirmation.questions, [["me", "link"]], "« Ce lien ouvre le compte @link. Quitter @me ? »")
        XCTAssertFalse(auth.events.contains("logout"))
        XCTAssertEqual(auth.events.first, "verify", "rien ne se décide avant la preuve")
    }

    func test_anotherAccount_refused_changesNothing_andClosesTheServedSession() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth)
        let confirmation = MockAccountReplacementConfirmation(answer: false)

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: confirmation)

        XCTAssertEqual(auth.events, ["verify", "discard"])
        XCTAssertEqual(auth.openedSessions, [])
        XCTAssertEqual(auth.switchedSessions, [])
        XCTAssertEqual(auth.discardedSessions, ["jwt-link"])
        XCTAssertTrue(auth.isAuthenticated)
        XCTAssertEqual(auth.currentUser?.id, "me")
        XCTAssertEqual(toasts.successMessages, [])
    }

    /// Accepter passe au compte du lien par le changement de compte, qui GARDE
    /// le compte quitté au sélecteur — jamais par une déconnexion.
    func test_anotherAccount_accepted_switchesKeepingTheCurrentAccount() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth)
        let confirmation = MockAccountReplacementConfirmation(answer: true)

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: confirmation)

        XCTAssertEqual(auth.events, ["verify", "switch"])
        XCTAssertEqual(auth.switchedSessions, ["jwt-link"])
        XCTAssertEqual(auth.openedSessions, [], "la session rendue ne se pose pas par-dessus l'autre")
        XCTAssertEqual(auth.currentUser?.id, "link-user")
        XCTAssertEqual(toasts.successMessages.count, 1)
    }

    /// Le lien nomme l'adresse du compte connecté, mais la passerelle rend la
    /// session d'un AUTRE compte (#8042) : la question se pose sur l'id PROUVÉ.
    func test_verificationLink_servedForAnotherAccount_asksBeforeAnything() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth)
        let confirmation = MockAccountReplacementConfirmation(answer: false)

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: confirmation)

        XCTAssertEqual(confirmation.questions.count, 1)
        XCTAssertEqual(auth.events, ["verify", "discard"])
    }

    func test_verificationLink_ofTheSignedInAccount_rotatesWithoutAsking() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth, id: "link-user", email: "A@b.co")
        let confirmation = MockAccountReplacementConfirmation(answer: false)

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: confirmation)

        XCTAssertEqual(auth.events, ["verify", "open"])
        XCTAssertEqual(confirmation.questions, [])
    }

    /// L'adresse écrite dans le lien ne décide plus rien : un lien de
    /// vérification à une AUTRE adresse, qui prouve le compte connecté, est
    /// une rotation — l'ancienne garde déconnectait avant même la preuve.
    func test_verificationLink_atAnotherAddress_ofTheSignedInAccount_rotatesWithoutAsking() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth, id: "link-user", email: nil)
        let confirmation = MockAccountReplacementConfirmation(answer: false)

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "autre@b.co"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: confirmation)

        XCTAssertEqual(auth.events, ["verify", "open"])
        XCTAssertEqual(confirmation.questions, [])
    }

    /// Un lien bidon sur un appareil connecté : une erreur, et la session reste.
    func test_invalidMagicLink_whileSignedIn_keepsTheSession() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth)
        auth.magicResult = .failure(MeeshyError.server(statusCode: 400, message: "Lien expiré"))
        let confirmation = MockAccountReplacementConfirmation(answer: true)

        await SignInLinkOpener.open(.magic(token: "bidon"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: confirmation)

        XCTAssertEqual(auth.events, ["verify"])
        XCTAssertTrue(auth.isAuthenticated)
        XCTAssertEqual(auth.currentUser?.id, "me")
        XCTAssertEqual(confirmation.questions, [])
        XCTAssertEqual(toasts.errorMessages.count, 1)
    }

    func test_refusedLink_ofTheSignedInAddress_keepsTheSession() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth)
        auth.emailResult = .failure(MeeshyError.server(statusCode: 400, message: "Lien expiré"))

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: MockAccountReplacementConfirmation(answer: true))

        XCTAssertEqual(auth.events, ["verify"])
        XCTAssertTrue(auth.isAuthenticated)
    }

    /// Un compte à second facteur : l'adresse est prouvée, aucune session n'est
    /// rendue — jamais « Email vérifié ! », jamais « Lien invalide ».
    func test_secondFactorAccount_saysSo_neverEmailVerified() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        auth.emailResult = .failure(SecondFactorRequired(twoFactorToken: "2fa"))

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: MockAccountReplacementConfirmation(answer: true))

        XCTAssertEqual(toasts.successMessages, [])
        XCTAssertEqual(toasts.errorMessages, [EmailProofErrorText.linkMessage(for: SecondFactorRequired(twoFactorToken: nil))])
        XCTAssertNotEqual(toasts.errorMessages.first, EmailProofErrorText.linkMessage(for: MeeshyError.server(statusCode: 400, message: "x")))
        XCTAssertEqual(auth.openedSessions, [])
    }

    func test_secondFactorMagicLink_whileSignedIn_keepsTheSession() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth)
        auth.magicResult = .failure(SecondFactorRequired(twoFactorToken: "2fa"))

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: MockAccountReplacementConfirmation(answer: true))

        XCTAssertEqual(auth.events, ["verify"])
        XCTAssertTrue(auth.isAuthenticated)
        XCTAssertEqual(toasts.successMessages, [])
    }

    // MARK: - #10450 — un succès ne s'annonce que sur une session POSÉE

    func test_link_refusedByTheDevice_announcesNoSuccess() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        auth.opens = false
        let celebration = MockArrivalCelebration()

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate, celebration: celebration)

        XCTAssertEqual(auth.openedSessions, ["jwt-link"])
        XCTAssertEqual(toasts.successMessages, [], "jamais « Connexion réussie ! » sur une session refusée")
        XCTAssertEqual(toasts.errorMessages, [EmailProofErrorText.sessionNotOpened()])
        XCTAssertEqual(celebration.celebratedUserIds, [])
    }

    /// Sous une feuille, le succès attend que la session soit vraiment posée.
    func test_link_whilePresented_announcesItsSuccessOnlyOnceTheSessionIsPosted() async {
        let (gate, auth, toasts) = makeSUT(presenting: true)

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration())

        XCTAssertEqual(toasts.successMessages, [])
        gate.presentationEnded()
        XCTAssertEqual(toasts.successMessages.count, 1)
    }

    /// #10513, #10518 — accepter après la fenêtre d'adoption : le SDK rend
    /// « expiré » (et referme lui-même la session), le compte ouvert le reste,
    /// et l'écran dit que le lien a expiré — pas qu'un autre compte est ouvert.
    func test_open_anotherAccountAcceptedPastTheAdoptionWindow_saysTheLinkExpired() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth)
        auth.switchOutcome = .refused(.expired)
        let confirmation = MockAccountReplacementConfirmation(answer: true)

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: confirmation)

        XCTAssertEqual(auth.events, ["verify", "switch"], "la fenêtre se juge dans le SDK, à un seul endroit")
        XCTAssertEqual(auth.currentUser?.id, "me")
        XCTAssertEqual(toasts.successMessages, [])
        XCTAssertEqual(toasts.errorMessages, [EmailProofErrorText.linkExpired()])
    }

    /// #10518 — l'écran ne lit plus la fenêtre lui-même : une preuve qu'il
    /// croirait vieille part quand même au SDK, seul juge.
    func test_open_anotherAccountAccepted_neverJudgesTheWindowItself() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth)
        let stale = MockSignInLinkAuthorizer.proven
        auth.magicResult = .success(EmailProvenSession(
            token: stale.token, sessionToken: stale.sessionToken, user: stale.user,
            receivedAt: Date().addingTimeInterval(-(ProvenAdoptionWindow.clientMax + 1))))

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: MockAccountReplacementConfirmation(answer: true))

        XCTAssertEqual(auth.events, ["verify", "switch"])
    }

    func test_accountSwitchMessage_eachRefusal_saysItsOwnReason() {
        XCTAssertEqual(EmailProofErrorText.accountSwitchMessage(for: .expired), EmailProofErrorText.linkExpired())
        XCTAssertEqual(EmailProofErrorText.accountSwitchMessage(for: .failed), EmailProofErrorText.sessionNotOpened())
        XCTAssertNotEqual(EmailProofErrorText.accountSwitchMessage(for: .expired),
                          EmailProofErrorText.accountSwitchMessage(for: .failed))
    }

    func test_anotherAccount_accepted_butNotInstalled_announcesNoSuccess() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth)
        auth.switchOutcome = .refused(.failed)
        let confirmation = MockAccountReplacementConfirmation(answer: true)

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: confirmation)

        XCTAssertEqual(auth.events, ["verify", "switch"], "le SDK referme lui-même la session qu'il n'a pas posée")
        XCTAssertEqual(auth.currentUser?.id, "me")
        XCTAssertEqual(toasts.successMessages, [])
        XCTAssertEqual(toasts.errorMessages, [EmailProofErrorText.sessionNotOpened()])
    }

    // MARK: - #10450 — la question dit « un AUTRE compte » et nomme les deux

    func test_question_receivesBothAccounts_withTheirNamesAndHandles() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        auth.isAuthenticated = true
        auth.currentUser = MeeshyUser(id: "me", username: "moi", displayName: "Moi Même")
        let confirmation = MockAccountReplacementConfirmation(answer: false)

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: confirmation)

        XCTAssertEqual(confirmation.askedUsers.first?.current?.displayName, "Moi Même")
        XCTAssertEqual(confirmation.askedUsers.first?.incoming.displayName, "Link")
        XCTAssertEqual(confirmation.askedUsers.first?.incoming.username, "link")
    }

    func test_accountLabel_showsTheDisplayNameAndTheHandle() {
        XCTAssertEqual(AccountReplacementAlert.label(displayName: "Awa Diallo", username: "awa"), "Awa Diallo (@awa)")
        XCTAssertEqual(AccountReplacementAlert.label(displayName: "  ", username: "awa"), "@awa")
        XCTAssertEqual(AccountReplacementAlert.label(displayName: nil, username: "awa"), "@awa")
        XCTAssertEqual(AccountReplacementAlert.label(displayName: "awa", username: "awa"), "@awa")
    }

    func test_alert_saysAnotherAccount_inEveryLanguage() throws {
        let catalog = try AppSourceGuard.unit("Meeshy/Localizable.xcstrings")
        let data = try XCTUnwrap(catalog.data(using: .utf8))
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        let languages = ["fr", "en", "es", "de", "it", "pt-BR", "ar"]
        for key in ["signInLink.switchAccount.title", "signInLink.switchAccount.message",
                    "signInLink.switchAccount.messageUnknownCurrent", "emailProof.sessionNotOpened"] {
            let entry = try XCTUnwrap(strings[key] as? [String: Any], key)
            let localizations = try XCTUnwrap(entry["localizations"] as? [String: Any], key)
            XCTAssertEqual(Set(localizations.keys), Set(languages), key)
        }
    }

    /// « Annuler » est l'action mise en avant ; une question qui ne s'est pas
    /// présentée, ou qui a été retirée sans bouton, répond « non ».
    func test_alert_prefersCancel_andAlwaysAnswers() throws {
        let opener = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Auth/SignInLinkOpener.swift"))

        XCTAssertTrue(opener.contains("alert.preferredAction = cancel"))
        XCTAssertTrue(opener.contains("override func viewDidDisappear"))
        XCTAssertGreaterThanOrEqual(opener.components(separatedBy: "presentingViewController == nil").count - 1, 3,
                                    "présentation refusée, complétion sans parent, sortie sans bouton")
    }

    /// La réponse est UNIQUE : la première l'emporte, et une question libérée
    /// sans réponse dit « non » au lieu de laisser la reprise en suspens.
    func test_answer_isGivenOnce_andAReleasedQuestionSaysNo() async {
        let first = await withCheckedContinuation { continuation in
            let answer = AccountReplacementAnswer(continuation)
            answer.give(.accepted)
            answer.give(.declined)
        }
        let released = await withCheckedContinuation { continuation in
            _ = AccountReplacementAnswer(continuation)
        }

        XCTAssertEqual(first, .accepted)
        XCTAssertEqual(released, .unavailable, "personne n'a répondu : ni oui, ni un refus silencieux")
    }

    // MARK: - #10463 F6 — une question qui ne s'est pas posée se DIT

    /// L'alerte n'a pas pu se présenter : rien ne s'ouvre, la session prouvée
    /// est refermée, et l'utilisateur lit pourquoi le lien n'a rien fait —
    /// au lieu d'un refus qu'il n'a jamais exprimé.
    func test_anotherAccount_questionNotShown_saysSo_andClosesTheServedSession() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth)
        let confirmation = MockAccountReplacementConfirmation(decision: .unavailable)

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: confirmation)

        XCTAssertEqual(auth.events, ["verify", "discard"])
        XCTAssertEqual(auth.discardedSessions, ["jwt-link"])
        XCTAssertEqual(auth.switchedSessions, [])
        XCTAssertEqual(auth.currentUser?.id, "me")
        XCTAssertEqual(toasts.successMessages, [])
        XCTAssertEqual(toasts.errorMessages, [EmailProofErrorText.sessionNotOpened()])
    }

    /// Un « Annuler » touché reste silencieux : l'utilisateur sait ce qu'il a fait.
    func test_anotherAccount_declined_raisesNoError() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth)
        let confirmation = MockAccountReplacementConfirmation(decision: .declined)

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration(), confirmation: confirmation)

        XCTAssertEqual(auth.discardedSessions, ["jwt-link"])
        XCTAssertEqual(toasts.errorMessages, [])
    }

    func test_replacesSignedInAccount_judgesOnTheProvenId() {
        XCTAssertTrue(SignInLink.replacesSignedInAccount(provenUserId: "b", isAuthenticated: true, currentUserId: "a"))
        XCTAssertTrue(SignInLink.replacesSignedInAccount(provenUserId: "b", isAuthenticated: true, currentUserId: nil))
        XCTAssertFalse(SignInLink.replacesSignedInAccount(provenUserId: "a", isAuthenticated: true, currentUserId: "a"))
        XCTAssertFalse(SignInLink.replacesSignedInAccount(provenUserId: "b", isAuthenticated: false, currentUserId: "a"))
    }

    /// La décision avant preuve a disparu de la source : seule l'id prouvée tranche.
    func test_noLinkDecidesBeforeTheProof() throws {
        let opener = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Auth/SignInLinkOpener.swift"))

        XCTAssertFalse(opener.contains("requiresSignOut"))
        XCTAssertFalse(opener.contains(".logout("), "un lien ne déconnecte jamais")
    }

    // MARK: - #8089 — la session ouverte par la preuve de l'adresse est célébrée

    func test_verificationLink_opensTheSessionThenCelebrates() async {
        let (gate, auth, toasts) = makeSUT(presenting: true)
        let celebration = MockArrivalCelebration()

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate, celebration: celebration)

        XCTAssertEqual(celebration.celebratedUserIds, [], "rien ne se célèbre sous la feuille")

        gate.presentationEnded()

        XCTAssertEqual(celebration.celebratedUserIds, ["link-user"])
    }

    func test_magicLink_isASignIn_notACelebration() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        let celebration = MockArrivalCelebration()

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate, celebration: celebration)

        XCTAssertEqual(auth.openedSessions, ["jwt-link"])
        XCTAssertEqual(celebration.celebratedUserIds, [])
    }

    func test_verificationLink_ofTheSignedInAccount_rotatesWithoutCelebrating() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        signedInAs(auth, id: "link-user")
        let celebration = MockArrivalCelebration()

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate, celebration: celebration)

        XCTAssertEqual(celebration.celebratedUserIds, [])
    }

    func test_refusedLink_celebratesNothing() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        auth.emailResult = .failure(MeeshyError.server(statusCode: 400, message: "Lien expiré"))
        let celebration = MockArrivalCelebration()

        await SignInLinkOpener.open(.emailVerification(token: "t", email: "a@b.co"), auth: auth, toasts: toasts, sessionGate: gate, celebration: celebration)

        XCTAssertEqual(celebration.celebratedUserIds, [])
    }

    // MARK: - #8037 — l'échec d'un lien ouvert sans compte se voit

    /// Sans compte, l'écran affiché est l'accueil (présenté en
    /// `fullScreenCover` par la racine) ou une porte d'accès présentée par
    /// l'écran de connexion — toutes recouvrent l'hôte des toasts de la racine.
    /// Chacune monte donc le sien : sinon le refus d'un lien ne se voit pas.
    func test_signedOutSurfaces_mountTheToastHost() throws {
        let welcome = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/WelcomeView.swift"))
        let login = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/LoginView.swift"))

        XCTAssertGreaterThanOrEqual(welcome.components(separatedBy: ".feedbackToastOverlay()").count - 1, 2,
                                    "l'accueil et son inscription montent l'hôte des toasts")
        XCTAssertGreaterThanOrEqual(login.components(separatedBy: ".feedbackToastOverlay()").count - 1, 4,
                                    "mot de passe oublié, code, lien de connexion et inscription montent l'hôte des toasts")
    }

    func test_aRefusedLink_raisesAnErrorToast() async {
        let (gate, auth, toasts) = makeSUT(presenting: false)
        auth.magicResult = .failure(MeeshyError.server(statusCode: 400, message: "Lien expiré"))

        await SignInLinkOpener.open(.magic(token: "m"), auth: auth, toasts: toasts, sessionGate: gate, celebration: MockArrivalCelebration())

        XCTAssertEqual(toasts.errorMessages.count, 1)
        XCTAssertEqual(auth.openedSessions, [])
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
