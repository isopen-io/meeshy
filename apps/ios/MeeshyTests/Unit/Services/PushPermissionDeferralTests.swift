import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **Quand la permission de notification se demande — et quand elle NE se
/// demande pas.**
///
/// Avant #5218, l'app la demandait dès `isAuthenticated`. Pour quelqu'un qui
/// vient de créer son compte, l'alerte système tombe donc sur un écran sans
/// conversation ni contact : rien à notifier. Un refus posé là est DÉFINITIF —
/// iOS ne repropose jamais l'alerte de lui-même — et se paie ensuite sur chaque
/// message reçu.
///
/// La suite garde les trois moitiés de la règle : le marqueur (qui doit survivre
/// à un relancement), le site qui le POSE, et le site qui l'HONORE.
@MainActor
final class PushPermissionDeferralTests: XCTestCase {

    // MARK: - Fabrique

    /// Un `UserDefaults` ISOLÉ par test : le marqueur réel vit dans
    /// `.standard`, où il survivrait d'un test à l'autre et ferait dépendre le
    /// verdict de l'ORDRE d'exécution.
    private func makeSUT(
        suite: String = "me.meeshy.tests.pushDeferral.\(UUID().uuidString)"
    ) -> (sut: PushPermissionDeferral, defaults: UserDefaults, suite: String) {
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        return (PushPermissionDeferral(defaults: defaults), defaults, suite)
    }

    private func tearDownSuite(_ suite: String) {
        UserDefaults.standard.removePersistentDomain(forName: suite)
    }

    // MARK: - Le marqueur

    func test_isPending_freshStore_isFalse() {
        let (sut, _, suite) = makeSUT()
        defer { tearDownSuite(suite) }
        XCTAssertFalse(sut.isPending, "rien n'est dû tant que personne n'a reporté")
    }

    func test_postpone_thenPending() {
        let (sut, _, suite) = makeSUT()
        defer { tearDownSuite(suite) }
        sut.postpone()
        XCTAssertTrue(sut.isPending)
    }

    func test_resolve_clearsTheMarker() {
        let (sut, _, suite) = makeSUT()
        defer { tearDownSuite(suite) }
        sut.postpone()
        sut.resolve()
        XCTAssertFalse(sut.isPending, "la demande honorée ne doit pas se rejouer au message suivant")
    }

    /// Le report doit survivre à un RELANCEMENT : entre l'inscription et le
    /// premier message, l'app peut être fermée, mise à jour, relancée. Un
    /// marqueur en mémoire ne serait pas un report, ce serait un oubli.
    func test_marker_survivesANewInstanceOnTheSameStore() {
        let (sut, defaults, suite) = makeSUT()
        defer { tearDownSuite(suite) }
        sut.postpone()

        let reborn = PushPermissionDeferral(defaults: defaults)
        XCTAssertTrue(reborn.isPending)
    }

    /// La clé est NOMMÉE, donc cherchable dans le dépôt — et le test la lit par
    /// son nom, pas par une chaîne recopiée qui pourrait diverger.
    func test_marker_livesUnderTheDeclaredKey() {
        let (sut, defaults, suite) = makeSUT()
        defer { tearDownSuite(suite) }
        sut.postpone()
        XCTAssertTrue(defaults.bool(forKey: PushPermissionDeferral.markerKey))
    }

    // MARK: - L'honorer, une fois et une seule

    /// Sans report en attente, `honourDeferredRequest` ne fait RIEN — c'est ce
    /// qui rend l'appel sûr au bout de CHAQUE envoi réussi, qui est le seul
    /// endroit d'où il pouvait être posé.
    func test_honourDeferredRequest_withoutAPendingRequest_isANoOp() async {
        let deferral = MockPushPermissionDeferral()
        await PushPermissionPrompt.honourDeferredRequest(deferral)
        XCTAssertEqual(deferral.resolveCallCount, 0,
                       "rien à honorer ⇒ rien à effacer, et surtout aucune alerte système")
    }

    // MARK: - Les deux sites, gardés à la source

    private static let appRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Services
        .deletingLastPathComponent()   // Unit
        .deletingLastPathComponent()   // MeeshyTests
        .deletingLastPathComponent()   // apps/ios

