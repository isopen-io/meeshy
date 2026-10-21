import XCTest
import MeeshySDK
@testable import Meeshy

/// **Une conversation verrouillée ne s'ouvre jamais sans le PIN, quel que soit
/// le chemin** (#11386, audit adversarial de #11385, constats 3 et 5).
///
/// Le verrou n'était vérifié QUE dans la liste des conversations : la recherche
/// globale, le widget, les notifications, les liens profonds, Siri, les
/// contacts, le transfert, la réponse à une story et « Détails → médiathèque →
/// Aller au message » ouvraient le fil sans le demander. La question se pose
/// désormais à UNE porte, celle du routeur (`Router.admitConversation`), que
/// tous ces chemins traversent ; un témoin par famille de chemin.
@MainActor
final class ConversationLockGateTests: XCTestCase {

    private let lockedId = "0000000000000000000000c1"
    private let openId = "0000000000000000000000c2"

    private func makeConversation(id: String) -> Conversation {
        Conversation(id: id, identifier: id, type: .direct, title: "Verrouillée", lastMessageAt: Date(), createdAt: Date(), updatedAt: Date())
    }

    private func makeRouter(locked: Set<String>) -> (Router, StubConversationLockGate) {
        let gate = StubConversationLockGate(locked: locked)
        return (Router(surfaces: PresentedSurfaceRegistry(), locks: gate), gate)
    }

    private func openedConversationId(_ router: Router) -> String? {
        guard case .conversation(let conversation) = router.path.last else { return nil }
        return conversation.id
    }

    // MARK: - Une famille de chemin, un témoin

    /// Widget, contacts, transfert, réponse à une story, en-tête d'un fil :
    /// tous ouvrent par `navigateToConversation`.
    func test_navigateToConversation_lockedConversation_withholdsTheOpeningUntilThePin() {
        let (router, _) = makeRouter(locked: [lockedId])

        router.navigateToConversation(makeConversation(id: lockedId))

        XCTAssertNil(openedConversationId(router), "le fil s'est ouvert sans le PIN")
        XCTAssertEqual(router.pendingLockedOpening?.conversation.id, lockedId)
    }

    /// « Détails » → médiathèque → « Aller au message » (constat 3) : la cible
    /// du saut n'est armée qu'APRÈS le PIN — armée avant, elle survivrait à un
    /// PIN abandonné.
    func test_navigateToConversation_lockedWithMessageTarget_armsNoHighlightBeforeThePin() {
        let (router, gate) = makeRouter(locked: [lockedId])

        router.navigateToConversation(makeConversation(id: lockedId), highlightMessageId: "m1")

        XCTAssertNil(router.pendingHighlightMessageId)
        XCTAssertNil(openedConversationId(router))

        gate.grant(lockedId)
        router.resumeLockedOpening()

        XCTAssertEqual(openedConversationId(router), lockedId)
        XCTAssertEqual(router.pendingHighlightMessageId, "m1")
        XCTAssertEqual(router.pendingHighlightConversationId, lockedId)
    }

    /// La recherche globale pousse le résultat (`GlobalSearchView`).
    func test_push_lockedConversationFromSearch_withholdsTheOpening() {
        let (router, _) = makeRouter(locked: [lockedId])

        router.push(.conversation(makeConversation(id: lockedId)))

        XCTAssertTrue(router.path.isEmpty)
        XCTAssertEqual(router.pendingLockedOpening?.conversation.id, lockedId)
    }

    /// Notification, lien profond `/c/:id`, Siri (« conversation récente »),
    /// carte Now Playing : tout ce que la racine ouvre PAR IDENTIFIANT passe
    /// par `RootConversationOpener`.
    func test_openById_lockedConversationFromNotificationOrDeepLink_withholdsTheOpening() {
        let (router, _) = makeRouter(locked: [lockedId])
        let conversation = makeConversation(id: lockedId)
        let opener = RootConversationOpener(router: router, knownConversations: { [conversation] })

        opener.navigateToConversationById(lockedId, highlightMessageId: "m9")

        XCTAssertNil(openedConversationId(router))
        XCTAssertNil(router.pendingHighlightMessageId)
        XCTAssertEqual(router.pendingLockedOpening?.conversation.id, lockedId)
    }

    /// iPad deux colonnes : la route n'atteint jamais la colonne de détail.
    func test_push_lockedConversationOnTablet_neverReachesTheDetailColumn() {
        let (router, _) = makeRouter(locked: [lockedId])
        var placed: [Route] = []
        router.onRouteRequested = { route in
            placed.append(route)
            return true
        }

        router.push(.conversation(makeConversation(id: lockedId)))
        router.navigateToConversation(makeConversation(id: lockedId))

        XCTAssertTrue(placed.isEmpty)
        XCTAssertEqual(router.pendingLockedOpening?.conversation.id, lockedId)
    }

    /// Un lien interne qui remplace la pile.
    func test_replaceStack_lockedConversation_withholdsTheOpening() {
        let (router, _) = makeRouter(locked: [lockedId])

        router.replaceStack(with: .conversation(makeConversation(id: lockedId)))

        XCTAssertTrue(router.path.isEmpty)
        XCTAssertEqual(router.pendingLockedOpening?.conversation.id, lockedId)
    }

    // MARK: - Après la porte

    func test_resume_afterThePin_opensTheWithheldConversation() {
        let (router, gate) = makeRouter(locked: [lockedId])
        router.push(.conversation(makeConversation(id: lockedId)))

        gate.grant(lockedId)
        router.resumeLockedOpening()

        XCTAssertEqual(openedConversationId(router), lockedId)
        XCTAssertNil(router.pendingLockedOpening)
    }

