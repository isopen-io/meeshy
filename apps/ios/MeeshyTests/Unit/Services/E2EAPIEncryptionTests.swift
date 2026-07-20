import XCTest
@testable import Meeshy

@MainActor
final class E2EAPIEncryptionTests: XCTestCase {

    // MARK: - ConversationEncryptionMode

    func test_mode_rawValues_matchBackendContract() {
        XCTAssertEqual(E2EAPI.ConversationEncryptionMode.e2ee.rawValue, "e2ee")
        XCTAssertEqual(E2EAPI.ConversationEncryptionMode.server.rawValue, "server")
        XCTAssertEqual(E2EAPI.ConversationEncryptionMode.hybrid.rawValue, "hybrid")
    }

    func test_mode_allCases_isExhaustive() {
        XCTAssertEqual(E2EAPI.ConversationEncryptionMode.allCases.count, 3)
        XCTAssertEqual(
            Set(E2EAPI.ConversationEncryptionMode.allCases.map(\.rawValue)),
            Set(["e2ee", "server", "hybrid"])
        )
    }

    // MARK: - Codable round trips

    func test_encryptionStatus_decodesActiveServerMode() throws {
        let json = #"""
        {
            "isEncrypted": true,
            "mode": "server",
            "enabledAt": "2026-01-15T10:00:00Z",
            "enabledBy": "user-1",
            "canTranslate": true
        }
        """#.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let status = try decoder.decode(E2EAPI.ConversationEncryptionStatus.self, from: json)

        XCTAssertTrue(status.isEncrypted)
        XCTAssertEqual(status.mode, .server)
        XCTAssertEqual(status.enabledBy, "user-1")
        XCTAssertTrue(status.canTranslate)
        XCTAssertNotNil(status.enabledAt)
    }

    func test_encryptionStatus_decodesInactiveStateWithNullMode() throws {
        let json = #"""
        {
            "isEncrypted": false,
            "mode": null,
            "enabledAt": null,
            "enabledBy": null,
            "canTranslate": true
        }
        """#.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let status = try decoder.decode(E2EAPI.ConversationEncryptionStatus.self, from: json)

        XCTAssertFalse(status.isEncrypted)
        XCTAssertNil(status.mode)
        XCTAssertNil(status.enabledAt)
        XCTAssertNil(status.enabledBy)
    }

    func test_encryptionStatus_decodesE2EEModeWithTranslationDisabled() throws {
        let json = #"""
        {
            "isEncrypted": true,
            "mode": "e2ee",
            "enabledAt": "2026-01-15T10:00:00Z",
            "enabledBy": "user-2",
            "canTranslate": false
        }
        """#.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let status = try decoder.decode(E2EAPI.ConversationEncryptionStatus.self, from: json)

        XCTAssertEqual(status.mode, .e2ee)
        XCTAssertFalse(status.canTranslate)
    }

    func test_enableEncryptionResult_decodesAllFields() throws {
        let json = #"""
        {
            "conversationId": "conv-1",
            "mode": "hybrid",
            "enabledAt": "2026-01-15T10:00:00Z",
            "enabledBy": "user-3"
        }
        """#.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let result = try decoder.decode(E2EAPI.EnableConversationEncryptionResult.self, from: json)

        XCTAssertEqual(result.conversationId, "conv-1")
        XCTAssertEqual(result.mode, .hybrid)
        XCTAssertEqual(result.enabledBy, "user-3")
    }

    func test_encryptionStatus_rejectsInvalidModeString() {
        let json = #"""
        {
            "isEncrypted": true,
            "mode": "totally-not-a-mode",
            "enabledAt": "2026-01-15T10:00:00Z",
            "enabledBy": "user-1",
            "canTranslate": true
        }
        """#.data(using: .utf8)!

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        XCTAssertThrowsError(
            try decoder.decode(E2EAPI.ConversationEncryptionStatus.self, from: json)
        )
    }
}
