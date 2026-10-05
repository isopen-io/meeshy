import XCTest
import Combine
import GRDB
@testable import Meeshy
import MeeshySDK

/// #8320 — dans une réponse, la citation d'un AUDIO se joue sur place.
///
/// La zone lecture passe par le lecteur PARTAGÉ (`ConversationAudioCoordinator`) :
/// un toucher joue la pièce citée — et elle seule, sans enchaîner sur les
/// vocaux qui suivent l'original —, un second toucher met en pause. La piste
/// suit le Prisme audio du vocal d'origine, que le message cité soit en
/// mémoire ou hors de la fenêtre chargée. Un audio protégé, supprimé ou
/// expiré ne joue jamais.
@MainActor
final class ConversationViewModelQuotedAudioTests: XCTestCase {

    private static let conversationId = "000000000000000000000a21"
    private static let userId = "000000000000000000000b21"
    private static let otherUserId = "000000000000000000000b22"

    // MARK: - Factories

    private func makeSUT(systemLanguage: String? = "fr") -> (ConversationViewModel, MockAudioPlaybackEngine, ConversationAudioCoordinator) {
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: Self.userId, username: "bob", displayName: "Bob", systemLanguage: systemLanguage))
        let pool = try! DatabaseQueue()
        try! MessageDatabaseMigrations.runAll(on: pool)
        let vm = ConversationViewModel(
            conversationId: Self.conversationId,
            unreadCount: 0,
            isDirect: true,
            participantUserId: nil,
            anonymousSession: nil,
            authManager: auth,
            messageService: MockMessageService(),
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool))
        )
        vm.start()
        let engine = MockAudioPlaybackEngine()
        let coordinator = ConversationAudioCoordinator(engine: engine)
        vm._testSetAudioCoordinator(coordinator)
        return (vm, engine, coordinator)
    }

    private func makeVoice(id: String, fileUrl: String, isViewOnce: Bool = false) -> MeeshyMessageAttachment {
        var attachment = MeeshyMessageAttachment(
            id: id, messageId: nil, fileName: "\(id).m4a", originalName: "\(id).m4a",
            mimeType: "audio/mp4", fileSize: 1_234, filePath: "", fileUrl: fileUrl,
            duration: 12_000, uploadedBy: Self.otherUserId
        )
        attachment.isViewOnce = isViewOnce
        return attachment
    }

    private func makeVoiceMessage(id: String, attachment: MeeshyMessageAttachment, effects: MessageEffects = .none,
                                  expiresAt: Date? = nil, deletedAt: Date? = nil, createdAt: TimeInterval = 1_000) -> Message {
        var message = Message(
            id: id, conversationId: Self.conversationId, senderId: Self.otherUserId, content: "",
            originalLanguage: "en", messageType: .audio, deletedAt: deletedAt, expiresAt: expiresAt, effects: effects,
            createdAt: Date(timeIntervalSince1970: createdAt), attachments: [attachment], senderName: "Alice"
        )
        message.originalLanguage = "en"
        return message
    }

    private func frenchTrack(for attachmentId: String, url: String) -> MessageTranslatedAudio {
        MessageTranslatedAudio(
            id: "t-fr", attachmentId: attachmentId, targetLanguage: "fr", url: url, transcription: "Bonjour",
            durationMs: 11_000, format: "m4a", cloned: false, quality: 0.9, ttsModel: "tts"
        )
    }

    private func reference(to messageId: String, fileUrl: String? = nil, tracks: ReplyReference.QuotedAudioTracks? = nil,
                           isProtected: Bool? = nil, expiresAt: Date? = nil) -> ReplyReference {
        var ref = ReplyReference(
            messageId: messageId, authorName: "Alice", previewText: "", attachmentType: "audio",
            attachmentFileUrl: fileUrl, attachmentIsProtected: isProtected,
            attachmentFacts: .init(thumbHash: nil, width: nil, height: nil, durationMs: 12_000,
                                   fileSize: nil, pageCount: nil, mimeType: "audio/mp4")
        )
        ref.quotedAudioTracks = tracks
        ref.quotedExpiresAt = expiresAt
        return ref
    }

    // MARK: - La bonne pièce, dans la bonne langue, sur le lecteur partagé

    func test_toggleQuotedAudio_inWindow_playsThePrismTrackOfTheCitedPieceOnly() async {
        let (vm, engine, coordinator) = makeSUT()
        let quoted = makeVoiceMessage(id: "m1", attachment: makeVoice(id: "a1", fileUrl: "https://cdn/a1-en.m4a"))
        let later = makeVoiceMessage(id: "m2", attachment: makeVoice(id: "a2", fileUrl: "https://cdn/a2.m4a"), createdAt: 2_000)
        vm.messages = [quoted, later]
        vm.messageTranslatedAudiosByAttachment["a1"] = [frenchTrack(for: "a1", url: "https://cdn/a1-fr.m4a")]
        await Task.yield()

        XCTAssertTrue(vm.toggleQuotedAudio(reference(to: "m1")))

        XCTAssertEqual(engine.lastPlayedUrl, "https://cdn/a1-fr.m4a", "la piste suit le Prisme audio du vocal d'origine")
        XCTAssertEqual(coordinator.activeContext?.attachmentId, "a1")
        XCTAssertEqual(coordinator.activeContext?.messageId, "m1")
        XCTAssertEqual(coordinator.queueCount, 1, "une citation ne met pas en file les vocaux qui suivent l'original")
    }

    func test_toggleQuotedAudio_secondTouch_pausesInsteadOfRestarting() async {
        let (vm, engine, _) = makeSUT()
        vm.messages = [makeVoiceMessage(id: "m1", attachment: makeVoice(id: "a1", fileUrl: "https://cdn/a1.m4a"))]
        await Task.yield()

        vm.toggleQuotedAudio(reference(to: "m1"))
        vm.toggleQuotedAudio(reference(to: "m1"))

        XCTAssertEqual(engine.playCallCount, 1, "le second toucher ne relance pas la lecture")
        XCTAssertEqual(engine.togglePlayPauseCallCount, 1, "le second toucher met en pause")
    }

    func test_toggleQuotedAudio_outOfWindow_playsTheTrackCarriedByTheQuotation() async {
        let (vm, engine, coordinator) = makeSUT()
        let tracks = ReplyReference.QuotedAudioTracks(originalLanguage: "en", urlsByLanguage: ["fr": "https://cdn/far-fr.m4a"])

        XCTAssertTrue(vm.toggleQuotedAudio(reference(to: "far", fileUrl: "https://cdn/far-en.m4a", tracks: tracks)))

        XCTAssertEqual(engine.lastPlayedUrl, "https://cdn/far-fr.m4a")
        XCTAssertEqual(coordinator.activeContext?.messageId, "far")
    }

    func test_toggleQuotedAudio_outOfWindow_readerOfTheOriginalLanguage_playsTheOriginal() async {
        let (vm, engine, _) = makeSUT(systemLanguage: "en")
        let tracks = ReplyReference.QuotedAudioTracks(originalLanguage: "en", urlsByLanguage: ["fr": "https://cdn/far-fr.m4a"])

        vm.toggleQuotedAudio(reference(to: "far", fileUrl: "https://cdn/far-en.m4a", tracks: tracks))

        XCTAssertEqual(engine.lastPlayedUrl, "https://cdn/far-en.m4a")
    }

    // MARK: - Un audio protégé, supprimé ou expiré ne joue jamais

    func test_toggleQuotedAudio_protectedQuotedMessage_playsNothing() async {
        let (vm, engine, _) = makeSUT()
        vm.messages = [
            makeVoiceMessage(id: "vo", attachment: makeVoice(id: "a1", fileUrl: "https://cdn/vo.m4a"), effects: MessageEffects(flags: [.viewOnce])),
            makeVoiceMessage(id: "bl", attachment: makeVoice(id: "a2", fileUrl: "https://cdn/bl.m4a"), effects: MessageEffects(flags: [.blurred])),
            makeVoiceMessage(id: "piece", attachment: makeVoice(id: "a3", fileUrl: "https://cdn/p.m4a", isViewOnce: true)),
            makeVoiceMessage(id: "gone", attachment: makeVoice(id: "a4", fileUrl: "https://cdn/g.m4a"), deletedAt: Date()),
            makeVoiceMessage(id: "old", attachment: makeVoice(id: "a5", fileUrl: "https://cdn/o.m4a"), expiresAt: Date(timeIntervalSinceNow: -60)),
        ]
        await Task.yield()

        for id in ["vo", "bl", "piece", "gone", "old"] {
            XCTAssertFalse(vm.toggleQuotedAudio(reference(to: id)), "\(id) ne doit offrir aucune lecture")
        }
        XCTAssertEqual(engine.playCallCount, 0)
    }

    func test_toggleQuotedAudio_quotationDeclaresProtectionOrExpiry_playsNothingEvenOutOfWindow() {
        let (vm, engine, _) = makeSUT()

        XCTAssertFalse(vm.toggleQuotedAudio(reference(to: "far", fileUrl: "https://cdn/far.m4a", isProtected: true)))
        XCTAssertFalse(vm.toggleQuotedAudio(reference(to: "far", fileUrl: "https://cdn/far.m4a", expiresAt: Date(timeIntervalSinceNow: -1))))
        XCTAssertFalse(vm.toggleQuotedAudio(reference(to: "far")), "sans adresse servie, rien d'honnête à jouer")
        XCTAssertEqual(engine.playCallCount, 0)
    }

    // MARK: - La miniature montre la progression — et seule la citation qui joue bouge

    func test_playbackState_followsOnlyTheQuotedMessage_withItsProgress() async {
        let (vm, engine, coordinator) = makeSUT()
        vm.messages = [makeVoiceMessage(id: "m1", attachment: makeVoice(id: "a1", fileUrl: "https://cdn/a1.m4a"))]
        await Task.yield()
        var quoted: [QuotedAudioPlaybackState?] = []
        var neighbour: [QuotedAudioPlaybackState?] = []
        let subscriptions: [AnyCancellable] = [
            QuotedAudioPlaybackState.publisher(messageId: "m1", coordinator: coordinator).sink { quoted.append($0) },
            QuotedAudioPlaybackState.publisher(messageId: "m9", coordinator: coordinator).sink { neighbour.append($0) },
        ]

        vm.toggleQuotedAudio(reference(to: "m1"))
        engine.progress = 0.503
        engine.progress = 0.504

        XCTAssertEqual(quoted.last, QuotedAudioPlaybackState(isPlaying: true, progress: 0.5))
        XCTAssertEqual(neighbour, [nil], "une citation voisine ne se redessine pas au rythme d'une autre")
        XCTAssertEqual(quoted.filter { $0?.progress == 0.5 }.count, 1, "la progression est arrondie : pas un rendu par tic")
        withExtendedLifetime(subscriptions) {}
    }
}
