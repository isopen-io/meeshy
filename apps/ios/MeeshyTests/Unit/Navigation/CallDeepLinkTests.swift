import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class CallDeepLinkTests: XCTestCase {

    private func makeRouter(
        authenticated: Bool = true,
        sessionResolved: Bool = true
    ) -> DeepLinkRouter {
        let defaults = UserDefaults(suiteName: "CallDeepLinkTests.\(UUID().uuidString)")!
        return DeepLinkRouter(
            drafts: DraftStore(userDefaults: defaults, userIdProvider: { "call" }),
            isAuthenticated: { authenticated },
            hasResolvedSession: { sessionResolved }
        )
    }

    func test_parse_siriCallShortcut_readsTheConversationAndTheCallType() {
        XCTAssertEqual(
            DeepLinkParser.parse(URL(string: "meeshy://call?contactId=conv1&type=video")!),
            .call(conversationId: "conv1", isVideo: true)
        )
        XCTAssertEqual(
            DeepLinkParser.parse(URL(string: "meeshy://call?contactId=conv1&type=audio")!),
            .call(conversationId: "conv1", isVideo: false)
        )
    }

    func test_parse_callWithoutContact_orLiveActivityButtons_routesNothing() {
        let unrouted = ["meeshy://call", "meeshy://call?contactId=%20", "meeshy://call/end", "meeshy://call/mute"]
        for sample in unrouted {
            guard case .external = DeepLinkParser.parse(URL(string: sample)!) else {
                XCTFail("\(sample) ne doit pas composer d'appel")
                continue
            }
        }
    }

    func test_parse_callIsNeverReadFromTheWeb() {
        guard case .external = DeepLinkParser.parse(URL(string: "https://meeshy.me/call?contactId=conv1&type=video")!) else {
            return XCTFail("un lien web ne compose jamais d'appel")
        }
    }

    // MARK: - Le lien ne compose JAMAIS : il demande confirmation (décision porteur)

    /// N'importe quelle app, un QR code ou une page web pouvait faire passer un
    /// appel vidéo par `meeshy://call?contactId=…&type=video`, caméra et micro
    /// ouverts, sans le moindre geste. Le lien devient une DEMANDE, que la
    /// racine présente en feuille de confirmation.
    func test_handle_callLink_queuesAConfirmation_neverDials() {
        let router = makeRouter()

        XCTAssertTrue(router.handle(url: URL(string: "meeshy://call?contactId=conv1&type=video")!))

        XCTAssertEqual(router.pendingDeepLink, .callRequest(conversationId: "conv1", isVideo: true))
    }

    func test_handle_callLink_signedOut_queuesNothing() {
        let router = makeRouter(authenticated: false)

        XCTAssertTrue(router.handle(url: URL(string: "meeshy://call?contactId=conv1&type=audio")!),
                      "le lien ouvre l'app (la connexion) — il ne lance rien")
        XCTAssertNil(router.pendingDeepLink)
    }

    func test_handle_callLink_beforeTheSessionIsRead_waitsForTheRoot() {
        let router = makeRouter(authenticated: false, sessionResolved: false)

        XCTAssertTrue(router.handle(url: URL(string: "meeshy://call?contactId=conv1&type=audio")!))

        XCTAssertEqual(router.pendingDeepLink, .callRequest(conversationId: "conv1", isVideo: false),
                       "au démarrage à froid la demande attend la racine — qui ne monte qu'avec une session")
    }

    /// La connexion affichée, la demande d'appel est oubliée : se connecter ne
    /// relance rien.
    func test_loginScreen_discardsAPendingCallRequest_only() {
        let router = makeRouter(authenticated: false, sessionResolved: false)
        _ = router.handle(url: URL(string: "meeshy://call?contactId=conv1&type=audio")!)

        router.discardPendingCallRequest()
        XCTAssertNil(router.pendingDeepLink)

        router.pendingDeepLink = .postDetail(postId: "p1")
        router.discardPendingCallRequest()
        XCTAssertEqual(router.pendingDeepLink, .postDetail(postId: "p1"), "un lien de contenu survit à la connexion")
    }

    func test_callRequest_neverOpensAfterSignIn() {
        XCTAssertFalse(DeepLink.callRequest(conversationId: "c", isVideo: true).opensAfterSignIn)
    }

    func test_loginView_discardsTheCallRequest_andBothRootsConfirm() throws {
        let app = try AppSourceGuard.unit("Meeshy/MeeshyApp.swift")
        XCTAssertTrue(app.contains("deepLinkRouter.discardPendingCallRequest()"))
        for root in ["Meeshy/Features/Main/Views/RootView.swift",
                     "Meeshy/Features/Main/Views/iPadRootView+Navigation.swift"] {
            let code = try AppSourceGuard.unit(root)
            XCTAssertTrue(code.contains("case .callRequest(let conversationId, let isVideo):"), root)
            XCTAssertTrue(code.contains("CallLinkConfirmationController.shared.request("), root)
        }
        for layer in ["Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift",
                      "Meeshy/Features/Main/Views/RootLayers/iPadRootViewLayers.swift"] {
            XCTAssertTrue(try AppSourceGuard.unit(layer).contains(".callLinkConfirmationSheet()"), layer)
        }
    }
}

