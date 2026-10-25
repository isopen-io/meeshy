import Foundation
import os
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
        var instant: TimeInterval = 1_000
        func advance(_ seconds: TimeInterval) { instant += seconds }
        func rewind(_ seconds: TimeInterval) { instant -= seconds }
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
        return ContentOriginKeyHolder(vault: vault, generate: { ephemeral }, uptime: { clock.instant }, retryInterval: 1)
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
        let sut = ContentOriginKeyHolder(vault: vault, generate: { keys.next() }, uptime: { clock.instant }, retryInterval: 1)

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

    /// Une horloge qui RECULE (l'heure murale réglée en arrière) ne fige pas
    /// l'éphémère : le trousseau se relit, et la clé gardée la remplace.
    func test_aClockThatGoesBackwards_doesNotFreezeTheEphemeralKey() {
        let vault = FakeVault(reads: [.unavailable, .value(stored)])
        let clock = Clock()
        let sut = holder(vault, clock: clock)

        XCTAssertEqual(sut.current(), fresh)
        clock.rewind(3_600)

        XCTAssertEqual(sut.current(), stored, "une heure en arrière ne fige pas la clé éphémère")
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

    // MARK: - Un trousseau qui reste fermé ne se sollicite pas chaque seconde

    /// Une valeur abîmée ne se lira jamais : la relecture s'espace, du double
    /// à chaque échec, jusqu'au plafond.
    func test_aKeychainThatStaysClosed_isRetriedLessAndLessOften() {
        let vault = FakeVault(reads: [])
        let clock = Clock()
        let sut = ContentOriginKeyHolder(
            vault: vault, generate: { Data(repeating: 0x22, count: 32) }, uptime: { clock.instant },
            retryInterval: 1, maxRetryInterval: 8
        )

        _ = sut.current()
        var readsAtEachSecond: [Int] = []
        for _ in 0..<40 {
            clock.advance(1)
            _ = sut.current()
            readsAtEachSecond.append(vault.readCount)
        }

        XCTAssertEqual(Array(readsAtEachSecond.prefix(8)), [2, 2, 3, 3, 3, 3, 4, 4],
                       "1 s, puis 2 s, puis 4 s entre deux relectures")
        XCTAssertLessThanOrEqual(vault.readCount, 2 + 40 / 8 + 2, "plafonné à 8 s, jamais une relecture par seconde")
    }

    func test_theRetryDelay_doublesUpToItsCap() {
        let sut = ContentOriginKeyHolder(vault: FakeVault(reads: []), generate: { Data() }, retryInterval: 1, maxRetryInterval: 300)

        XCTAssertEqual((0..<6).map { sut.retryDelay(afterFailedRetries: $0) }, [1, 2, 4, 8, 16, 32])
        XCTAssertEqual(sut.retryDelay(afterFailedRetries: 9), 300)
        XCTAssertEqual(sut.retryDelay(afterFailedRetries: 10_000), 300)
    }

    /// Le trousseau rouvert remet l'intervalle à zéro : une clé gardée ne se
    /// relit plus du tout.
    func test_aKeyFinallyRead_endsTheRetries() {
        let vault = FakeVault(reads: [.unavailable, .unavailable, .unavailable, .value(stored)])
        let clock = Clock()
        let sut = holder(vault, clock: clock)

        _ = sut.current()
        clock.advance(1)
        _ = sut.current()
        clock.advance(2)
        _ = sut.current()
        clock.advance(4)

        XCTAssertEqual(sut.current(), stored)
        clock.advance(3_600)
        XCTAssertEqual(sut.current(), stored)
        XCTAssertEqual(vault.readCount, 4)
    }

    /// Un vault qui BLOQUE sa relecture jusqu'à ce que le test la relâche.
    private final class BlockingVault: ContentOriginKeyVault {
        private let reads = OSAllocatedUnfairLock(initialState: 0)
        let enteredSecondRead = DispatchSemaphore(value: 0)
        let releaseSecondRead = DispatchSemaphore(value: 0)
        let stored: Data

        init(stored: Data) { self.stored = stored }

        var readCount: Int { reads.withLock { $0 } }

        func read() -> ContentOriginKeyRead {
            let index = reads.withLock { count in
                count += 1
                return count
            }
            guard index == 2 else { return index == 1 ? .unavailable : .value(stored) }
            enteredSecondRead.signal()
            releaseSecondRead.wait()
            return .value(stored)
        }

        func add(_ key: Data) -> ContentOriginKeyAdd { .failed }
    }

    private final class Box: Sendable {
        private let value = OSAllocatedUnfairLock<Data?>(initialState: nil)
        func set(_ newValue: Data) { value.withLock { $0 = newValue } }
        func get() -> Data? { value.withLock { $0 } }
    }

    /// La relecture du trousseau se fait HORS du verrou du processus : pendant
    /// qu'elle attend, un autre appel reçoit l'éphémère sans attendre, et ne
    /// lance pas une seconde relecture.
    func test_aRetryInFlight_blocksNoOtherCaller_andIsNotDuplicated() {
        let vault = BlockingVault(stored: stored)
        let clock = Clock()
        let ephemeral = fresh
        let sut = ContentOriginKeyHolder(vault: vault, generate: { ephemeral }, uptime: { clock.instant }, retryInterval: 1)
        XCTAssertEqual(sut.current(), fresh)
        clock.advance(1)

        let retried = expectation(description: "la relecture aboutit")
        let retriedKey = Box()
        DispatchQueue.global().async {
            retriedKey.set(sut.current())
            retried.fulfill()
        }
        XCTAssertEqual(vault.enteredSecondRead.wait(timeout: .now() + 5), .success)

        let concurrent = expectation(description: "un appel concurrent n'attend pas le trousseau")
        let concurrentKey = Box()
        DispatchQueue.global().async {
            concurrentKey.set(sut.current())
            concurrent.fulfill()
        }
        let waited = XCTWaiter().wait(for: [concurrent], timeout: 2)
        vault.releaseSecondRead.signal()
        wait(for: [retried], timeout: 5)

        XCTAssertEqual(waited, .completed, "l'appel concurrent a attendu la relecture du trousseau")
        XCTAssertEqual(concurrentKey.get(), fresh, "en attendant, l'éphémère")
        XCTAssertEqual(retriedKey.get(), stored)
        XCTAssertEqual(vault.readCount, 2, "une seule relecture à la fois")
        XCTAssertEqual(sut.current(), stored)
    }
}
