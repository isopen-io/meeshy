import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// **La réponse hérite du flou et de l'éphémère du message cité** (#8557) —
/// directive porteur du 2026-09-28 : « si on répond à un message flou, son
/// message devient flou, non désactivable ; si le message était éphémère et
/// flou, la réponse gagne les deux ; un message contaminé flou peut avoir en
/// plus l'ajout éphémère ». La loi est `ReplyProtectionContagion` (SDK).
@MainActor
final class ConversationReplyContagionTests: XCTestCase {

    private let conversationId = "00000000000000000000ac57"
    private let userId = "00000000000000000000ac96"
    private let quotedId = "00000000000000000000ac01"

    override func tearDown() async throws {
        MessageSocketManager.shared.isConnected = false
        try await super.tearDown()
    }

    private struct Fixture {
        let sut: ConversationViewModel
        let messageService: MockMessageService
        let offlineQueue: FakeOfflineMessageQueue
        let store: ConversationProtectionPreferenceStore
    }

    private func makeFixture(armed: ConversationProtectionPreference = .none, isOnline: Bool = true) async throws -> Fixture {
        await CacheCoordinator.shared.messages.invalidate(for: conversationId)
        let store = ConversationProtectionPreferenceStore(defaults: UserDefaults(suiteName: "reply-contagion-\(UUID().uuidString)")!)
        store.save(armed, for: conversationId)
        let auth = MockAuthManager()
        auth.simulateLoggedIn(user: MeeshyUser(id: userId, username: "contagion", displayName: "Contagion"))
        let messageService = MockMessageService()
        let offlineQueue = FakeOfflineMessageQueue()
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let sut = ConversationViewModel(
            conversationId: conversationId,
            authManager: auth,
            messageService: messageService,
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(dbPool: pool, persistence: MessagePersistenceActor(dbWriter: pool)),
            networkMonitor: FakeNetworkMonitor(isOnline: isOnline),
            offlineQueue: offlineQueue,
            protectionPreferences: store
        )
        sut.start()
        return Fixture(sut: sut, messageService: messageService, offlineQueue: offlineQueue, store: store)
    }

    /// Pose le message cité dans le fil, puis arme la citation — comme le
    /// geste « Répondre » sur une bulle.
    private func quote(_ flags: MessageEffectFlags, duration: Int? = nil, in sut: ConversationViewModel) {
        let quoted = Message(
            id: quotedId, conversationId: conversationId, senderId: "00000000000000000000ac77",
            content: "cité", effects: MessageEffects(flags: flags, ephemeralDuration: duration)
        )
        sut.messages = [quoted]
        sut.armReplyContagion(quoting: quotedId)
    }

    // MARK: - L'envoi porte les bits contaminés

    func test_sendMessage_replyToBlurredAfterReadMessage_sendsBlurredAfterRead() async throws {
        let fx = try await makeFixture()
        quote([.ephemeral, .ephemeralAfterRead, .blurred], in: fx.sut)

        _ = await fx.sut.sendMessage(content: "réponse", replyToId: quotedId,
                                     protection: fx.sut.captureArmedProtection(replyingTo: quotedId))

        let request = try XCTUnwrap(fx.messageService.lastSendRequest)
        XCTAssertEqual(request.isBlurred, true, "le flou du cité passe à la réponse")
        let flags = MessageEffectFlags(rawValue: request.effectFlags ?? 0)
        XCTAssertTrue(flags.contains([.ephemeral, .ephemeralAfterRead]), "la flamme-œil du cité passe à la réponse")
        XCTAssertNil(request.ephemeralDuration, "une flamme-œil n'a pas de durée")
    }

    func test_sendMessage_replyToBlurredMessageWithArmedDuration_addsTheDuration() async throws {
        let fx = try await makeFixture(armed: ConversationProtectionPreference(ephemeralChoice: .duration(.oneMinute), isBlurred: false, isViewOnce: false))
        quote(.blurred, in: fx.sut)

        _ = await fx.sut.sendMessage(content: "réponse", replyToId: quotedId,
                                     protection: fx.sut.captureArmedProtection(replyingTo: quotedId))

        let request = try XCTUnwrap(fx.messageService.lastSendRequest)
        XCTAssertEqual(request.isBlurred, true)
        XCTAssertEqual(request.ephemeralDuration, 60, "contaminée par le flou, la réponse garde l'éphémère qu'elle ajoute")
    }