// MARK: - La feuille de confirmation

@MainActor
final class CallLinkConfirmationControllerTests: XCTestCase {

    private func conversation(id: String = "conv1", userId: String = "u1", type: MeeshyConversation.ConversationType = .direct) -> MeeshyConversation {
        MeeshyConversation(id: id, identifier: id, type: type, title: "Awa",
                           participantUserId: userId, participantUsername: "awa",
                           participantAvatarURL: "https://x/a.jpg")
    }

    private final class World {
        var account: String? = "me"
        var blocked: Set<String> = []
        var gatesOpen = true
        var dialed: [CallLinkTarget] = []
        var refusals: [CallLinkRefusal] = []
    }

    private func makeSUT(
        conversation: MeeshyConversation? = nil,
        conversations: [String: MeeshyConversation] = [:],
        blocked: Set<String> = []
    ) -> (CallLinkConfirmationController, () -> [CallLinkTarget], () -> [CallLinkRefusal]) {
        let (sut, world) = makeWorld(conversation: conversation, conversations: conversations)
        world.blocked = blocked
        return (sut, { world.dialed }, { world.refusals })
    }

    private func makeWorld(
        conversation: MeeshyConversation? = nil,
        conversations: [String: MeeshyConversation] = [:]
    ) -> (CallLinkConfirmationController, World) {
        let world = World()
        let sut = CallLinkConfirmationController(
            resolveConversation: { id in conversations[id] ?? conversation },
            isBlocked: { world.blocked.contains($0) },
            currentAccountId: { world.account },
            dial: { world.dialed.append($0) },
            showRefusal: { world.refusals.append($0) }
        )
        return (sut, world)
    }

    func test_request_showsTheConfirmation_andDialsNothing() async {
        let (sut, dialed, _) = makeSUT(conversation: conversation())

        await sut.request(conversationId: "conv1", isVideo: true, gatesOpen: { true })

        XCTAssertEqual(sut.pending?.userId, "u1")
        XCTAssertEqual(sut.pending?.username, "awa")
        XCTAssertEqual(sut.pending?.isVideo, true)
        XCTAssertTrue(dialed().isEmpty, "aucun appel sans le geste « Appeler »")
    }

    func test_confirm_dialsOnce_cancel_dialsNothing() async {
        let (sut, dialed, _) = makeSUT(conversation: conversation())
        await sut.request(conversationId: "conv1", isVideo: false, gatesOpen: { true })
        sut.cancel()
        XCTAssertNil(sut.pending)
        XCTAssertTrue(dialed().isEmpty)

        await sut.request(conversationId: "conv1", isVideo: false, gatesOpen: { true })
        let shown = sut.pending!
        sut.confirm(shown)
        sut.confirm(shown)
        XCTAssertEqual(dialed().map(\.conversationId), ["conv1"])
        XCTAssertNil(sut.pending)
    }

    /// Mise à jour forcée ou barrière d'âge : le lien ne contourne rien.
    func test_request_whileAGateIsUp_showsNothing() async {
        let (sut, dialed, refusals) = makeSUT(conversation: conversation())

        await sut.request(conversationId: "conv1", isVideo: true, gatesOpen: { false })

        XCTAssertNil(sut.pending)
        XCTAssertTrue(dialed().isEmpty)
        XCTAssertTrue(refusals().isEmpty)
    }

    func test_request_blockedContact_isRefused() async {
        let (sut, dialed, refusals) = makeSUT(conversation: conversation(), blocked: ["u1"])

        await sut.request(conversationId: "conv1", isVideo: true, gatesOpen: { true })

        XCTAssertNil(sut.pending)
        XCTAssertTrue(dialed().isEmpty)
        XCTAssertEqual(refusals(), [.blocked])
    }

    func test_request_unknownConversation_isRefused() async {
        let (sut, dialed, refusals) = makeSUT(conversation: nil)

        await sut.request(conversationId: "nope", isVideo: true, gatesOpen: { true })

        XCTAssertNil(sut.pending)
        XCTAssertTrue(dialed().isEmpty)
        XCTAssertEqual(refusals(), [.unknownContact])
    }

    func test_request_groupConversation_isRefused() async {
        let (sut, _, refusals) = makeSUT(conversation: conversation(type: .group))

        await sut.request(conversationId: "conv1", isVideo: true, gatesOpen: { true })

        XCTAssertNil(sut.pending)
        XCTAssertEqual(refusals(), [.unknownContact])
    }

