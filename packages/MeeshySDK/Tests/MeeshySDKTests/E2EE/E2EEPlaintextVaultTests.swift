import CryptoKit
import Foundation
import GRDB
import XCTest
@testable import MeeshyE2EE

/// Le coffre des clairs ne sert que le compte dont cette installation est
/// enrôlée (#13000), et un clair effacé le quitte (#13001). Modèle : un
/// serveur compromis qui sert à B des conversations de A sur le même appareil,
/// et un appareil volé qui garde le texte d'un message supprimé.
final class E2EEPlaintextVaultTests: XCTestCase {
    private let alice = String(repeating: "a1", count: 12)
    private let bob = String(repeating: "b2", count: 12)

    private func vault(enrolledFor userId: String?) throws -> E2EEGRDBRecordVault {
        let vault = try E2EEGRDBRecordVault(writer: try DatabaseQueue(), sealingKey: SymmetricKey(size: .bits256))
        if let userId {
            try vault.write { try E2EELocalEnrollmentRecord.save(E2EELocalDevice(userId: userId, deviceId: 1, registrationId: 7), in: $0) }
        }
        return vault
    }

    private func entry(_ text: String, by userId: String) -> E2EEPlaintextEntry {
        .readable(E2EEContent(text: text, language: "fr", replyTo: nil, conversationId: "c1", clientMessageId: "cid", sentAt: Date(timeIntervalSince1970: 1_790_000_000)), senderUserId: userId)
    }

    func test_entries_forTheEnrolledAccount_areServed() throws {
        let records = try vault(enrolledFor: alice)
        try E2EEPlaintextVault(vault: records, owner: alice).save(entry("bonjour", by: alice), for: "m1")

        XCTAssertEqual(try E2EEPlaintextVault(vault: records, owner: alice).entries(for: ["m1"]), ["m1": entry("bonjour", by: alice)])
    }

    func test_entries_forAnotherAccount_areNeverServed() throws {
        let records = try vault(enrolledFor: alice)
        try E2EEPlaintextVault(vault: records, owner: alice).save(entry("secret d'Alice", by: alice), for: "m1")

        let asBob = E2EEPlaintextVault(vault: records, owner: bob)

        XCTAssertEqual(try asBob.entries(for: ["m1"]), [:], "B ne lit jamais le coffre de A")
        XCTAssertNil(try asBob.entry(for: "m1"))
        XCTAssertEqual(try asBob.storedMessageIds(), [])
    }

    func test_entries_withoutEnrollment_areNeverServedToANamedAccount() throws {
        let records = try vault(enrolledFor: nil)
        try E2EEPlaintextVault(vault: records).save(entry("orphelin", by: alice), for: "m1")

        XCTAssertEqual(try E2EEPlaintextVault(vault: records, owner: alice).entries(for: ["m1"]), [:])
    }

    func test_save_forAnotherAccount_isRefused_andWritesNothing() throws {
        let records = try vault(enrolledFor: alice)

        XCTAssertThrowsError(try E2EEPlaintextVault(vault: records, owner: bob).save(entry("de B", by: bob), for: "m2")) { error in
            XCTAssertEqual(error as? E2EEPlaintextVaultError, .foreignAccount)
        }
        XCTAssertEqual(try records.read { try $0.keys(of: .plaintext) }, [])
    }

    func test_remove_erasesTheEntriesOnly_ofTheNamedMessages() throws {
        let records = try vault(enrolledFor: alice)
        let store = E2EEPlaintextVault(vault: records, owner: alice)
        try store.save(entry("effacé", by: alice), for: "m1")
        try store.save(entry("effacé aussi", by: alice), for: "cid_m1")
        try store.save(entry("gardé", by: alice), for: "m2")

        try store.remove(["m1", "cid_m1", "absent"])

        XCTAssertEqual(try store.storedMessageIds(), ["m2"])
        XCTAssertEqual(try store.entries(for: ["m1", "cid_m1"]), [:])
    }

    func test_remove_forAnotherAccount_isRefused() throws {
        let records = try vault(enrolledFor: alice)
        try E2EEPlaintextVault(vault: records, owner: alice).save(entry("à A", by: alice), for: "m1")

        XCTAssertThrowsError(try E2EEPlaintextVault(vault: records, owner: bob).remove(["m1"]))
        XCTAssertEqual(try E2EEPlaintextVault(vault: records, owner: alice).storedMessageIds(), ["m1"])
    }

    func test_aRemovedEntry_leavesNoSealedRowInTheFile() throws {
        let records = try vault(enrolledFor: alice)
        let store = E2EEPlaintextVault(vault: records, owner: alice)
        try store.save(entry("message supprimé", by: alice), for: "m1")

        try store.remove(["m1"])

        XCTAssertEqual(try records.read { try $0.keys(of: .plaintext) }, [])
    }
}
