import Foundation
import XCTest
@testable import MeeshySDK

/// **La clé qui scelle la provenance d'un clair déchiffré est un secret de CET
/// appareil** (#11402, audit de #11526).
///
/// #11382 dérivait la clé de l'id du message : une donnée publique, que la
/// passerelle ou quiconque réécrit le cache recalcule. La clé est désormais
/// tirée au hasard UNE fois par appareil et gardée dans le trousseau
/// (`AfterFirstUnlockThisDeviceOnly`, jamais sauvegardée ni synchronisée) ;
/// un trousseau indisponible ne la remplace jamais — le processus prend une
/// clé éphémère, et ce qu'elle scelle ne survit pas au redémarrage
/// (fail-closed).
final class ContentOriginDeviceKeyTests: XCTestCase {

    private final class FakeVault: ContentOriginKeyVault, @unchecked Sendable {
        var reads: [ContentOriginKeyRead]
        var addResult: ContentOriginKeyAdd
        private(set) var added: [Data] = []
        private(set) var readCount = 0

        init(reads: [ContentOriginKeyRead], addResult: ContentOriginKeyAdd = .stored) {
            self.reads = reads
            self.addResult = addResult
        }

        func read() -> ContentOriginKeyRead {
            readCount += 1
            return reads.isEmpty ? .unavailable : reads.removeFirst()
        }

        func add(_ key: Data) -> ContentOriginKeyAdd {
            added.append(key)
            return addResult
        }
    }

    private let stored = Data(repeating: 0x11, count: 32)
    private let fresh = Data(repeating: 0x22, count: 32)

    private func resolve(_ vault: FakeVault) -> ContentOriginKeyResolution {
        ContentOriginDeviceKey.resolve(using: vault, generate: { fresh })
    }

    func test_aStoredKey_isReused_andNothingIsWritten() {
        let vault = FakeVault(reads: [.value(stored)])

        XCTAssertEqual(resolve(vault), .durable(stored))
        XCTAssertTrue(vault.added.isEmpty)
    }

    func test_noKeyYet_aFreshOneIsGeneratedAndStoredOnce() {
        let vault = FakeVault(reads: [.absent])

        XCTAssertEqual(resolve(vault), .durable(fresh))
        XCTAssertEqual(vault.added, [fresh])
    }

    /// L'app et l'extension de notification tirent leur clé en même temps :
    /// celle qui arrive seconde adopte la clé gardée, jamais la sienne.
    func test_aConcurrentFirstWrite_adoptsTheKeyTheOtherProcessStored() {
        let vault = FakeVault(reads: [.absent, .value(stored)], addResult: .duplicate)

        XCTAssertEqual(resolve(vault), .durable(stored))
    }

    /// Appareil verrouillé depuis le démarrage : la clé gardée existe peut-être,
    /// et l'écraser rendrait muette toute provenance déjà scellée. Rien n'est
    /// écrit ; le processus scelle avec une clé à lui, qui meurt avec lui.
    func test_anUnavailableKeychain_isNeverOverwritten_theProcessUsesAnEphemeralKey() {
        let vault = FakeVault(reads: [.unavailable])

        XCTAssertEqual(resolve(vault), .ephemeral(fresh))
        XCTAssertTrue(vault.added.isEmpty)
    }

    func test_aFailedWrite_leavesAnEphemeralKey() {
        let vault = FakeVault(reads: [.absent], addResult: .failed)

        XCTAssertEqual(resolve(vault), .ephemeral(fresh))
    }

    func test_aDuplicateThatCannotBeReadBack_leavesAnEphemeralKey() {
        let vault = FakeVault(reads: [.absent, .unavailable], addResult: .duplicate)

        XCTAssertEqual(resolve(vault), .ephemeral(fresh))
    }

    func test_aGeneratedKey_is256BitsOfRandomness() {
        let first = ContentOriginDeviceKey.generate()
        let second = ContentOriginDeviceKey.generate()

        XCTAssertEqual(first.count, 32)
        XCTAssertNotEqual(first, second)
    }