    func test_sendMessage_replyToEphemeralWithoutTapCapture_imposesTheDuration() async throws {
        let fx = try await makeFixture(armed: ConversationProtectionPreference(ephemeralChoice: .afterRead, isBlurred: false, isViewOnce: false))
        quote(.ephemeral, duration: 300, in: fx.sut)

        _ = await fx.sut.sendMessage(content: "réponse", replyToId: quotedId)

        let request = try XCTUnwrap(fx.messageService.lastSendRequest)
        XCTAssertEqual(request.ephemeralDuration, 300, "le mode du cité REMPLACE celui que la réponse avait armé")
        XCTAssertFalse(MessageEffectFlags(rawValue: request.effectFlags ?? 0).contains(.ephemeralAfterRead))
    }

    func test_sendMessage_offlineReplyToEphemeral_queueItemCarriesTheImposedDuration() async throws {
        let fx = try await makeFixture(isOnline: false)
        quote([.ephemeral, .blurred], duration: 300, in: fx.sut)

        _ = await fx.sut.sendMessage(content: "réponse", replyToId: quotedId,
                                     protection: fx.sut.captureArmedProtection(replyingTo: quotedId))

        let items = await fx.offlineQueue.enqueuedItems
        let item = try XCTUnwrap(items.first)
        XCTAssertEqual(item.ephemeralDuration, 300)
        XCTAssertTrue(item.replayProtection.isBlurred, "l'outbox rejoue la réponse floue")
    }

    func test_sendMessage_replyToOrdinaryMessage_imposesNothing() async throws {
        let fx = try await makeFixture()
        quote([.glow], in: fx.sut)

        _ = await fx.sut.sendMessage(content: "réponse", replyToId: quotedId,
                                     protection: fx.sut.captureArmedProtection(replyingTo: quotedId))

        let request = try XCTUnwrap(fx.messageService.lastSendRequest)
        XCTAssertNil(request.isBlurred)
        XCTAssertNil(request.ephemeralDuration)
        XCTAssertNil(request.effectFlags)
        XCTAssertEqual(fx.sut.replyImposedProtection, .none)
    }

    // MARK: - Le composeur verrouille, puis rend l'armement

    func test_armReplyContagion_blurredAfterRead_locksTheComposer() async throws {
        let fx = try await makeFixture()
        quote([.ephemeral, .ephemeralAfterRead, .blurred], in: fx.sut)

        XCTAssertTrue(fx.sut.composerBlurEnabled)
        XCTAssertEqual(fx.sut.composerEphemeralChoice, .afterRead)

        fx.sut.composerBlurEnabled = false
        fx.sut.composerEphemeralChoice = nil

        XCTAssertTrue(fx.sut.composerBlurEnabled, "le flou imposé ne se désactive pas")
        XCTAssertEqual(fx.sut.composerEphemeralChoice, .afterRead, "le mode éphémère imposé ne se désactive pas")
    }

    func test_armReplyContagion_blurredOnly_letsTheReplyAddEphemeral() async throws {
        let fx = try await makeFixture()
        quote(.blurred, in: fx.sut)

        fx.sut.composerEphemeralChoice = .duration(.fiveMinutes)

        XCTAssertEqual(fx.sut.composerEphemeralChoice, .duration(.fiveMinutes))
        XCTAssertTrue(fx.sut.composerBlurEnabled)
    }

    func test_armReplyContagion_quoteRemoved_restoresArmingAndKeepsPersistedPreference() async throws {
        let armed = ConversationProtectionPreference(ephemeralChoice: .duration(.oneMinute), isBlurred: false, isViewOnce: true)
        let fx = try await makeFixture(armed: armed)
        quote([.ephemeral, .ephemeralAfterRead, .blurred], in: fx.sut)

        XCTAssertFalse(fx.sut.composerViewOnceEnabled, "flou imposé ⇒ la vue unique (exclusive) s'éteint à l'affichage")
        XCTAssertEqual(fx.sut.composerEphemeralChoice, .afterRead)
        XCTAssertEqual(fx.store.preference(for: conversationId), armed, "l'imposition n'écrit jamais la préférence")

        fx.sut.armReplyContagion(quoting: nil)

        XCTAssertEqual(fx.sut.composerEphemeralChoice, .duration(.oneMinute))
        XCTAssertFalse(fx.sut.composerBlurEnabled)
        XCTAssertTrue(fx.sut.composerViewOnceEnabled)
        XCTAssertEqual(fx.store.preference(for: conversationId), armed, "la préférence persistée est intacte")
    }
}
