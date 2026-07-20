import XCTest
@testable import MeeshySDK

/// Voice profile fields (`voicePublic`, `voiceSampleUrl`, `voiceSampleDurationMs`,
/// `voiceQuality`) added to `MeeshyUser` to map the gateway `GET /users/:id`
/// response. They MUST be optional and rollout-safe: an older response that
/// omits them decodes cleanly with every voice field `nil` (synthesized Codable
/// keyed by property name, same plain `JSONDecoder()` the other MeeshyUser
/// decode tests use).
final class MeeshyUserVoiceDecodeTests: XCTestCase {

    func test_decode_withVoiceFields_mapsAllValues() throws {
        let json = """
        {
            "id": "abc123",
            "username": "voiceuser",
            "voicePublic": true,
            "voiceSampleUrl": "https://cdn.meeshy.me/voice/abc123.m4a",
            "voiceSampleDurationMs": 4200,
            "voiceQuality": 0.87
        }
        """.data(using: .utf8)!

        let user = try JSONDecoder().decode(MeeshyUser.self, from: json)

        XCTAssertEqual(user.id, "abc123")
        XCTAssertEqual(user.username, "voiceuser")
        XCTAssertEqual(user.voicePublic, true)
        XCTAssertEqual(user.voiceSampleUrl, "https://cdn.meeshy.me/voice/abc123.m4a")
        XCTAssertEqual(user.voiceSampleDurationMs, 4200)
        XCTAssertEqual(user.voiceQuality ?? -1, 0.87, accuracy: 0.0001)
    }

    func test_decode_withoutVoiceFields_allNil() throws {
        let json = """
        {
            "id": "abc123",
            "username": "legacyuser",
            "systemLanguage": "fr"
        }
        """.data(using: .utf8)!

        let user = try JSONDecoder().decode(MeeshyUser.self, from: json)

        XCTAssertEqual(user.id, "abc123")
        XCTAssertEqual(user.username, "legacyuser")
        XCTAssertNil(user.voicePublic)
        XCTAssertNil(user.voiceSampleUrl)
        XCTAssertNil(user.voiceSampleDurationMs)
        XCTAssertNil(user.voiceQuality)
    }

    func test_roundtrip_preservesVoiceFields() throws {
        let original = MeeshyUser(
            id: "u1", username: "voiceuser",
            voicePublic: false,
            voiceSampleUrl: "https://cdn.meeshy.me/voice/u1.m4a",
            voiceSampleDurationMs: 1500,
            voiceQuality: 0.5
        )

        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(MeeshyUser.self, from: data)

        XCTAssertEqual(decoded.voicePublic, false)
        XCTAssertEqual(decoded.voiceSampleUrl, "https://cdn.meeshy.me/voice/u1.m4a")
        XCTAssertEqual(decoded.voiceSampleDurationMs, 1500)
        XCTAssertEqual(decoded.voiceQuality ?? -1, 0.5, accuracy: 0.0001)
    }
}
