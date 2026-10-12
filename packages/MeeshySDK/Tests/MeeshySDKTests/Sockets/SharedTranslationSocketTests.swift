import Combine
import Foundation
import XCTest
@testable import MeeshySDK

/// #9899 — les traductions qui arrivent sur une conversation : celle du serveur
/// (`message:translation`, déplacée avec son écouteur) et celle qu'un autre
/// membre partage (`message:translation-shared`, une `SharedTranslation` par
/// charge).
final class SharedTranslationSocketTests: XCTestCase {

    private let payload = #"""
    {
        "id": "st1",
        "conversationId": "64f0c0ffee0000000000c0de",
        "messageId": "64f0c0ffee0000000000a001",
        "targetLanguage": "fr",
        "envelope": { "v": 1, "alg": "A256GCM", "kdf": "message-content", "payload": "AAECAwQFBgcICQoLIaP2d4BN5n7LZzhFfM5LMgef8yGgP//5NrcvJA9z36m/" },
        "sharedBy": "participant-7",
        "sharedAt": "2026-10-10T08:15:30.000Z"
    }
    """#

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Sockets
            .deletingLastPathComponent() // MeeshySDKTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // MeeshySDK
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_socketPayload_decodesAsASharedTranslation() throws {
        let shared = try JSONDecoder().decode(SharedTranslation.self, from: Data(payload.utf8))

        XCTAssertEqual(shared.id, "st1")
        XCTAssertEqual(shared.messageId, "64f0c0ffee0000000000a001")
        XCTAssertEqual(shared.targetLanguage, "fr")
        XCTAssertEqual(shared.envelope.kdf, .messageContent)
        XCTAssertEqual(shared.sharedBy, "participant-7")
    }

    func test_channel_relaysWhatTheSocketDecoded() throws {
        let shared = try JSONDecoder().decode(SharedTranslation.self, from: Data(payload.utf8))
        var received: [SharedTranslation] = []
        let subscription = SharedTranslationSocketChannel.events.sink { received.append($0) }

        SharedTranslationSocketChannel.events.send(shared)
        subscription.cancel()

        XCTAssertEqual(received, [shared])
    }

    func test_socketManager_registersTheTranslationHandlersFromItsExtension() throws {
        let manager = try sdkSource("Sources/MeeshySDK/Sockets/MessageSocketManager.swift")

        XCTAssertTrue(manager.contains("registerTranslationHandlers(on: socket)"))
        XCTAssertFalse(
            manager.contains("socket.on(\"message:translation\")"),
            "l'écouteur a déménagé dans MessageSocketManager+Translations.swift, le gestionnaire est hors budget"
        )
    }

    func test_translationExtension_listensToBothEventsAndRoutesEachToItsOwnChannel() throws {
        let source = try sdkSource("Sources/MeeshySDK/Sockets/MessageSocketManager+Translations.swift")

        XCTAssertTrue(source.contains("socket.on(\"message:translation\")"))
        XCTAssertTrue(source.contains("self?.translationReceived.send(event)"))
        XCTAssertTrue(source.contains("socket.on(\"message:translation-shared\")"))
        XCTAssertTrue(source.contains("SharedTranslationSocketChannel.events.send(shared)"))
    }
}
