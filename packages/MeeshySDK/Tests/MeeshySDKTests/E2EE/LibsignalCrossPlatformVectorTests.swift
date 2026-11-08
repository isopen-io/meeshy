import Foundation
import LibSignalClient
import XCTest
@testable import MeeshyE2EE

/// Les VECTEURS CROISÉS libsignal (#17113) : le fichier COMMUN
/// `packages/shared/fixtures/libsignal/cross-platform.vectors.json`, scellé par
/// la passerelle et rejoué tel quel par elle (jest) et par `:core:e2ee` Android,
/// s'ouvre ici par le chiffreur de PRODUCTION (`E2EESessionCipher`) sur la base
/// scellée de l'appareil. PQXDH depuis les seules pré-clés, puis des sessions
/// sérialisées rechargées (rétrocompatibilité #9231). Une charge altérée d'un
/// octet est refusée.
final class LibsignalCrossPlatformVectorTests: XCTestCase {
    private struct Party: Decodable {
        let name: String
        let deviceId: UInt32
        let registrationId: UInt32
        let identityKeyPair: String
    }

    private struct KeyRecord: Decodable {
        let id: UInt32
        let record: String
    }

    private struct Bob: Decodable {
        let name: String
        let deviceId: UInt32
        let registrationId: UInt32
        let identityKeyPair: String
        let signedPreKey: KeyRecord
        let kyberPreKey: KeyRecord
        let preKey: KeyRecord

        var party: Party { Party(name: name, deviceId: deviceId, registrationId: registrationId, identityKeyPair: identityKeyPair) }
    }

    private struct WireMessage: Decodable {
        let type: Int
        let body: String
        let plaintext: String
    }

    private struct FreshSession: Decodable {
        let messages: [WireMessage]
    }

    private struct PersistedSession: Decodable {
        let session: String
        let message: WireMessage
    }

    private struct PersistedSessions: Decodable {
        let aliceOpensReply: PersistedSession
        let bobOpensThird: PersistedSession
    }

    private struct Vectors: Decodable {
        let libsignal: String
        let alice: Party
        let bob: Bob
        let freshSession: FreshSession
        let persistedSessions: PersistedSessions
    }

