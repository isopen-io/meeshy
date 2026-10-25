import Combine
import XCTest
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// **Un message chiffré reçu d'un pair se lit sur iOS, déchiffré sur l'appareil
/// par libsignal, dans l'aperçu d'appui long ET dans la ligne de liste** (#12720).
///
/// Deux installations libsignal RÉELLES de l'app (enrôlement, scelleur, ouvreur
/// de production) sur une fausse passerelle : Bob scelle, la passerelle relaie
/// l'enveloppe opaque, l'appareil d'Alice l'ouvre. Les deux surfaces de la liste
/// lisent alors le clair dans le coffre d'Alice — jamais dans ce que le serveur
/// sert, qui ne porte que le littéral `[Encrypted]`. Le fil est prouvé de la
/// même façon par `EndToEndThreadDisplayTests` (#12916).
@MainActor
final class EndToEndPeerMessageReadingTests: XCTestCase {
    private let alice = "00000000000000000000aa11"
    private let bob = "00000000000000000000bb22"
    private let conversationId = "00000000000000000000ab01"
    private let messageId = "00000000000000000000ab51"
    private let secret = "Le code de la porte est 4721"
    private let sentAt = Date(timeIntervalSince1970: 1_792_929_600)

    private func installation(_ userId: String, on gateway: LibsignalTestGateway) async throws -> EndToEndMessagingRuntime {
        let runtime = EndToEndMessagingRuntime(provisioning: try LibsignalDeviceProvisioning.inMemory(on: gateway, userId: userId))
        _ = try await runtime.ready(for: userId)
        return runtime
    }

    /// Bob écrit à Alice ; l'appareil d'Alice ouvre ce que la passerelle lui pousse.
    private func bobWritesToAlice() async throws -> (alice: EndToEndMessagingRuntime, gateway: LibsignalTestGateway) {
        let gateway = LibsignalTestGateway()
        let aliceDevice = try await installation(alice, on: gateway)
        let bobDevice = try await installation(bob, on: gateway)
        let content = E2EEContent(
            text: secret, language: "fr", replyTo: nil, conversationId: conversationId,
            clientMessageId: "cid_bob_1", sentAt: sentAt
        )
        let (bob, conversationId, messageId) = (bob, conversationId, messageId)
        try await bobDevice.deliver(content, from: bob, to: alice) { sealed in
            gateway.relay(sealed, from: bob, conversationId: conversationId, messageId: messageId)
        }
        for envelope in gateway.pending(for: alice) { await aliceDevice.receive(envelope, as: alice) }
        return (aliceDevice, gateway)
    }

    /// Ce que la passerelle sert du message : le littéral, jamais le clair.
    private func servedPage() -> MessagesAPIResponse {
        JSONStub.decode("""
        {"success":true,"data":[{"id":"\(messageId)","conversationId":"\(conversationId)","senderId":"participant-bob","sender":{"id":"participant-bob","userId":"\(bob)","type":"user"},"content":"\(E2EEWire.contentPlaceholder)","originalLanguage":"fr","isEncrypted":true,"encryptionMode":"e2ee","createdAt":"2026-10-25T12:00:00.000Z","updatedAt":"2026-10-25T12:00:00.000Z","clientMessageId":"cid_bob_1","translations":[]}],"pagination":null,"cursorPagination":null,"hasNewer":null}
        """)
    }

    private func sealedRow() -> Conversation {
        var row = Conversation(
            id: conversationId, identifier: conversationId, type: .direct,
            lastMessageAt: sentAt.addingTimeInterval(2),
            encryptionMode: E2EEWire.mode, lastMessagePreview: "",
            lastMessageId: messageId
        )
        row.lastMessageSenderName = "Bob"
        row.lastMessageSenderUserId = ConversationListAuthor.peerUserId(senderUserId: bob, senderName: "Bob", readerId: alice)
        row.lastMessageNature = LastMessageNature(messageType: "text", isEncrypted: true)
        return row
    }

    func test_aPeersMessage_readsInTheLongPressPreview_decryptedOnThisDevice() async throws {
        let (aliceDevice, gateway) = try await bobWritesToAlice()
        let service = MockMessageService()
        service.listResult = .success(servedPage())
        let loader = ConversationListPreviewLoader(
            messageService: service,
            cache: MockConversationPreviewCache(messages: .empty, translations: [:]),
            readerPrism: { ["fr"] },
            isLocked: { _ in false },
            endToEnd: aliceDevice,
            locksDidChange: Empty<Void, Never>().eraseToAnyPublisher(),
            regimeMemory: EndToEndRegimeMemory(defaults: nil),
            sessionsDidBegin: Empty<Void, Never>().eraseToAnyPublisher(),
            signedInUsers: Empty<MeeshyUser?, Never>().eraseToAnyPublisher()
        )
        let alice = alice

        await loader.load(for: conversationId, intent: .open, currentUserId: { alice })

        let shown = loader.state(for: conversationId).snapshot?.messages.first
        XCTAssertEqual(shown?.content, secret)
        XCTAssertEqual(shown?.isContentDecryptedOnDevice, true)
        XCTAssertFalse(gateway.wire.contains { String(decoding: $0, as: UTF8.self).contains("4721") }, "le fil de la passerelle ne voit que l'enveloppe")
    }

    func test_aPeersMessage_readsInTheConversationListRow_decryptedOnThisDevice() async throws {
        let (aliceDevice, _) = try await bobWritesToAlice()
        let rows = CurrentValueSubject<[Conversation], Never>([sealedRow()])
        let alice = alice
        let store = ConversationListEndToEndTextStore(
            rows: rows.eraseToAnyPublisher(), endToEnd: aliceDevice,
            viewerId: { alice }, mineRetryDelay: .milliseconds(150), willChange: {}
        )

        let deadline = Date().addingTimeInterval(3)
        while store.text(for: conversationId) == nil, Date() < deadline { try? await Task.sleep(for: .milliseconds(10)) }

        XCTAssertEqual(store.text(for: conversationId)?.text, secret)
        let persisted = String(decoding: (try? JSONEncoder().encode(rows.value)) ?? Data(), as: UTF8.self)
        XCTAssertFalse(persisted.contains("4721"), "le clair n'entre jamais dans le cache des conversations")
    }

    func test_aMessageFromSomeoneOtherThanTheAnnouncedAuthor_staysSealedInBothSurfaces() async throws {
        let (aliceDevice, _) = try await bobWritesToAlice()
        var row = sealedRow()
        row.lastMessageSenderName = "Carol"
        row.lastMessageSenderUserId = ConversationListAuthor.peerUserId(senderUserId: "00000000000000000000cc33", senderName: "Carol", readerId: alice)
        let rows = CurrentValueSubject<[Conversation], Never>([row])
        let alice = alice
        let store = ConversationListEndToEndTextStore(
            rows: rows.eraseToAnyPublisher(), endToEnd: aliceDevice,
            viewerId: { alice }, mineRetryDelay: .milliseconds(150), willChange: {}
        )

        try? await Task.sleep(for: .milliseconds(300))

        XCTAssertNil(store.text(for: conversationId), "un serveur qui réattribue le message ne fait pas lire le clair sous un autre nom")
    }
}