    /// La feuille ne peut pas forcer la porte : reprendre sans PIN n'ouvre rien.
    func test_resume_withoutThePin_opensNothing() {
        let (router, _) = makeRouter(locked: [lockedId])
        router.navigateToConversation(makeConversation(id: lockedId))

        router.resumeLockedOpening()

        XCTAssertNil(openedConversationId(router))
        XCTAssertNil(router.pendingLockedOpening)
    }

    /// PIN abandonné : ni l'ouverture, ni la cible qu'elle portait ne
    /// survivent pour la prochaine conversation venue.
    func test_abandon_dropsTheOpeningAndTheTargetItCarried() {
        let (router, gate) = makeRouter(locked: [lockedId])
        router.pendingHighlightMessageId = "m2"
        router.pendingHighlightConversationId = lockedId
        router.navigateToConversation(makeConversation(id: lockedId), highlightMessageId: "m2")

        router.abandonLockedOpening()
        gate.grant(lockedId)
        router.resumeLockedOpening()

        XCTAssertNil(router.pendingLockedOpening)
        XCTAssertNil(router.pendingHighlightMessageId)
        XCTAssertNil(openedConversationId(router))
    }

    func test_navigateToConversation_unlockedConversation_opensDirectly() {
        let (router, _) = makeRouter(locked: [lockedId])

        router.navigateToConversation(makeConversation(id: openId))

        XCTAssertEqual(openedConversationId(router), openId)
        XCTAssertNil(router.pendingLockedOpening)
    }

    /// La conversation déjà à l'écran a déjà passé la porte : une notification
    /// qui y saute ne redemande pas le PIN.
    func test_navigateToConversation_alreadyInTheStack_doesNotAskAgain() {
        let (router, _) = makeRouter(locked: [lockedId])
        router.path = [.conversation(makeConversation(id: lockedId)), .settings]

        router.navigateToConversation(makeConversation(id: lockedId), highlightMessageId: "m3")

        XCTAssertEqual(openedConversationId(router), lockedId)
        XCTAssertEqual(router.pendingHighlightMessageId, "m3")
        XCTAssertNil(router.pendingLockedOpening)
    }

    // MARK: - Le verrou réel

    /// Bout en bout, avec le gestionnaire réel : le bon PIN ouvre UNE fois, et
    /// l'ouverture suivante le redemande.
    func test_realLockManager_rightPinOpensOnceThenAsksAgain() {
        let locks = ConversationLockManager(
            vault: InMemoryConversationLockVault(),
            defaults: UserDefaults(suiteName: "lock-gate-\(UUID().uuidString)")!,
            biometrics: StubBiometricUnlocker(),
            iterations: 1_000
        )
        locks.setLock(conversationId: lockedId, pin: "1234")
        let router = Router(surfaces: PresentedSurfaceRegistry(), locks: locks)

        router.navigateToConversation(makeConversation(id: lockedId))
        XCTAssertNil(openedConversationId(router))

        XCTAssertEqual(locks.attemptLock(conversationId: lockedId, pin: "1234"), .granted)
        router.resumeLockedOpening()
        XCTAssertEqual(openedConversationId(router), lockedId)

        router.path = []
        router.navigateToConversation(makeConversation(id: lockedId))
        XCTAssertNil(openedConversationId(router), "le laissez-passer du PIN a servi deux fois")
    }

    // MARK: - Aucun chemin ne contourne la porte

    private func appSourcesRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Navigation
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
            .appendingPathComponent("Meeshy")
    }

    private func swiftSources() throws -> [(name: String, text: String)] {
        let root = appSourcesRoot()
        guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else {
            throw XCTSkip("Sources de l'app illisibles : \(root.path)")
        }
        return try enumerator.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .map { ($0.lastPathComponent, try String(contentsOf: $0, encoding: .utf8)) }
    }

    /// Aucune vue n'empile une conversation en écrivant la pile elle-même : la
    /// pile ne reçoit une conversation que du routeur, derrière sa porte.
    func test_sources_noViewWritesAConversationOntoTheStackItself() throws {
        let forbidden = ["path = [.conversation", "path.append(.conversation", "path += [.conversation"]

        let offenders = try swiftSources()
            .filter { $0.name != "Router.swift" }
            .filter { source in forbidden.contains { source.text.contains($0) } }
            .map(\.name)

        XCTAssertEqual(offenders, [], "ces fichiers posent une conversation sans passer la porte du verrou")
    }

    /// iPad : toutes les ouvertures directes de la racine (`openConversation`)
    /// traversent la même porte.
    func test_sources_tabletOpenConversationCrossesTheGate() throws {
        let source = try XCTUnwrap(swiftSources().first { $0.name == "iPadRootView+Navigation.swift" }?.text)
        let start = try XCTUnwrap(source.range(of: "func openConversation(_ conversation: Conversation)"))
        let body = source[start.upperBound...].prefix(900)

        XCTAssertTrue(body.contains("admitConversation"), "l'ouverture iPad pose la conversation sans demander le PIN")
    }
}

/// Le verrou, réduit à la question que le routeur lui pose.
@MainActor
final class StubConversationLockGate: ConversationLockGating {
    private let locked: Set<String>
    private var passes: Set<String> = []

    init(locked: Set<String>) {
        self.locked = locked
    }

    func grant(_ conversationId: String) {
        passes.insert(conversationId)
    }

    func admitsOpening(_ conversationId: String) -> Bool {
        guard locked.contains(conversationId) else { return true }
        return passes.remove(conversationId) != nil
    }
}
