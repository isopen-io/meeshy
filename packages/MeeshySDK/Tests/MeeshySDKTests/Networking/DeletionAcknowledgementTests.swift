import XCTest
@testable import MeeshySDK

/// #10605 — un DELETE réussi ne s'affiche jamais en échec : les formes que la
/// passerelle sert réellement se décodent toutes.
final class DeletionAcknowledgementTests: XCTestCase {

    private func decode(_ json: String) throws -> APIResponse<[String: Bool]> {
        try JSONDecoder().decode(DeletionAcknowledgement.self, from: Data(json.utf8)).response
    }

    func test_decode_revocationDesAutresSessions_messageEtCompteur_reussit() throws {
        let response = try decode(#"{"success":true,"data":{"message":"3 session(s) révoquée(s) avec succès","revokedCount":3}}"#)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.data, [:])
    }

    func test_decode_revocationDUneSession_messageSeul_reussit() throws {
        let response = try decode(#"{"success":true,"data":{"message":"Session révoquée avec succès"}}"#)
        XCTAssertTrue(response.success)
    }

    func test_decode_drapeauxBooleens_restentLisibles() throws {
        let response = try decode(#"{"success":true,"data":{"deleted":true,"message":"ok","count":2}}"#)
        XCTAssertEqual(response.data, ["deleted": true])
    }

    func test_decode_sansData_ouDataNul_ouDataTableau_reussit() throws {
        XCTAssertTrue(try decode(#"{"success":true}"#).success)
        XCTAssertTrue(try decode(#"{"success":true,"data":null}"#).success)
        XCTAssertTrue(try decode(#"{"success":true,"data":[1,2]}"#).success)
    }

    func test_decode_garde_leSuccesEtLErreurServis() throws {
        let response = try decode(#"{"success":false,"error":"Refusé"}"#)
        XCTAssertFalse(response.success)
        XCTAssertEqual(response.error, "Refusé")
    }

    func test_apiClient_lesDeuxDeleteSansCorps_decodentLAccuse() throws {
        let source = try String(contentsOf: URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Sources/MeeshySDK/Networking/APIClient.swift"), encoding: .utf8)
        XCTAssertFalse(source.contains("APIResponse<[String: Bool]> {\n        return try await stringRequest"),
                       "delete(endpoint:) ne doit plus décoder la charge en [String: Bool]")
        XCTAssertFalse(source.contains("APIResponse<[String: Bool]> {\n        try await request(endpoint, method: \"DELETE\")"),
                       "delete(_:) ne doit plus décoder la charge en [String: Bool]")
        XCTAssertEqual(source.components(separatedBy: "DeletionAcknowledgement").count - 1, 2)
    }
}
