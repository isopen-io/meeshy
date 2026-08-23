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

    /// Chaque `messagesDidChange` re-soumet la fenêtre entière : un même
    /// (messageId, ciphertext) ne doit payer l'AES qu'une seule fois.
    func test_decrypt_samePayloadTwice_hitsProviderOnce() async {
        let provider = MockSessionProvider()
        let actor = DecryptionActor(provider: provider)
        let payload = DecryptionPayload(messageId: "m1", senderId: "u1",
                                        ciphertext: Data("hello".utf8))

        let first = await actor.decrypt([payload])
        let second = await actor.decrypt([payload])

        XCTAssertEqual(first.first?.plaintext, "hello")
        XCTAssertEqual(second.first?.plaintext, "hello")
        XCTAssertEqual(second.first?.messageId, "m1")
        XCTAssertNil(second.first?.error)
        let calls = await provider.callCount
        XCTAssertEqual(calls, 1, "le second passage doit sortir du mémo, pas du provider")
    }

    /// Un edit re-chiffré change le ciphertext : l'entrée mémo est invalide
    /// et le message repasse par le provider.
    func test_decrypt_changedCiphertext_invalidatesMemo() async {
        let provider = MockSessionProvider()
        let actor = DecryptionActor(provider: provider)

        _ = await actor.decrypt([DecryptionPayload(messageId: "m1", senderId: "u1",
                                                   ciphertext: Data("v1".utf8))])
        let results = await actor.decrypt([DecryptionPayload(messageId: "m1", senderId: "u1",
                                                             ciphertext: Data("v2".utf8))])

        XCTAssertEqual(results.first?.plaintext, "v2")
        let calls = await provider.callCount
        XCTAssertEqual(calls, 2)
    }

    /// Un échec (session E2EE indisponible) n'est jamais mémoïsé — le refresh
    /// suivant doit pouvoir réussir.
    func test_decrypt_failureIsNotMemoized_retriesProvider() async {
        let provider = MockSessionProvider(shouldFail: true)
        let actor = DecryptionActor(provider: provider)
        let payload = DecryptionPayload(messageId: "m1", senderId: "u1",
                                        ciphertext: Data("hello".utf8))

        _ = await actor.decrypt([payload])
        await provider.setShouldFail(false)
        let results = await actor.decrypt([payload])

        XCTAssertEqual(results.first?.plaintext, "hello")
        let calls = await provider.callCount
        XCTAssertEqual(calls, 2, "l'échec ne doit pas coller au mémo")
    }
}

private actor MockSessionProvider: DecryptionSessionProviding {
    private(set) var shouldFail: Bool
    private(set) var callCount = 0
    init(shouldFail: Bool = false) { self.shouldFail = shouldFail }

    func setShouldFail(_ value: Bool) { shouldFail = value }

    func decryptMessage(_ ciphertext: Data, from senderId: String) async throws -> Data {
        callCount += 1
        if shouldFail { throw NSError(domain: "test", code: -1) }
        // Mock: return ciphertext as plaintext for the test (no real crypto)
        return ciphertext
    }
}
