import XCTest
@testable import MeeshySDK

/// `ConversationSyncEngine` construit un `SyncDeltaClient(baseURL:)` à chaque
/// synchronisation, avec le transport par défaut. Chaque transport créait sa
/// propre `URLSession` éphémère, jamais invalidée : une poignée de main TCP/TLS
/// par synchronisation et des sessions qui s'accumulent sur une longue durée.
final class SyncDeltaTransportSharedSessionTests: XCTestCase {

    func test_defaultTransports_shareOneSession() {
        let first = URLSessionSyncDeltaTransport()
        let second = URLSessionSyncDeltaTransport()
        XCTAssertEqual(first.sessionIdentity, second.sessionIdentity)
    }
}