    private func source(_ relativePath: String) throws -> String {
        try String(contentsOf: Self.appRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    /// **Le report est gouverné par l'ORIGINE de la session, pas par un drapeau
    /// posé à la main.** Sans `AuthManager.sessionOrigin`, une inscription et
    /// une connexion posent le même `isAuthenticated` : rien ne les distinguait.
    ///
    /// La décision est branchée dans le `body` mais VIT dans
    /// `PushPermissionPrompt` — l'écrire là-haut la séparerait de sa raison, et
    /// ferait grossir un fichier déjà hors budget (directive 2026-08-28).
    func test_sessionOpen_defersOnlyForARegistration() throws {
        let app = try source("Meeshy/MeeshyApp.swift")
        XCTAssertTrue(
            app.contains("Task { await PushPermissionPrompt.onSessionOpened(origin: authManager.sessionOrigin) }"),
            "l'ouverture de session doit PASSER l'origine, pas décider sur place"
        )

        let rule = try source("Meeshy/Features/Auth/Signup/PushPermissionDeferral.swift")
        XCTAssertTrue(
            rule.contains("guard origin == .registration else {"),
            "et la règle doit lire l'ORIGINE — un compte tout juste créé n'a rien à notifier"
        )
        XCTAssertTrue(
            rule.contains("deferral.postpone()"),
            "une INSCRIPTION reporte"
        )
    }

    /// Une INSCRIPTION reporte, et ne demande RIEN — c'est la seule branche de
    /// `onSessionOpened` qu'une suite peut exercer pour de vrai : les trois
    /// autres (`.login`, `.restored`, `nil`) appellent `requestIfNeeded`, qui
    /// ouvre l'alerte système que xctest ne peut pas refermer. Leur moitié de la
    /// règle est portée par la garde de source ci-dessus.
    func test_onSessionOpened_registration_postponesAndNeverAsks() async {
        let deferral = MockPushPermissionDeferral()
        await PushPermissionPrompt.onSessionOpened(origin: .registration, deferral: deferral)

        XCTAssertEqual(deferral.postponeCallCount, 1)
        XCTAssertTrue(deferral.isPending, "le premier message trouvera le report posé")
        XCTAssertEqual(deferral.resolveCallCount, 0, "poser n'est pas honorer")
    }

    /// **Le report s'honore au seul point de passage d'un envoi ACQUITTÉ par le
    /// serveur.** `sendMessage` a quatre `return true`, dont un pour la simple
    /// mise en file HORS LIGNE : y poser la demande la déclencherait pour un
    /// message qui n'est pas encore parti.
    func test_conversationSend_honoursTheDeferralAtTheAckFunnel() throws {
        let src = try source("Meeshy/Features/Main/ViewModels/ConversationViewModel+Send.swift")
        XCTAssertEqual(
            src.components(separatedBy: "PushPermissionPrompt.honourDeferredRequest()").count - 1, 1,
            "un seul site, sinon deux envois simultanés empileraient deux alertes système"
        )
        guard let funnel = src.range(of: "private func finalizeSuccessfulSend("),
              let call = src.range(of: "PushPermissionPrompt.honourDeferredRequest()") else {
            return XCTFail("le site d'acquittement ou l'appel sont introuvables")
        }
        XCTAssertTrue(
            funnel.lowerBound < call.lowerBound,
            "l'appel doit vivre DANS `finalizeSuccessfulSend` — le funnel des transports acquittés"
        )
    }

    /// La séquence de demande n'existe qu'à UN endroit : deux écritures de la
    /// même intention divergeraient, et l'une d'elles oublierait
    /// `registerForRemoteNotifications`.
    func test_theRequestSequenceHasASingleHome() throws {
        let app = try source("Meeshy/MeeshyApp.swift")
        let deferral = try source("Meeshy/Features/Auth/Signup/PushPermissionDeferral.swift")

        XCTAssertTrue(
            app.contains("await PushPermissionPrompt.requestIfNeeded(using: pushManager)"),
            "`MeeshyApp` doit RELAYER vers le site unique, jamais recopier la séquence"
        )
        XCTAssertFalse(
            app.contains("pushManager.checkAuthorizationStatus()"),
            "la séquence elle-même ne doit plus vivre ici"
        )
        XCTAssertEqual(
            app.components(separatedBy: "requestPermission()").count - 1, 0,
            "aucune demande directe hors du site unique"
        )
        XCTAssertTrue(deferral.contains("manager.requestPermission()"))
        XCTAssertTrue(deferral.contains("UIApplication.shared.registerForRemoteNotifications()"))
    }
}
