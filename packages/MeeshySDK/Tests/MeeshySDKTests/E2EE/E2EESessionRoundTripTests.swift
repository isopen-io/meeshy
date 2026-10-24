import Foundation
import LibSignalClient
import XCTest
@testable import MeeshyE2EE

/// PQXDH puis Double Ratchet entre deux appareils dont les stores sont les
/// stores PERSISTANTS de Meeshy (base GRDB scellée), pas ceux de libsignal en
/// mémoire (spec § 8.2). Double Ratchet § 2.6 « Out-of-order messages » : un
/// message en retard se déchiffre, un message perdu ne bloque pas la suite.
final class E2EESessionRoundTripTests: XCTestCase {
    private let alice = String(repeating: "a1", count: 12)
    private let bob = String(repeating: "b2", count: 12)

    private func pair() throws -> (alice: E2EETestDevice, bob: E2EETestDevice) {
        let aliceDevice = try E2EETestDevice.make(userId: alice)
        let bobDevice = try E2EETestDevice.make(userId: bob)
        let bobEnrollment = try bobDevice.factory.enrollment(userId: bob, platform: .ios, label: nil, now: Date())
        try aliceDevice.cipher.startSession(with: E2EETestDirectory.bundle(of: bobEnrollment, deviceId: 1), of: bob)
        return (aliceDevice, bobDevice)
    }

    func test_firstMessage_isAPreKeyMessageThatBobOpens_andConsumesTheOneTimeKeys() throws {
        let (aliceDevice, bobDevice) = try pair()

        let first = try aliceDevice.cipher.encrypt(Data("bonjour".utf8), for: bobDevice.address)
        let opened = try bobDevice.cipher.decrypt(first, from: aliceDevice.address)

        XCTAssertEqual(first.type, E2EECiphertext.preKeyType)
        XCTAssertEqual(String(decoding: opened, as: UTF8.self), "bonjour")
        let remaining = try bobDevice.vault.read { try $0.keys(of: .preKey) }
        XCTAssertEqual(remaining.count, E2EEPreKeyPolicy.batchSize - 1, "la pré-clé unique EC est consommée")
        XCTAssertThrowsError(try bobDevice.cipher.decrypt(first, from: aliceDevice.address), "un rejeu ne s'ouvre pas")
    }

    func test_hundredMessagesBothWays_outOfOrderAndWithLosses_keepTheSessionAlive() throws {
        let (aliceDevice, bobDevice) = try pair()
        let hello = try aliceDevice.cipher.encrypt(Data("hello".utf8), for: bobDevice.address)
        _ = try bobDevice.cipher.decrypt(hello, from: aliceDevice.address)

        var generator = SystemRandomNumberGenerator()
        for round in 0..<10 {
            let (sender, receiver) = round.isMultiple(of: 2) ? (aliceDevice, bobDevice) : (bobDevice, aliceDevice)
            let batch = try (0..<10).map { index -> (String, E2EECiphertext) in
                let text = "r\(round)-m\(index)"
                return (text, try sender.cipher.encrypt(Data(text.utf8), for: receiver.address))
            }
            let lost = Int.random(in: 0..<10, using: &generator)
            let delivered = batch.enumerated().filter { $0.offset != lost }.map(\.element).shuffled(using: &generator)
            for (text, ciphertext) in delivered {
                let plain = try receiver.cipher.decrypt(ciphertext, from: sender.address)
                XCTAssertEqual(String(decoding: plain, as: UTF8.self), text)
            }
        }

        let last = try bobDevice.cipher.encrypt(Data("fin".utf8), for: aliceDevice.address)
        XCTAssertEqual(last.type, E2EECiphertext.whisperType)
        XCTAssertEqual(String(decoding: try aliceDevice.cipher.decrypt(last, from: bobDevice.address), as: UTF8.self), "fin")
    }

    func test_withoutOneTimeKeys_theLastResortKyberKeyOpensTheSession_andSurvivesItsUse() throws {
        let aliceDevice = try E2EETestDevice.make(userId: alice)
        let bobDevice = try E2EETestDevice.make(userId: bob)
        let enrollment = try bobDevice.factory.enrollment(userId: bob, platform: .ios, label: nil, now: Date())
        try aliceDevice.cipher.startSession(with: E2EETestDirectory.bundle(of: enrollment, deviceId: 1, oneTimeIndex: nil), of: bob)

        let first = try aliceDevice.cipher.encrypt(Data("sans pré-clé".utf8), for: bobDevice.address)

        XCTAssertEqual(String(decoding: try bobDevice.cipher.decrypt(first, from: aliceDevice.address), as: UTF8.self), "sans pré-clé")
        let lastResort = try bobDevice.vault.read { try $0.load(.kyberPreKey, String(enrollment.kyberLastResort.keyId)) }
        XCTAssertNotNil(lastResort, "la Kyber de dernier recours n'est pas effacée")
    }

    func test_aForgedSignedPreKeySignature_isRefusedBeforeAnySession() throws {
        let aliceDevice = try E2EETestDevice.make(userId: alice)
        let bobDevice = try E2EETestDevice.make(userId: bob)
        let enrollment = try bobDevice.factory.enrollment(userId: bob, platform: .ios, label: nil, now: Date())
        let honest = E2EETestDirectory.bundle(of: enrollment, deviceId: 1)
        let forgedSignature = PrivateKey.generate().generateSignature(message: Data(base64Encoded: honest.signedPreKey.publicKey)!)
        let forged = E2EEDeviceBundle(
            deviceId: honest.deviceId, registrationId: honest.registrationId, identityKey: honest.identityKey,
            signedPreKey: E2EESignedKey(keyId: honest.signedPreKey.keyId, publicKey: honest.signedPreKey.publicKey, signature: forgedSignature.base64EncodedString()),
            kyberPreKey: honest.kyberPreKey, preKey: honest.preKey
        )

        XCTAssertThrowsError(try aliceDevice.cipher.startSession(with: forged, of: bob))
        XCTAssertFalse(try aliceDevice.cipher.hasSession(with: bobDevice.address))
    }

    func test_aChangedContactIdentity_isAcceptedButSignalled() throws {
        let device = try E2EETestDevice.make(userId: alice)
        let address = try ProtocolAddress(name: bob, deviceId: 1)
        let first = IdentityKeyPair.generate().identityKey
        let second = IdentityKeyPair.generate().identityKey

        let changes = try device.vault.write { transaction in
            [
                try device.store.saveIdentity(first, for: address, context: transaction),
                try device.store.saveIdentity(first, for: address, context: transaction),
                try device.store.saveIdentity(second, for: address, context: transaction),
            ]
        }

        XCTAssertEqual(changes, [.newOrUnchanged, .newOrUnchanged, .replacedExisting])
    }
}