    private static let fileURL: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("packages/shared/fixtures/libsignal/cross-platform.vectors.json")
    }()

    private static let libsignalVersionURL: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("packages/LibSignalClient/LIBSIGNAL_VERSION")
    }()

    private func loadVectors() throws -> Vectors {
        try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: Self.fileURL))
    }

    private func bytes(_ base64: String) throws -> Data {
        try XCTUnwrap(Data(base64Encoded: base64), "base64 illisible dans les vecteurs")
    }

    private func address(_ party: Party) -> E2EEDeviceAddress {
        E2EEDeviceAddress(userId: party.name, deviceId: party.deviceId)
    }

    private func device(_ party: Party) throws -> E2EETestDevice {
        let identity = E2EELocalIdentity(keyPair: try IdentityKeyPair(bytes: bytes(party.identityKeyPair)), registrationId: party.registrationId)
        return try E2EETestDevice.make(userId: party.name, deviceId: party.deviceId, identity: identity)
    }

    private func bobWithPreKeys(_ vectors: Vectors) throws -> E2EETestDevice {
        let bob = try device(vectors.bob.party)
        let signed = try SignedPreKeyRecord(bytes: bytes(vectors.bob.signedPreKey.record))
        let kyber = try KyberPreKeyRecord(bytes: bytes(vectors.bob.kyberPreKey.record))
        let oneTime = try PreKeyRecord(bytes: bytes(vectors.bob.preKey.record))
        try bob.vault.write { transaction in
            try bob.store.storeSignedPreKey(signed, id: vectors.bob.signedPreKey.id, context: transaction)
            try bob.store.storeKyberPreKey(kyber, id: vectors.bob.kyberPreKey.id, context: transaction)
            try bob.store.storePreKey(oneTime, id: vectors.bob.preKey.id, context: transaction)
        }
        return bob
    }

    private func device(_ party: Party, persisting session: String, with peer: Party) throws -> E2EETestDevice {
        let owner = try device(party)
        let record = try SessionRecord(bytes: bytes(session))
        let remote = try ProtocolAddress(name: peer.name, deviceId: peer.deviceId)
        try owner.vault.write { transaction in try owner.store.storeSession(record, for: remote, context: transaction) }
        return owner
    }

    private func ciphertext(_ message: WireMessage) throws -> E2EECiphertext {
        E2EECiphertext(type: message.type, body: try bytes(message.body))
    }

    private func tampered(_ message: WireMessage) throws -> E2EECiphertext {
        var body = try bytes(message.body)
        body[body.index(before: body.endIndex)] ^= 0x01
        return E2EECiphertext(type: message.type, body: body)
    }

    private func opened(_ data: Data) -> String {
        String(decoding: data, as: UTF8.self)
    }

    func test_vectors_areSealedByTheLibsignalVersionThisSDKPins() throws {
        let pinned = try String(contentsOf: Self.libsignalVersionURL, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        XCTAssertEqual("v\(try loadVectors().libsignal)", pinned)
    }

    func test_freshSession_bobOpensBothPreKeyMessagesFromHisPreKeysAlone() throws {
        let vectors = try loadVectors()
        let bob = try bobWithPreKeys(vectors)

        let plaintexts = try vectors.freshSession.messages.map { message in
            opened(try bob.cipher.decrypt(try ciphertext(message), from: address(vectors.alice)))
        }

        XCTAssertEqual(vectors.freshSession.messages.map(\.type), [E2EECiphertext.preKeyType, E2EECiphertext.preKeyType])
        XCTAssertEqual(plaintexts, vectors.freshSession.messages.map(\.plaintext))
    }

    func test_persistedSessions_reloadedFromTheirSerializedRecords_openTheNextSignalMessage_onBothSides() throws {
        let vectors = try loadVectors()
        let reply = vectors.persistedSessions.aliceOpensReply
        let third = vectors.persistedSessions.bobOpensThird
        let alice = try device(vectors.alice, persisting: reply.session, with: vectors.bob.party)
        let bob = try device(vectors.bob.party, persisting: third.session, with: vectors.alice)

        XCTAssertEqual([reply.message.type, third.message.type], [E2EECiphertext.whisperType, E2EECiphertext.whisperType])
        XCTAssertEqual(opened(try alice.cipher.decrypt(try ciphertext(reply.message), from: address(vectors.bob.party))), reply.message.plaintext)
        XCTAssertEqual(opened(try bob.cipher.decrypt(try ciphertext(third.message), from: address(vectors.alice))), third.message.plaintext)
    }

    func test_eachPayloadAlteredByOneByte_isRefused() throws {
        let vectors = try loadVectors()
        let reply = vectors.persistedSessions.aliceOpensReply
        let third = vectors.persistedSessions.bobOpensThird
        let first = try XCTUnwrap(vectors.freshSession.messages.first)
        let freshBob = try bobWithPreKeys(vectors)
        let alice = try device(vectors.alice, persisting: reply.session, with: vectors.bob.party)
        let persistedBob = try device(vectors.bob.party, persisting: third.session, with: vectors.alice)
        let alteredFirst = try tampered(first)
        let alteredReply = try tampered(reply.message)
        let alteredThird = try tampered(third.message)

        XCTAssertThrowsError(try freshBob.cipher.decrypt(alteredFirst, from: address(vectors.alice)))
        XCTAssertThrowsError(try alice.cipher.decrypt(alteredReply, from: address(vectors.bob.party)))
        XCTAssertThrowsError(try persistedBob.cipher.decrypt(alteredThird, from: address(vectors.alice)))
    }
}