    // MARK: - Ce qui est confirmé est ce qui est composé (revue sécurité)

    /// Un second lien B arrivé pendant que la feuille A est affichée : le tap sur
    /// « Appeler » de A ne doit lancer NI B (relu depuis l'état courant) NI A.
    func test_secondLinkWhileShowing_staleTapDialsNothing() async {
        let b = MeeshyConversation(id: "convB", identifier: "convB", type: .direct, title: "Bob",
                                   participantUserId: "uB", participantUsername: "bob")
        let (sut, world) = makeWorld(conversation: conversation(), conversations: ["convB": b])
        await sut.request(conversationId: "conv1", isVideo: false, gatesOpen: { true })
        let shownA = sut.pending!

        await sut.request(conversationId: "convB", isVideo: true, gatesOpen: { true })
        let shownB = sut.pending!
        XCTAssertNotEqual(shownA.id, shownB.id, "la feuille B REMPLACE la feuille A")

        sut.confirm(shownA)

        XCTAssertTrue(world.dialed.isEmpty)
        XCTAssertEqual(sut.pending, shownB, "la feuille affichée reste B")

        sut.confirm(shownB)
        XCTAssertEqual(world.dialed.map(\.conversationId), ["convB"])
        XCTAssertEqual(world.dialed.map(\.isVideo), [true])
    }

    /// Le même lien relu deux fois donne deux confirmations DISTINCTES : un tap
    /// sur l'ancienne ne vaut pas pour la nouvelle.
    func test_sameLinkTwice_eachConfirmationIsItsOwn() async {
        let (sut, world) = makeWorld(conversation: conversation())
        await sut.request(conversationId: "conv1", isVideo: true, gatesOpen: { true })
        let first = sut.pending!
        await sut.request(conversationId: "conv1", isVideo: true, gatesOpen: { true })

        sut.confirm(first)

        XCTAssertTrue(world.dialed.isEmpty)
    }

    /// La feuille A sortante (remplacée par B) ne referme pas B en partant.
    func test_replacedSheetDisappearing_keepsTheNewOne() async {
        let b = MeeshyConversation(id: "convB", identifier: "convB", type: .direct, title: "Bob",
                                   participantUserId: "uB", participantUsername: "bob")
        let (sut, _) = makeWorld(conversation: conversation(), conversations: ["convB": b])
        await sut.request(conversationId: "conv1", isVideo: false, gatesOpen: { true })
        let shownA = sut.pending!
        await sut.request(conversationId: "convB", isVideo: false, gatesOpen: { true })

        sut.dismissed(shownA)

        XCTAssertEqual(sut.pending?.conversationId, "convB")
    }

    func test_accountChangedBeforeTheTap_dialsNothing_andCloses() async {
        let (sut, world) = makeWorld(conversation: conversation())
        await sut.request(conversationId: "conv1", isVideo: true, gatesOpen: { true })
        let shown = sut.pending!

        world.account = "someone-else"
        sut.confirm(shown)

        XCTAssertTrue(world.dialed.isEmpty)
        XCTAssertNil(sut.pending)
    }

    func test_contactBlockedBeforeTheTap_dialsNothing_andCloses() async {
        let (sut, world) = makeWorld(conversation: conversation())
        await sut.request(conversationId: "conv1", isVideo: true, gatesOpen: { true })
        let shown = sut.pending!

        world.blocked = ["u1"]
        sut.confirm(shown)

        XCTAssertTrue(world.dialed.isEmpty)
        XCTAssertNil(sut.pending)
    }

    func test_gateRaisedBeforeTheTap_dialsNothing_andCloses() async {
        let (sut, world) = makeWorld(conversation: conversation())
        await sut.request(conversationId: "conv1", isVideo: true, gatesOpen: { world.gatesOpen })
        let shown = sut.pending!

        world.gatesOpen = false
        sut.confirm(shown)

        XCTAssertTrue(world.dialed.isEmpty)
        XCTAssertNil(sut.pending)
    }

    func test_title_namesTheContactAndTheMode() {
        let video = CallLinkTarget(conversationId: "c", userId: "u", displayName: "Awa", username: "awa", avatarURL: nil, isVideo: true, accountId: "me")
        let audio = CallLinkTarget(conversationId: "c", userId: "u", displayName: "Awa", username: nil, avatarURL: nil, isVideo: false, accountId: "me")
        XCTAssertTrue(video.title.contains("@awa"))
        XCTAssertTrue(audio.title.contains("Awa"))
        XCTAssertNotEqual(video.title.replacingOccurrences(of: "@awa", with: ""), audio.title.replacingOccurrences(of: "Awa", with: ""))
    }
}
