import XCTest
import MeeshySDK
@testable import Meeshy

/// Une conversation verrouillée par PIN ne montre aucun message dans l'aperçu
/// d'appui long : la carte dit « verrouillée » et le chargeur ne préchauffe
/// rien pour elle.
///
/// #11387 (décision porteur 2026-10-24) : le verrou protège le CONTENU — la
/// rangée de liste ne montre ni dernier message, ni frappe, ni brouillon, ni
/// vignette ; une seule fonction pure (`ConversationLockManager.hidesContent`)
/// en décide, consommée par la rangée, le chargeur et le widget.
@MainActor
final class ConversationPreviewLockTests: XCTestCase {

    @MainActor
    private final class PinLock {
        nonisolated deinit {}
        var isLocked = false
    }

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
            isLocked: isLocked,
            endToEnd: MockEndToEndMessaging()
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
        let pin = PinLock()
        let cached = CacheResult<[Message]>.fresh([makeMessage()], age: 1)
        let (sut, _, _) = makeSUT(cache: cached, isLocked: { _ in pin.isLocked })
        await sut.load(for: conversationId, intent: .ensure)
        XCTAssertEqual(sut.state(for: conversationId).phase, .loaded)

        pin.isLocked = true

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
        let pin = PinLock()
        let cached = CacheResult<[Message]>.fresh([makeMessage()], age: 1)
        let (sut, _, _) = makeSUT(cache: cached, isLocked: { _ in pin.isLocked })
        await sut.load(for: conversationId, intent: .ensure)
        let open = sut.fingerprint(for: conversationId)

        pin.isLocked = true
        let sealed = sut.fingerprint(for: conversationId)

