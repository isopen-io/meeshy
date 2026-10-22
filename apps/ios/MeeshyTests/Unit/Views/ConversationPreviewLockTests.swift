import XCTest
import MeeshySDK
@testable import Meeshy

/// Une conversation verrouillée par PIN ne montre aucun message dans l'aperçu
/// d'appui long : la carte dit « verrouillée » et le chargeur ne préchauffe
/// rien pour elle.
@MainActor
final class ConversationPreviewLockTests: XCTestCase {

    private let conversationId = "000000000000000000000c01"

    private func makeMessage(id: String = "000000000000000000000a01", content: String = "Mot de passe: 1234") -> Message {
        Message(
            id: id,
            conversationId: conversationId,
            senderId: "u-other",
            content: content,
            originalLanguage: "fr",
            createdAt: Date(timeIntervalSince1970: 1_000),
            updatedAt: Date(timeIntervalSince1970: 1_000)
        )
    }

    private func makeSUT(
        cache: CacheResult<[Message]> = .empty,
        isLocked: @escaping @MainActor (String) -> Bool
    ) -> (sut: ConversationListPreviewLoader, service: MockMessageService, cache: MockConversationPreviewCache) {
        let service = MockMessageService()
        let cacheMock = MockConversationPreviewCache(messages: cache)
        let sut = ConversationListPreviewLoader(
            messageService: service,
            cache: cacheMock,
            readerPrism: { ["fr"] },
            isLocked: isLocked
        )
        return (sut, service, cacheMock)
    }

    // MARK: - Le rendu

    func test_preview_whenConversationLocked_rendersSealedStateWithoutMessageContent() {
        XCTAssertEqual(ConversationPreviewRenderer.display(phase: .sealed, messageCount: 0), .sealed)
        XCTAssertEqual(
            ConversationPreviewRenderer.display(phase: .sealed, messageCount: 3),
            .sealed,
            "des messages encore en mémoire ne se montrent jamais sous un verrou"
        )
    }

    func test_preview_whenConversationLocked_loaderServesNoMessage() async {
        let cached = CacheResult<[Message]>.fresh([makeMessage()], age: 1)
        let (sut, _, _) = makeSUT(cache: cached, isLocked: { _ in false })
        await sut.load(for: conversationId, intent: .ensure)
        XCTAssertFalse(sut.state(for: conversationId).messages.isEmpty)

        let (locked, _, _) = makeSUT(cache: cached, isLocked: { _ in true })
        await locked.load(for: conversationId, intent: .ensure)

        XCTAssertEqual(locked.state(for: conversationId).phase, .sealed)
        XCTAssertTrue(locked.state(for: conversationId).messages.isEmpty)
        XCTAssertNil(locked.state(for: conversationId).snapshot)
    }

    func test_preview_whenLockAppearsAfterLoad_dropsAlreadyServedMessages() async {
        var locked = false
        let cached = CacheResult<[Message]>.fresh([makeMessage()], age: 1)
        let (sut, _, _) = makeSUT(cache: cached, isLocked: { _ in locked })
        await sut.load(for: conversationId, intent: .ensure)
        XCTAssertEqual(sut.state(for: conversationId).phase, .loaded)

        locked = true

        XCTAssertEqual(sut.state(for: conversationId).phase, .sealed)
        XCTAssertTrue(sut.messages[conversationId] == nil)
    }

    // MARK: - Le chargeur

    func test_previewLoader_prefetch_whenConversationLocked_doesNotLoadMessages() async {
        let (sut, service, cache) = makeSUT(
            cache: .fresh([makeMessage()], age: 1),
            isLocked: { _ in true }
        )

        await sut.load(for: conversationId, intent: .prefetch)

        XCTAssertEqual(cache.messagesCallCount, 0)
        XCTAssertEqual(service.listCallCount, 0)
    }

    func test_previewLoader_open_whenConversationLocked_doesNotTouchTheNetwork() async {
        let (sut, service, cache) = makeSUT(isLocked: { _ in true })

        await sut.load(for: conversationId, intent: .open)

        XCTAssertEqual(cache.messagesCallCount, 0)
        XCTAssertEqual(service.listCallCount, 0)
    }

    func test_previewLoader_lockIsPerConversation() async {
        let other = "000000000000000000000c02"
        let (sut, _, cache) = makeSUT(
            cache: .fresh([makeMessage()], age: 1),
            isLocked: { $0 == "000000000000000000000c01" }
        )

        await sut.load(for: other, intent: .prefetch)

        XCTAssertEqual(cache.messagesCallCount, 1)
        XCTAssertEqual(sut.state(for: other).phase, .loaded)
    }

    // MARK: - Le mode d'affichage : non-régression

    func test_previewRendererKind_scriptAndFocal_flatRow_bubbles_bubble() {
        XCTAssertEqual(ConversationPreviewRenderer.kind(mode: .script), .flatRow)
        XCTAssertEqual(ConversationPreviewRenderer.kind(mode: .focal), .flatRow)
        XCTAssertEqual(ConversationPreviewRenderer.kind(mode: .bubbles), .bubble)
    }

    func test_display_unlockedPhases_areUnchanged() {
        XCTAssertEqual(ConversationPreviewRenderer.display(phase: .loading, messageCount: 0), .skeleton)
        XCTAssertEqual(ConversationPreviewRenderer.display(phase: .loaded, messageCount: 2), .messages)
        XCTAssertEqual(ConversationPreviewRenderer.display(phase: .empty, messageCount: 0), .empty)
        XCTAssertEqual(ConversationPreviewRenderer.display(phase: .unavailable, messageCount: 0), .unavailable)
    }

    // MARK: - L'empreinte

    func test_previewFingerprint_changesWhenLockStateChanges() async {
        var locked = false
        let cached = CacheResult<[Message]>.fresh([makeMessage()], age: 1)
        let (sut, _, _) = makeSUT(cache: cached, isLocked: { _ in locked })
        await sut.load(for: conversationId, intent: .ensure)
        let open = sut.fingerprint(for: conversationId)

        locked = true
        let sealed = sut.fingerprint(for: conversationId)

        XCTAssertNotEqual(open, sealed)
        XCTAssertEqual(sealed.phase, .sealed)
        XCTAssertTrue(sealed.entries.isEmpty)
    }
}