    /// La clé du processus ne change pas d'un accès à l'autre : toutes les
    /// empreintes d'une session se vérifient entre elles.
    func test_theProcessKey_isStable() {
        XCTAssertEqual(ContentOriginDeviceKey.current, ContentOriginDeviceKey.current)
        XCTAssertEqual(ContentOriginDeviceKey.current.count, 32)
    }

    // MARK: - La clé d'un processus lancé avant le premier déverrouillage (#12721)

    private final class Clock: @unchecked Sendable {
        var instant = Date(timeIntervalSince1970: 1_000)
        func advance(_ seconds: TimeInterval) { instant = instant.addingTimeInterval(seconds) }
    }

    private final class GeneratedKeys: @unchecked Sendable {
        private(set) var count = 0
        func next() -> Data {
            count += 1
            return Data(repeating: UInt8(count), count: 32)
        }
    }

    private func holder(_ vault: FakeVault, clock: Clock) -> ContentOriginKeyHolder {
        let ephemeral = fresh
        return ContentOriginKeyHolder(vault: vault, generate: { ephemeral }, now: { clock.instant }, retryInterval: 1)
    }

    func test_aKeyUnavailableAtLaunch_isReadAgainAfterTheFirstUnlock() {
        let vault = FakeVault(reads: [.unavailable, .value(stored)])
        let clock = Clock()
        let sut = holder(vault, clock: clock)

        XCTAssertEqual(sut.current(), fresh, "verrouillé : la clé éphémère du processus")
        clock.advance(1)
        XCTAssertEqual(sut.current(), stored, "déverrouillé : la clé gardée remplace l'éphémère")
    }

    func test_aStoredKey_isNeverReadAgain() {
        let vault = FakeVault(reads: [.value(stored)])
        let clock = Clock()
        let sut = holder(vault, clock: clock)

        _ = sut.current()
        clock.advance(60)

        XCTAssertEqual(sut.current(), stored)
        XCTAssertEqual(vault.readCount, 1)
    }

    /// Ce que l'éphémère a scellé pendant le verrouillage doit encore se vérifier.
    func test_whileTheKeychainStaysClosed_theEphemeralKeyStaysTheSame() {
        let vault = FakeVault(reads: [.unavailable, .unavailable])
        let clock = Clock()
        let keys = GeneratedKeys()
        let sut = ContentOriginKeyHolder(vault: vault, generate: { keys.next() }, now: { clock.instant }, retryInterval: 1)

        let first = sut.current()
        clock.advance(1)

        XCTAssertEqual(sut.current(), first)
        XCTAssertEqual(vault.readCount, 2)
        XCTAssertEqual(keys.count, 1)
    }

    func test_theClosedKeychain_isRetriedAtMostOncePerInterval() {
        let vault = FakeVault(reads: [.unavailable, .unavailable])
        let clock = Clock()
        let sut = holder(vault, clock: clock)

        (0..<50).forEach { _ in _ = sut.current() }
        XCTAssertEqual(vault.readCount, 1)
        clock.advance(1)
        _ = sut.current()
        XCTAssertEqual(vault.readCount, 2)
    }

    /// Le trousseau se rouvre VIDE : la clé qui a scellé pendant le verrouillage
    /// y est gardée, et ses empreintes restent vérifiables.
    func test_aKeychainThatReopensEmpty_keepsTheEphemeralKey() {
        let vault = FakeVault(reads: [.unavailable, .absent])
        let clock = Clock()
        let sut = holder(vault, clock: clock)

        let sealedWhileLocked = MessageContentOrigin.decrypted("Salut", messageId: "m1", key: sut.current())
        clock.advance(1)
        let key = sut.current()

        XCTAssertEqual(vault.added, [fresh])
        XCTAssertTrue(sealedWhileLocked.vouches(for: "Salut", messageId: "m1", key: key))
    }
}
