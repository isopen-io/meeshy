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

    /// F1 (audit de #12722) : le mémo est indexé par message. Un même
    /// (identifiant, cryptogramme) demandé sous une AUTRE clé — le même message
    /// rejoué par un serveur malveillant dans une autre conversation directe —
    /// ne sort jamais du mémo : il repasse par la recherche de clé, et échoue.
    func test_decrypt_sameMessageUnderAnotherSender_neverComesFromTheMemo() async {
        let provider = KeyedSessionProvider(sessions: ["user-bob"])
        let actor = DecryptionActor(provider: provider)
        let ciphertext = Data("Code 4242".utf8)

        let underBob = await actor.decrypt([DecryptionPayload(messageId: "m1", senderId: "user-bob", ciphertext: ciphertext)])
        let underCarol = await actor.decrypt([DecryptionPayload(messageId: "m1", senderId: "user-carol", ciphertext: ciphertext)])

        XCTAssertEqual(underBob.first?.plaintext, "Code 4242", "précondition")
        XCTAssertNil(underCarol.first?.plaintext, "le clair de Bob ne s'ouvre jamais sous la clé de Carol")
        XCTAssertNotNil(underCarol.first?.error)
        let calls = await provider.callCount
        XCTAssertEqual(calls, 2, "la seconde demande cherche sa propre clé")
    }

    /// Un lot qui demande le même identifiant sous deux clés ne dit pas
    /// laquelle a ouvert le clair : rien n'entre au mémo, et la clé qui a
    /// échoué n'hérite jamais du clair de l'autre.
    func test_decrypt_sameIdUnderTwoSendersInOneBatch_neverMemoizesAcrossKeys() async {
        let provider = KeyedSessionProvider(sessions: ["user-bob"])
        let actor = DecryptionActor(provider: provider)
        let ciphertext = Data("Code 4242".utf8)

        _ = await actor.decrypt([
            DecryptionPayload(messageId: "m1", senderId: "user-bob", ciphertext: ciphertext),
            DecryptionPayload(messageId: "m1", senderId: "user-carol", ciphertext: ciphertext)
        ])
        let underCarol = await actor.decrypt([DecryptionPayload(messageId: "m1", senderId: "user-carol", ciphertext: ciphertext)])

        XCTAssertNil(underCarol.first?.plaintext)
    }

    /// Le mémo sert encore la même demande sous la même clé.
    func test_decrypt_sameMessageUnderTheSameSender_comesFromTheMemo() async {
        let provider = KeyedSessionProvider(sessions: ["user-bob"])
        let actor = DecryptionActor(provider: provider)
        let payload = DecryptionPayload(messageId: "m1", senderId: "user-bob", ciphertext: Data("Code 4242".utf8))

        _ = await actor.decrypt([payload])
        let again = await actor.decrypt([payload])

        XCTAssertEqual(again.first?.plaintext, "Code 4242")
        let calls = await provider.callCount
        XCTAssertEqual(calls, 1)
    }
}

/// Ne « déchiffre » que sous les identifiants qui ont une session.
private actor KeyedSessionProvider: DecryptionSessionProviding {
    private let sessions: Set<String>
    private(set) var callCount = 0
    init(sessions: Set<String>) { self.sessions = sessions }

    func decryptMessage(_ ciphertext: Data, from senderId: String) async throws -> Data {
        callCount += 1
        guard sessions.contains(senderId) else { throw NSError(domain: "test", code: -2) }
        return ciphertext
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
