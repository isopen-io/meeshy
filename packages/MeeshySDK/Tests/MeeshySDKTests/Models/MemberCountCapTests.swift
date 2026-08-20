import XCTest
@testable import MeeshySDK

/// Cap 199+ de l'effectif : le serveur sert `memberCount` plafonné à 199 avec
/// `memberCountCapped: true` pour tout lecteur non admin plateforme. Le drapeau
/// doit survivre au round-trip Codable (cache GRDB) et piloter l'affichage
/// (« 199+ » — chiffres + « + », identique dans toutes les langues).
final class MemberCountCapTests: XCTestCase {

    private func decodeConversation(_ json: String) throws -> MeeshyConversation {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(MeeshyConversation.self, from: json.data(using: .utf8)!)
    }

    private func baseJSON(extra: String = "") -> String {
        """
        {
          "id": "conv-cap",
          "identifier": "general",
          "type": "group",
          "memberCount": 199,
          \(extra)
          "isActive": true,
          "lastMessageAt": "2026-08-20T12:00:00Z",
          "createdAt": "2026-08-01T00:00:00Z",
          "updatedAt": "2026-08-20T12:00:00Z"
        }
        """
    }

    func test_decode_readsMemberCountCappedFlag() throws {
        let conv = try decodeConversation(baseJSON(extra: "\"memberCountCapped\": true,"))
        XCTAssertEqual(conv.memberCount, 199)
        XCTAssertTrue(conv.memberCountCapped)
    }

    func test_decode_flagAbsent_defaultsToFalse() throws {
        let conv = try decodeConversation(baseJSON())
        XCTAssertFalse(conv.memberCountCapped)
    }

    func test_codableRoundTrip_preservesCappedFlag() throws {
        var conv = try decodeConversation(baseJSON(extra: "\"memberCountCapped\": true,"))
        conv.memberCountCapped = true

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let revived = try decoder.decode(MeeshyConversation.self, from: encoder.encode(conv))

        XCTAssertTrue(revived.memberCountCapped)
        XCTAssertEqual(revived.memberCount, 199)
    }

    func test_memberCountDisplay_appendsPlusWhenCapped() throws {
        var conv = MeeshyConversation(identifier: "disp", memberCount: 199)
        conv.memberCountCapped = true
        XCTAssertEqual(conv.memberCountDisplay, "199+")
    }

    func test_memberCountDisplay_plainNumberWhenExact() {
        let conv = MeeshyConversation(identifier: "disp", memberCount: 42)
        XCTAssertEqual(conv.memberCountDisplay, "42")
    }

    func test_participantsPagination_decodesTotalCountCapped() throws {
        let json = """
        {"success":true,"data":[],"pagination":{"nextCursor":null,"hasMore":false,"totalCount":199,"totalCountCapped":true}}
        """.data(using: .utf8)!
        let response = try JSONDecoder().decode(PaginatedParticipantsResponse.self, from: json)
        XCTAssertEqual(response.pagination?.totalCount, 199)
        XCTAssertEqual(response.pagination?.totalCountCapped, true)
    }

    func test_apiConversation_toConversation_propagatesCappedFlag() {
        let api = APIConversation(
            id: "conv-api",
            type: "group",
            memberCount: 199,
            memberCountCapped: true,
            createdAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
        let conv = api.toConversation(currentUserId: "me")
        XCTAssertEqual(conv.memberCount, 199)
        XCTAssertTrue(conv.memberCountCapped)
    }
}
