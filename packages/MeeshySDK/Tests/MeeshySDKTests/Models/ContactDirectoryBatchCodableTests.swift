import XCTest
@testable import MeeshySDK

/// Contrat de synchronisation du carnet PAR LOTS (2026-08-25).
///
/// Les deux champs de lot sont OPTIONNELS des deux côtés du fil : une gateway
/// antérieure ne doit voir aucune clé nouvelle quand le client n'envoie qu'un
/// lot, et un client à jour doit lire `nil` — jamais échouer — quand la réponse
/// ne porte pas encore le jeton.
final class ContactDirectoryBatchCodableTests: XCTestCase {

    private func encodedObject(_ request: DirectorySyncRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(request)
        let object = try JSONSerialization.jsonObject(with: data)
        return try XCTUnwrap(object as? [String: Any])
    }

    private func makeEntry() -> ContactMatchEntry {
        ContactMatchEntry(displayName: "Awa", phoneNumbers: ["+221771234567"])
    }

    // MARK: - Requête

    func test_encode_withoutBatchFields_omitsBothKeys() throws {
        let json = try encodedObject(
            DirectorySyncRequest(contacts: [makeEntry()], defaultCountry: "SN", mode: .replace)
        )

        XCTAssertNil(json["syncStartedAt"], "une gateway antérieure au contrat de lots ne doit voir aucune clé nouvelle")
        XCTAssertNil(json["isFinalBatch"])
        XCTAssertEqual(json["mode"] as? String, "replace")
        XCTAssertEqual(json["defaultCountry"] as? String, "SN")
    }

    func test_encode_withBatchFields_writesCamelCaseKeys() throws {
        let json = try encodedObject(
            DirectorySyncRequest(
                contacts: [makeEntry()],
                defaultCountry: "SN",
                mode: .merge,
                syncStartedAt: "2026-08-25T10:00:00.000Z",
                isFinalBatch: true
            )
        )

        XCTAssertEqual(json["syncStartedAt"] as? String, "2026-08-25T10:00:00.000Z")
        XCTAssertEqual(json["isFinalBatch"] as? Bool, true)
        XCTAssertEqual(json["mode"] as? String, "merge")
    }

    func test_encode_isFinalBatchFalse_isStillWritten_neverConfusedWithAbsence() throws {
        let json = try encodedObject(
            DirectorySyncRequest(contacts: [], mode: .merge, syncStartedAt: "t", isFinalBatch: false)
        )

        XCTAssertEqual(json["isFinalBatch"] as? Bool, false)
    }

    // MARK: - Réponse

    func test_decode_resultWithoutSyncStartedAt_yieldsNil() throws {
        let json = Data("""
        {"totalContacts":3,"processedContacts":3,"syncedCount":3,"matchedCount":1,"removedCount":0}
        """.utf8)

        let result = try JSONDecoder().decode(DirectorySyncResult.self, from: json)

        XCTAssertNil(result.syncStartedAt, "gateway antérieure : décodage tolérant, jamais d'échec")
        XCTAssertEqual(result.syncedCount, 3)
    }

    func test_decode_resultWithSyncStartedAt_readsTheServerClock() throws {
        let json = Data("""
        {"totalContacts":3,"processedContacts":3,"syncedCount":3,"matchedCount":1,
         "removedCount":2,"syncStartedAt":"2026-08-25T10:00:00.000Z"}
        """.utf8)

        let result = try JSONDecoder().decode(DirectorySyncResult.self, from: json)

        XCTAssertEqual(result.syncStartedAt, "2026-08-25T10:00:00.000Z")
        XCTAssertEqual(result.removedCount, 2)
    }
}
