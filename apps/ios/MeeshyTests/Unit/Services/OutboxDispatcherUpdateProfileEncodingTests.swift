import XCTest
@testable import Meeshy

/// Covers the wire-encoding contract behind `OutboxDispatcher.dispatchUpdateProfile`
/// (the actual network dispatch is exercised at the integration point — see
/// `apps/ios/CLAUDE.md`, this file has no other network-mocking precedent).
/// The gateway's `updateUserProfileSchema` is `.strict()`: any key the schema
/// doesn't declare 400s the ENTIRE PATCH /users/me request, which previously
/// meant an `avatar` key silently blocked displayName/bio from ever saving
/// through the offline outbox. These tests pin the encoded JSON shape so a
/// future edit can't reintroduce that key.
final class OutboxDispatcherUpdateProfileEncodingTests: XCTestCase {

    private func encodeToJSON<T: Encodable>(_ value: T) throws -> String {
        let data = try JSONEncoder().encode(value)
        return try XCTUnwrap(String(data: data, encoding: .utf8))
    }

    // MARK: - UpdateProfileFieldsBody (PATCH /users/me)

    func test_updateProfileFieldsBody_neverEncodesAvatarKey() throws {
        let body = UpdateProfileFieldsBody(displayName: "Bob", bio: "Hello")

        let json = try encodeToJSON(body)

        XCTAssertFalse(json.contains("avatar"),
            "updateUserProfileSchema is .strict() with no avatar/avatarUrl property — any avatar key 400s the whole PATCH")
    }

    func test_updateProfileFieldsBody_omitsNilDisplayName_andNilBio() throws {
        let body = UpdateProfileFieldsBody(displayName: nil, bio: nil)

        let json = try encodeToJSON(body)

        XCTAssertEqual(json, "{}", "Untouched fields must be omitted, not sent as null")
    }

    func test_updateProfileFieldsBody_sendsExplicitEmptyBio_whenCleared() throws {
        let body = UpdateProfileFieldsBody(displayName: nil, bio: "")

        let json = try encodeToJSON(body)

        XCTAssertTrue(json.contains("\"bio\":\"\""),
            "An intentionally-cleared bio must be sent as an explicit empty string, not omitted")
    }

    func test_updateProfileFieldsBody_includesOnlyProvidedFields() throws {
        let body = UpdateProfileFieldsBody(displayName: "Bob", bio: nil)

        let json = try encodeToJSON(body)

        XCTAssertTrue(json.contains("displayName"))
        XCTAssertFalse(json.contains("bio"))
    }

    // MARK: - UpdateProfileAvatarBody (PATCH /users/me/avatar)

    func test_updateProfileAvatarBody_encodesAvatarKey() throws {
        let body = UpdateProfileAvatarBody(avatar: "https://cdn.meeshy.me/avatars/new.jpg")

        let data = try JSONEncoder().encode(body)
        let decoded = try JSONDecoder().decode([String: String].self, from: data)

        XCTAssertEqual(decoded["avatar"], "https://cdn.meeshy.me/avatars/new.jpg")
        XCTAssertEqual(decoded.count, 1, "Avatar dispatch must carry only the avatar key, matching updateAvatarSchema")
    }
}
