import XCTest
@testable import MeeshySDK

final class DecryptionActorTests: XCTestCase {

    func test_decrypt_returnsPlaintext_offMain() async throws {
        let provider = MockSessionProvider()
        let actor = DecryptionActor(provider: provider)
        let payloads = [
            DecryptionPayload(messageId: "m1", senderId: "u1",
                              ciphertext: Data("hello".utf8))
        ]

        let results = await actor.decrypt(payloads)

        XCTAssertEqual(results.count, 1)
        XCTAssertEqual(results.first?.messageId, "m1")
        XCTAssertEqual(results.first?.plaintext, "hello")
    }

    func test_decrypt_failure_returnsNilPlaintext() async {
        let provider = MockSessionProvider(shouldFail: true)
        let actor = DecryptionActor(provider: provider)
        let payload = DecryptionPayload(messageId: "m1", senderId: "u1", ciphertext: Data())

        let results = await actor.decrypt([payload])

        XCTAssertNil(results.first?.plaintext)
        XCTAssertNotNil(results.first?.error)
    }
}

private final class MockSessionProvider: DecryptionSessionProviding {
    let shouldFail: Bool
    init(shouldFail: Bool = false) { self.shouldFail = shouldFail }

    func decryptMessage(_ ciphertext: Data, from senderId: String) async throws -> Data {
        if shouldFail { throw NSError(domain: "test", code: -1) }
        // Mock: return ciphertext as plaintext for the test (no real crypto)
        return ciphertext
    }
}
