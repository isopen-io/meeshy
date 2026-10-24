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

        init(reads: [ContentOriginKeyRead], addResult: ContentOriginKeyAdd = .stored) {
            self.reads = reads
            self.addResult = addResult
        }

        func read() -> ContentOriginKeyRead {
            reads.isEmpty ? .unavailable : reads.removeFirst()
        }

        func add(_ key: Data) -> ContentOriginKeyAdd {
            added.append(key)
            return addResult
        }
    }

    private let stored = Data(repeating: 0x11, count: 32)
    private let fresh = Data(repeating: 0x22, count: 32)

    private func resolve(_ vault: FakeVault) -> Data {
        ContentOriginDeviceKey.resolve(using: vault, generate: { fresh })
    }

    func test_aStoredKey_isReused_andNothingIsWritten() {
        let vault = FakeVault(reads: [.value(stored)])

        XCTAssertEqual(resolve(vault), stored)
        XCTAssertTrue(vault.added.isEmpty)
    }

    func test_noKeyYet_aFreshOneIsGeneratedAndStoredOnce() {
        let vault = FakeVault(reads: [.absent])

        XCTAssertEqual(resolve(vault), fresh)
        XCTAssertEqual(vault.added, [fresh])
    }

    /// L'app et l'extension de notification tirent leur clé en même temps :
    /// celle qui arrive seconde adopte la clé gardée, jamais la sienne.
    func test_aConcurrentFirstWrite_adoptsTheKeyTheOtherProcessStored() {
        let vault = FakeVault(reads: [.absent, .value(stored)], addResult: .duplicate)

        XCTAssertEqual(resolve(vault), stored)
    }

    /// Appareil verrouillé depuis le démarrage : la clé gardée existe peut-être,
    /// et l'écraser rendrait muette toute provenance déjà scellée. Rien n'est
    /// écrit ; le processus scelle avec une clé à lui, qui meurt avec lui.
    func test_anUnavailableKeychain_isNeverOverwritten_theProcessUsesAnEphemeralKey() {
        let vault = FakeVault(reads: [.unavailable])

        XCTAssertEqual(resolve(vault), fresh)
        XCTAssertTrue(vault.added.isEmpty)
    }

    func test_aFailedWrite_leavesAnEphemeralKey() {
        let vault = FakeVault(reads: [.absent], addResult: .failed)

        XCTAssertEqual(resolve(vault), fresh)
    }

    func test_aDuplicateThatCannotBeReadBack_leavesAnEphemeralKey() {
        let vault = FakeVault(reads: [.absent, .unavailable], addResult: .duplicate)

        XCTAssertEqual(resolve(vault), fresh)
    }

    func test_aGeneratedKey_is256BitsOfRandomness() {
        let first = ContentOriginDeviceKey.generate()
        let second = ContentOriginDeviceKey.generate()

        XCTAssertEqual(first.count, 32)
        XCTAssertNotEqual(first, second)
    }

    /// La clé du processus est résolue une fois : toutes les empreintes d'une
    /// session se vérifient entre elles.
    func test_theProcessKey_isStable() {
        XCTAssertEqual(ContentOriginDeviceKey.current, ContentOriginDeviceKey.current)
        XCTAssertEqual(ContentOriginDeviceKey.current.count, 32)
    }
}