        XCTAssertNotEqual(open, sealed)
        XCTAssertEqual(sealed.phase, .sealed)
        XCTAssertTrue(sealed.entries.isEmpty)
    }

    // MARK: - #11387 — la décision unique

    func test_hidesContent_isExactlyTheLockedSet() {
        let locked: Set<String> = [conversationId]
        XCTAssertTrue(ConversationLockManager.hidesContent(of: conversationId, lockedConversationIds: locked))
        XCTAssertFalse(ConversationLockManager.hidesContent(of: "000000000000000000000c02", lockedConversationIds: locked))
        XCTAssertFalse(ConversationLockManager.hidesContent(of: conversationId, lockedConversationIds: []))
    }

    func test_lockManager_hidesContent_followsSetLockAndRemoveLock() {
        let sut = ConversationLockManager(
            vault: InMemoryConversationLockVault(),
            defaults: UserDefaults(suiteName: "pin-content-\(UUID().uuidString)")!,
            biometrics: StubBiometricUnlocker(),
            iterations: 1_000
        )
        XCTAssertFalse(sut.hidesContent(of: conversationId))

        sut.setLock(conversationId: conversationId, pin: "1234")
        XCTAssertTrue(sut.hidesContent(of: conversationId))

        sut.removeLock(conversationId: conversationId)
        XCTAssertFalse(sut.hidesContent(of: conversationId))
    }

    /// Le widget et l'extension de notification lisent le verrou par l'App
    /// Group : chaque changement du jeu verrouillé s'annonce pour qu'ils
    /// republient sans attendre la prochaine mise à jour de la liste.
    func test_lockManager_announcesEveryContentLockChange() {
        let sut = ConversationLockManager(
            vault: InMemoryConversationLockVault(),
            defaults: UserDefaults(suiteName: "pin-content-\(UUID().uuidString)")!,
            biometrics: StubBiometricUnlocker(),
            iterations: 1_000
        )
        let locked = expectation(forNotification: .conversationContentLocksDidChange, object: nil)
        sut.setLock(conversationId: conversationId, pin: "1234")
        wait(for: [locked], timeout: 1)

        let unlocked = expectation(forNotification: .conversationContentLocksDidChange, object: nil)
        sut.removeLock(conversationId: conversationId)
        wait(for: [unlocked], timeout: 1)
    }

    // MARK: - #11387 — ce que l'extension de notification voit du verrou

    @MainActor
    private final class PurgedBanners {
        nonisolated deinit {}
        var conversationIds: [String] = []
    }

    private func makeMirroredLockManager(
        mirror: UserDefaults,
        purged: PurgedBanners
    ) -> ConversationLockManager {
        ConversationLockManager(
            vault: InMemoryConversationLockVault(),
            defaults: UserDefaults(suiteName: "pin-content-\(UUID().uuidString)")!,
            biometrics: StubBiometricUnlocker(),
            iterations: 1_000,
            contentLockMirror: mirror,
            purgeDeliveredBanners: { purged.conversationIds.append($0) }
        )
    }

    private func makeMirror() throws -> UserDefaults {
        let suite = "pin-mirror-\(UUID().uuidString)"
        let mirror = try XCTUnwrap(UserDefaults(suiteName: suite))
        mirror.removePersistentDomain(forName: suite)
        return mirror
    }

    /// Une conversation verrouillée hors de la liste chargée (un « coffre »
    /// ancien) n'a pas de cliché : le miroir porte le jeu COMPLET, et
    /// l'extension la voit verrouillée.
    func test_setLock_mirrorsTheFullLockedSet_soTheExtensionSeesAConversationAbsentFromTheList() throws {
        let mirror = try makeMirror()
        let sut = makeMirroredLockManager(mirror: mirror, purged: PurgedBanners())

        sut.setLock(conversationId: "coffre-hors-liste", pin: "1234")

        let mirrored = mirror.stringArray(forKey: NSEAttachmentPolicy.lockedConversationIdsKey)
        XCTAssertTrue(NSEAttachmentPolicy.isContentLocked(
            conversationId: "coffre-hors-liste", mirroredLockedIds: mirrored, snapshotDeclaresLock: false
        ))
    }

    func test_removeLock_andLogout_clearTheMirror() throws {
        let mirror = try makeMirror()
        let sut = makeMirroredLockManager(mirror: mirror, purged: PurgedBanners())
        sut.setLock(conversationId: "a", pin: "1234")
        sut.setLock(conversationId: "b", pin: "1234")

        sut.removeLock(conversationId: "a")
        XCTAssertEqual(mirror.stringArray(forKey: NSEAttachmentPolicy.lockedConversationIdsKey), ["b"])

        sut.resetForLogout()
        XCTAssertNil(mirror.object(forKey: NSEAttachmentPolicy.lockedConversationIdsKey))
    }

    /// Les bannières déjà délivrées montraient le contenu : verrouiller les
    /// retire du Centre de notifications. Déverrouiller ne retire rien.
    func test_setLock_purgesTheDeliveredBannersOfThatConversationOnly() throws {
        let purged = PurgedBanners()
        let sut = makeMirroredLockManager(mirror: try makeMirror(), purged: purged)

        sut.setLock(conversationId: conversationId, pin: "1234")
        sut.removeLock(conversationId: conversationId)

        XCTAssertEqual(purged.conversationIds, [conversationId])
    }

    /// Le défaut de production retire bien par FIL de conversation — le
    /// prédicat que le retrait au toucher utilise déjà.
    func test_lockedConversationBanners_areThoseOfItsThread() {
        let ofThread = DeliveredBanner(
            identifier: "n1", userInfo: [:], threadIdentifier: "conversation:\(conversationId)"
        )
        let ofPayload = DeliveredBanner(identifier: "n2", userInfo: ["conversationId": conversationId])
        let other = DeliveredBanner(
            identifier: "n3", userInfo: ["conversationId": "autre"], threadIdentifier: "conversation:autre"
        )
        let ref = NotificationReadScope.conversation(id: conversationId)
        XCTAssertTrue(NotificationActionHandler.bannerBelongs(ofThread, to: ref))
        XCTAssertTrue(NotificationActionHandler.bannerBelongs(ofPayload, to: ref))
        XCTAssertFalse(NotificationActionHandler.bannerBelongs(other, to: ref))
    }

    // MARK: - #11387 — la rangée

    func test_rowLine2_whenContentLocked_beatsTypingDraftAndPreview() {
        XCTAssertEqual(ConversationRowLine2Kind.resolve(hasTyping: true, hasDraft: true, isContentLocked: true), .locked)
        XCTAssertEqual(ConversationRowLine2Kind.resolve(hasTyping: false, hasDraft: true, isContentLocked: true), .locked)
        XCTAssertEqual(ConversationRowLine2Kind.resolve(hasTyping: false, hasDraft: false, isContentLocked: true), .locked)
    }

    func test_rowLine2_unlocked_keepsTypingDraftPreviewPrecedence() {
        XCTAssertEqual(ConversationRowLine2Kind.resolve(hasTyping: true, hasDraft: true), .typing)
        XCTAssertEqual(ConversationRowLine2Kind.resolve(hasTyping: false, hasDraft: true), .draft)
        XCTAssertEqual(ConversationRowLine2Kind.resolve(hasTyping: false, hasDraft: false), .preview)
        XCTAssertEqual(LentilleConversationRow.Line2Kind.resolve(hasTyping: false, hasDraft: false, isContentLocked: true), .locked)
    }

    private func makeRowConversation(withPhoto: Bool = true) -> Conversation {
        var conversation = Conversation(
            identifier: conversationId,
            title: "Coffre",
            lastMessagePreview: "Mot de passe: 1234"
        )
        conversation.lastMessageOriginalLanguage = "fr"
        guard withPhoto else { return conversation }
        conversation.lastMessageAttachments = [
            MeeshyMessageAttachment(id: "a", originalName: "photo.jpg", mimeType: "image/jpeg")
        ]
        conversation.lastMessageAttachmentCount = 1
        return conversation
    }

    func test_themedRow_whenContentLocked_speaksTheLockNeverTheLastMessage() {
        let label = ThemedConversationRow(
            conversation: makeRowConversation(),
            typingUsername: "Alice",
            draftSummary: DraftSummary(previewText: "brouillon secret", updatedAt: Date(timeIntervalSince1970: 2_000)),
            isContentLocked: true,
            preferredContentLanguages: ["fr"]
        ).conversationAccessibilityLabel

        XCTAssertFalse(label.contains("1234"), "le dernier message d'une conversation verrouillée ne se dit pas : \(label)")
        XCTAssertFalse(label.contains("brouillon secret"), label)
        XCTAssertTrue(label.contains(ConversationLockedPreviewLine.label), label)
    }

    func test_themedRow_whenUnlocked_stillSpeaksTheLastMessage() {
        let label = ThemedConversationRow(
            conversation: makeRowConversation(withPhoto: false),
            preferredContentLanguages: ["fr"]
        ).conversationAccessibilityLabel

        XCTAssertTrue(label.contains("1234"), label)
        XCTAssertFalse(label.contains(ConversationLockedPreviewLine.label), label)
    }

    func test_lentilleRow_whenContentLocked_speaksTheLockNeverTheLastMessage() {
        let label = LentilleConversationRow(
            conversation: makeRowConversation(),
            isContentLocked: true,
            preferredContentLanguages: ["fr"]
        ).accessibilityLabel

        XCTAssertFalse(label.contains("1234"), label)
        XCTAssertTrue(label.contains(ConversationLockedPreviewLine.label), label)
    }

    /// La frappe ne se trahit pas non plus par la pastille : sous verrou, elle
    /// garde la présence servie au lieu de passer au vert.
    func test_lentilleRow_whenContentLocked_typingDoesNotForceThePresenceDot() {
        let locked = LentilleConversationRow(
            conversation: makeRowConversation(), presenceState: .offline,
            typingUsername: "Alice", isContentLocked: true, preferredContentLanguages: ["fr"]
        )
        let open = LentilleConversationRow(
            conversation: makeRowConversation(), presenceState: .offline,
            typingUsername: "Alice", preferredContentLanguages: ["fr"]
        )
        XCTAssertEqual(locked.effectivePresenceState, .offline)
        XCTAssertEqual(open.effectivePresenceState, .online)
    }

    func test_rows_reRenderWhenTheLockFlips() {
        let conversation = makeRowConversation()
        let open = ThemedConversationRow(conversation: conversation, preferredContentLanguages: ["fr"])
        let sealed = ThemedConversationRow(conversation: conversation, isContentLocked: true, preferredContentLanguages: ["fr"])
        XCTAssertFalse(open == sealed, "le portillon .equatable() ne gèle pas une rangée qui se verrouille")

        let lentilleOpen = LentilleConversationRow(conversation: conversation, preferredContentLanguages: ["fr"])
        let lentilleSealed = LentilleConversationRow(conversation: conversation, isContentLocked: true, preferredContentLanguages: ["fr"])
        XCTAssertFalse(lentilleOpen == lentilleSealed)
    }

    // MARK: - #11387 — le chargeur ne revalide pas ce qui se verrouille en vol

    func test_previewLoader_lockDuringInFlightCacheRead_neverPublishesNorReachesNetwork() async {
        let pin = PinLock()
        let (sut, service, cache) = makeSUT(
            cache: .stale([makeMessage()], age: 4_000),
            isLocked: { _ in pin.isLocked }
        )
        cache.holdsNextRead = true
        let id = conversationId

        let open = Task { await sut.load(for: id, intent: .open) }
        await cache.waitUntilHeld()
        pin.isLocked = true
        cache.release()
        await open.value

        XCTAssertEqual(service.listCallCount, 0, "aucune revalidation réseau pour une conversation verrouillée en vol")
        pin.isLocked = false
        XCTAssertEqual(sut.state(for: id).phase, .loading, "rien de ce que le cache a lu n'a été publié")
    }
}
