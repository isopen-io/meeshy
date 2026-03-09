import XCTest
@testable import MeeshySDK

final class ParticipantModelsTests: XCTestCase {

    // MARK: - ParticipantType

    func testParticipantTypeRawValues() {
        XCTAssertEqual(ParticipantType.user.rawValue, "user")
        XCTAssertEqual(ParticipantType.anonymous.rawValue, "anonymous")
        XCTAssertEqual(ParticipantType.bot.rawValue, "bot")
    }

    func testParticipantTypeCodableRoundtrip() throws {
        let original = ParticipantType.anonymous
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ParticipantType.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    // MARK: - ParticipantPermissions

    func testDefaultUserPermissions() {
        let perms = ParticipantPermissions.defaultUser
        XCTAssertTrue(perms.canSendMessages)
        XCTAssertTrue(perms.canSendFiles)
        XCTAssertTrue(perms.canSendImages)
        XCTAssertTrue(perms.canSendVideos)
        XCTAssertTrue(perms.canSendAudios)
        XCTAssertTrue(perms.canSendLocations)
        XCTAssertTrue(perms.canSendLinks)
    }

    func testDefaultAnonymousPermissions() {
        let perms = ParticipantPermissions.defaultAnonymous
        XCTAssertTrue(perms.canSendMessages)
        XCTAssertFalse(perms.canSendFiles)
        XCTAssertTrue(perms.canSendImages)
        XCTAssertFalse(perms.canSendVideos)
        XCTAssertFalse(perms.canSendAudios)
        XCTAssertFalse(perms.canSendLocations)
        XCTAssertFalse(perms.canSendLinks)
    }

    func testPermissionsCodableRoundtrip() throws {
        let original = ParticipantPermissions(
            canSendMessages: true, canSendFiles: false, canSendImages: true,
            canSendVideos: false, canSendAudios: true, canSendLocations: false, canSendLinks: true
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ParticipantPermissions.self, from: data)
        XCTAssertEqual(decoded.canSendMessages, true)
        XCTAssertEqual(decoded.canSendFiles, false)
        XCTAssertEqual(decoded.canSendImages, true)
        XCTAssertEqual(decoded.canSendVideos, false)
        XCTAssertEqual(decoded.canSendAudios, true)
        XCTAssertEqual(decoded.canSendLocations, false)
        XCTAssertEqual(decoded.canSendLinks, true)
    }

    // MARK: - AnonymousProfile

    func testAnonymousProfileInit() {
        let profile = AnonymousProfile(firstName: "Jean", lastName: "Dupont", username: "jeandupont")
        XCTAssertEqual(profile.firstName, "Jean")
        XCTAssertEqual(profile.lastName, "Dupont")
        XCTAssertEqual(profile.username, "jeandupont")
        XCTAssertNil(profile.email)
        XCTAssertNil(profile.birthday)
    }

    func testAnonymousProfileWithOptionalFields() {
        let birthday = Date()
        let profile = AnonymousProfile(
            firstName: "Marie", lastName: "Martin", username: "mariemartin",
            email: "marie@example.com", birthday: birthday
        )
        XCTAssertEqual(profile.email, "marie@example.com")
        XCTAssertEqual(profile.birthday, birthday)
    }

    // MARK: - APIParticipant JSON Decoding

    func testAPIParticipantDecodesUserType() throws {
        let json = """
        {
            "id": "aaa000000000000000000001",
            "conversationId": "bbb000000000000000000001",
            "type": "user",
            "userId": "ccc000000000000000000001",
            "displayName": "Alice",
            "avatar": "https://example.com/alice.jpg",
            "role": "admin",
            "language": "fr",
            "permissions": {
                "canSendMessages": true,
                "canSendFiles": true,
                "canSendImages": true,
                "canSendVideos": true,
                "canSendAudios": true,
                "canSendLocations": true,
                "canSendLinks": true
            },
            "isActive": true,
            "isOnline": true,
            "joinedAt": "2026-01-01T00:00:00.000Z"
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let fmt = ISO8601DateFormatter()
            fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = fmt.date(from: str) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Bad date: \(str)")
            }
            return date
        }
        let data = json.data(using: .utf8)!
        let participant = try decoder.decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.id, "aaa000000000000000000001")
        XCTAssertEqual(participant.type, .user)
        XCTAssertEqual(participant.userId, "ccc000000000000000000001")
        XCTAssertEqual(participant.displayName, "Alice")
        XCTAssertEqual(participant.role, "admin")
        XCTAssertEqual(participant.language, "fr")
        XCTAssertTrue(participant.permissions.canSendMessages)
        XCTAssertTrue(participant.isActive)
        XCTAssertEqual(participant.isOnline, true)
        XCTAssertNil(participant.leftAt)
        XCTAssertNil(participant.bannedAt)
        XCTAssertNil(participant.nickname)
    }

    func testAPIParticipantDecodesAnonymousType() throws {
        let json = """
        {
            "id": "aaa000000000000000000002",
            "conversationId": "bbb000000000000000000001",
            "type": "anonymous",
            "displayName": "Guest_42",
            "role": "member",
            "language": "en",
            "permissions": {
                "canSendMessages": true,
                "canSendFiles": false,
                "canSendImages": true,
                "canSendVideos": false,
                "canSendAudios": false,
                "canSendLocations": false,
                "canSendLinks": false
            },
            "isActive": true,
            "joinedAt": "2026-02-15T12:00:00.000Z",
            "nickname": "Guest_42"
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let fmt = ISO8601DateFormatter()
            fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = fmt.date(from: str) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Bad date: \(str)")
            }
            return date
        }
        let data = json.data(using: .utf8)!
        let participant = try decoder.decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.type, .anonymous)
        XCTAssertNil(participant.userId)
        XCTAssertEqual(participant.displayName, "Guest_42")
        XCTAssertEqual(participant.nickname, "Guest_42")
        XCTAssertEqual(participant.name, "Guest_42")
        XCTAssertFalse(participant.permissions.canSendFiles)
    }

    func testAPIParticipantNamePrefersNickname() throws {
        let json = """
        {
            "id": "aaa000000000000000000003",
            "conversationId": "bbb000000000000000000001",
            "type": "user",
            "userId": "ccc000000000000000000003",
            "displayName": "Robert Dupont",
            "role": "member",
            "language": "fr",
            "permissions": {
                "canSendMessages": true,
                "canSendFiles": true,
                "canSendImages": true,
                "canSendVideos": true,
                "canSendAudios": true,
                "canSendLocations": true,
                "canSendLinks": true
            },
            "isActive": true,
            "joinedAt": "2026-01-01T00:00:00.000Z",
            "nickname": "Bobby"
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let fmt = ISO8601DateFormatter()
            fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = fmt.date(from: str) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Bad date: \(str)")
            }
            return date
        }
        let data = json.data(using: .utf8)!
        let participant = try decoder.decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.name, "Bobby")
        XCTAssertEqual(participant.displayName, "Robert Dupont")
    }

    func testAPIParticipantNameFallsBackToDisplayName() throws {
        let json = """
        {
            "id": "aaa000000000000000000004",
            "conversationId": "bbb000000000000000000001",
            "type": "user",
            "userId": "ccc000000000000000000004",
            "displayName": "Alice Wonder",
            "role": "member",
            "language": "en",
            "permissions": {
                "canSendMessages": true,
                "canSendFiles": true,
                "canSendImages": true,
                "canSendVideos": true,
                "canSendAudios": true,
                "canSendLocations": true,
                "canSendLinks": true
            },
            "isActive": true,
            "joinedAt": "2026-01-01T00:00:00.000Z"
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let fmt = ISO8601DateFormatter()
            fmt.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = fmt.date(from: str) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Bad date: \(str)")
            }
            return date
        }
        let data = json.data(using: .utf8)!
        let participant = try decoder.decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.name, "Alice Wonder")
        XCTAssertNil(participant.nickname)
    }
}
