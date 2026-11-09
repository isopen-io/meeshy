import Foundation
import LibSignalClient
import XCTest
@testable import MeeshyE2EE

/// Les VECTEURS CROISÉS libsignal (#17113) : le fichier COMMUN
/// `packages/shared/fixtures/libsignal/cross-platform.vectors.json`, scellé par
/// la passerelle et rejoué tel quel par elle (jest) et par `:core:e2ee` Android,
/// s'ouvre ici par le chiffreur de PRODUCTION (`E2EESessionCipher`) sur la base
/// scellée de l'appareil. PQXDH depuis les seules pré-clés, puis des sessions
/// sérialisées rechargées (rétrocompatibilité #9231). Les jeux de `legacy/`,
/// scellés par une version ANTÉRIEURE, s'ouvrent de même : une session
/// persistée avant une montée survit à la montée. Une charge altérée d'un octet
/// est refusée.
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

    private static let fixturesURL: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("packages/shared/fixtures/libsignal/")
    }()

    private static let fileURL = fixturesURL.appendingPathComponent("cross-platform.vectors.json")

    private static var legacyURLs: [URL] {
        let directory = fixturesURL.appendingPathComponent("legacy")
        let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
        return names.filter { $0.hasSuffix(".vectors.json") }.sorted().map { directory.appendingPathComponent($0) }
    }

    private static let libsignalVersionURL: URL = {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("packages/LibSignalClient/LIBSIGNAL_VERSION")
    }()

    private func loadVectors() throws -> Vectors {
        try loadVectors(Self.fileURL)
    }

    private func loadVectors(_ url: URL) throws -> Vectors {
        try JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url))
    }

    private func allVectorSets() throws -> [Vectors] {
        try ([Self.fileURL] + Self.legacyURLs).map { try loadVectors($0) }
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

    /// Le premier octet porte la version dans son quartet HAUT : le quartet bas de
    /// l'enveloppe PreKeySignalMessage n'est couvert par aucun MAC et libsignal
    /// l'ignore, donc l'altération de version bascule le quartet haut.
    private enum TamperedByte: CaseIterable {
        case version, middle, last

        func flip(_ body: inout Data) {
            switch self {
            case .version: body[body.startIndex] ^= 0x10
            case .middle: body[body.startIndex + body.count / 2] ^= 0x01
            case .last: body[body.index(before: body.endIndex)] ^= 0x01
            }
        }
    }

    private func tampered(_ message: WireMessage, at byte: TamperedByte) throws -> E2EECiphertext {
        var body = try bytes(message.body)
        byte.flip(&body)
        return E2EECiphertext(type: message.type, body: body)
    }

    private func opened(_ data: Data) -> String {
        String(decoding: data, as: UTF8.self)
    }

    func test_vectors_areSealedByTheLibsignalVersionThisSDKPins() throws {
        let pinned = try String(contentsOf: Self.libsignalVersionURL, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let sealedBy = try loadVectors().libsignal
        XCTAssertEqual("v\(sealedBy)", pinned)
    }

    func test_aSetSealedByAnEarlierVersion_isReplayed() throws {
        let current = try loadVectors().libsignal
        let legacy = try Self.legacyURLs.map { try loadVectors($0).libsignal }
        XCTAssertFalse(legacy.isEmpty, "aucun jeu de legacy/ : une session persistée avant une montée n'est plus éprouvée")
        XCTAssertFalse(legacy.contains(current))
    }

    func test_freshSession_bobOpensBothPreKeyMessagesFromHisPreKeysAlone() throws {
        for vectors in try allVectorSets() {
            let bob = try bobWithPreKeys(vectors)

            let plaintexts = try vectors.freshSession.messages.map { message in
                opened(try bob.cipher.decrypt(try ciphertext(message), from: address(vectors.alice)))
            }

            XCTAssertEqual(vectors.freshSession.messages.map(\.type), [E2EECiphertext.preKeyType, E2EECiphertext.preKeyType], vectors.libsignal)
            XCTAssertEqual(plaintexts, vectors.freshSession.messages.map(\.plaintext), vectors.libsignal)
        }
    }

    func test_persistedSessions_reloadedFromTheirSerializedRecords_openTheNextSignalMessage_onBothSides() throws {
        for vectors in try allVectorSets() {
            let reply = vectors.persistedSessions.aliceOpensReply
            let third = vectors.persistedSessions.bobOpensThird
            let alice = try device(vectors.alice, persisting: reply.session, with: vectors.bob.party)
            let bob = try device(vectors.bob.party, persisting: third.session, with: vectors.alice)

            XCTAssertEqual([reply.message.type, third.message.type], [E2EECiphertext.whisperType, E2EECiphertext.whisperType], vectors.libsignal)
            XCTAssertEqual(opened(try alice.cipher.decrypt(try ciphertext(reply.message), from: address(vectors.bob.party))), reply.message.plaintext, vectors.libsignal)
            XCTAssertEqual(opened(try bob.cipher.decrypt(try ciphertext(third.message), from: address(vectors.alice))), third.message.plaintext, vectors.libsignal)
        }
    }

    func test_eachPayloadAlteredByOneByte_atTheVersionTheMiddleOrTheEnd_isRefused() throws {
        for vectors in try allVectorSets() {
            for byte in TamperedByte.allCases {
                let reply = vectors.persistedSessions.aliceOpensReply
                let third = vectors.persistedSessions.bobOpensThird
                let first = try XCTUnwrap(vectors.freshSession.messages.first)
                let freshBob = try bobWithPreKeys(vectors)
                let alice = try device(vectors.alice, persisting: reply.session, with: vectors.bob.party)
                let persistedBob = try device(vectors.bob.party, persisting: third.session, with: vectors.alice)
                let alteredFirst = try tampered(first, at: byte)
                let alteredReply = try tampered(reply.message, at: byte)
                let alteredThird = try tampered(third.message, at: byte)
                let label = "\(vectors.libsignal) \(byte)"

                XCTAssertThrowsError(try freshBob.cipher.decrypt(alteredFirst, from: address(vectors.alice)), label)
                XCTAssertThrowsError(try alice.cipher.decrypt(alteredReply, from: address(vectors.bob.party)), label)
                XCTAssertThrowsError(try persistedBob.cipher.decrypt(alteredThird, from: address(vectors.alice)), label)
            }
        }
    }
}
