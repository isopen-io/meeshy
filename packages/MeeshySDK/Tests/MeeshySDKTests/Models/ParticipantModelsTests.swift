import XCTest
@testable import MeeshySDK

final class ParticipantModelsTests: XCTestCase {

    // MARK: - Helpers

    private func makeISO8601Decoder() -> JSONDecoder {
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
        return decoder
    }

    private func makeMinimalParticipantJSON(
        id: String = "aaa000000000000000000001",
        conversationId: String = "bbb000000000000000000001",
        type: String = "user",
        displayName: String = "TestUser",
        role: String = "member",
        language: String = "en",
        joinedAt: String = "2026-01-01T00:00:00.000Z",
        extras: String = ""
    ) -> String {
        """
        {
            "id": "\(id)",
            "conversationId": "\(conversationId)",
            "type": "\(type)",
            "displayName": "\(displayName)",
            "role": "\(role)",
            "language": "\(language)",
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
            "joinedAt": "\(joinedAt)"\(extras.isEmpty ? "" : ",\n            \(extras)")
        }
        """
    }

    // MARK: - ParticipantType Raw Values

    func testParticipantTypeRawValues() {
        XCTAssertEqual(ParticipantType.user.rawValue, "user")
        XCTAssertEqual(ParticipantType.anonymous.rawValue, "anonymous")
        XCTAssertEqual(ParticipantType.bot.rawValue, "bot")
    }

    // MARK: - ParticipantType Codable Roundtrip

    func testParticipantTypeCodableRoundtrip() throws {
        let original = ParticipantType.anonymous
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ParticipantType.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testParticipantTypeUserCodableRoundtrip() throws {
        let original = ParticipantType.user
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ParticipantType.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testParticipantTypeBotCodableRoundtrip() throws {
        let original = ParticipantType.bot
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ParticipantType.self, from: data)
        XCTAssertEqual(decoded, original)
    }

    func testParticipantTypeInvalidRawValueReturnsNil() {
        let invalid = ParticipantType(rawValue: "invalid")
        XCTAssertNil(invalid)
    }

    func testParticipantTypeEmptyRawValueReturnsNil() {
        let empty = ParticipantType(rawValue: "")
        XCTAssertNil(empty)
    }

    func testParticipantTypeInvalidJSONThrows() {
        let json = "\"alien\"".data(using: .utf8)!
        XCTAssertThrowsError(try JSONDecoder().decode(ParticipantType.self, from: json))
    }

    // MARK: - ParticipantPermissions Defaults

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

    // MARK: - ParticipantPermissions Custom Init

    func testPermissionsCustomInitAllFalse() {
        let perms = ParticipantPermissions(
            canSendMessages: false,
            canSendFiles: false,
            canSendImages: false,
            canSendVideos: false,
            canSendAudios: false,
            canSendLocations: false,
            canSendLinks: false
        )
        XCTAssertFalse(perms.canSendMessages)
        XCTAssertFalse(perms.canSendFiles)
        XCTAssertFalse(perms.canSendImages)
        XCTAssertFalse(perms.canSendVideos)
        XCTAssertFalse(perms.canSendAudios)
        XCTAssertFalse(perms.canSendLocations)
        XCTAssertFalse(perms.canSendLinks)
    }

    func testPermissionsCustomInitMixedValues() {
        let perms = ParticipantPermissions(
            canSendMessages: true,
            canSendFiles: false,
            canSendImages: true,
            canSendVideos: false,
            canSendAudios: true,
            canSendLocations: false,
            canSendLinks: true
        )
        XCTAssertTrue(perms.canSendMessages)
        XCTAssertFalse(perms.canSendFiles)
        XCTAssertTrue(perms.canSendImages)
        XCTAssertFalse(perms.canSendVideos)
        XCTAssertTrue(perms.canSendAudios)
        XCTAssertFalse(perms.canSendLocations)
        XCTAssertTrue(perms.canSendLinks)
    }

    func testPermissionsDefaultInitAllTrue() {
        let perms = ParticipantPermissions()
        XCTAssertTrue(perms.canSendMessages)
        XCTAssertTrue(perms.canSendFiles)
        XCTAssertTrue(perms.canSendImages)
        XCTAssertTrue(perms.canSendVideos)
        XCTAssertTrue(perms.canSendAudios)
        XCTAssertTrue(perms.canSendLocations)
        XCTAssertTrue(perms.canSendLinks)
    }

    // MARK: - ParticipantPermissions Codable

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

    func testPermissionsDefaultUserCodableRoundtrip() throws {
        let original = ParticipantPermissions.defaultUser
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ParticipantPermissions.self, from: data)
        XCTAssertTrue(decoded.canSendMessages)
        XCTAssertTrue(decoded.canSendFiles)
        XCTAssertTrue(decoded.canSendImages)
        XCTAssertTrue(decoded.canSendVideos)
        XCTAssertTrue(decoded.canSendAudios)
        XCTAssertTrue(decoded.canSendLocations)
        XCTAssertTrue(decoded.canSendLinks)
    }

    func testPermissionsDefaultAnonymousCodableRoundtrip() throws {
        let original = ParticipantPermissions.defaultAnonymous
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ParticipantPermissions.self, from: data)
        XCTAssertTrue(decoded.canSendMessages)
        XCTAssertFalse(decoded.canSendFiles)
        XCTAssertTrue(decoded.canSendImages)
        XCTAssertFalse(decoded.canSendVideos)
        XCTAssertFalse(decoded.canSendAudios)
        XCTAssertFalse(decoded.canSendLocations)
        XCTAssertFalse(decoded.canSendLinks)
    }

    func testPermissionsAllFalseCodableRoundtrip() throws {
        let original = ParticipantPermissions(
            canSendMessages: false, canSendFiles: false, canSendImages: false,
            canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ParticipantPermissions.self, from: data)
        XCTAssertFalse(decoded.canSendMessages)
        XCTAssertFalse(decoded.canSendFiles)
        XCTAssertFalse(decoded.canSendImages)
        XCTAssertFalse(decoded.canSendVideos)
        XCTAssertFalse(decoded.canSendAudios)
        XCTAssertFalse(decoded.canSendLocations)
        XCTAssertFalse(decoded.canSendLinks)
    }

    func testPermissionsDecodesFromJSON() throws {
        let json = """
        {
            "canSendMessages": false,
            "canSendFiles": true,
            "canSendImages": false,
            "canSendVideos": true,
            "canSendAudios": false,
            "canSendLocations": true,
            "canSendLinks": false
        }
        """.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(ParticipantPermissions.self, from: json)
        XCTAssertFalse(decoded.canSendMessages)
        XCTAssertTrue(decoded.canSendFiles)
        XCTAssertFalse(decoded.canSendImages)
        XCTAssertTrue(decoded.canSendVideos)
        XCTAssertFalse(decoded.canSendAudios)
        XCTAssertTrue(decoded.canSendLocations)
        XCTAssertFalse(decoded.canSendLinks)
    }

    // MARK: - AnonymousProfile Init

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

    func testAnonymousProfileWithEmailOnly() {
        let profile = AnonymousProfile(firstName: "A", lastName: "B", username: "ab", email: "a@b.com")
        XCTAssertEqual(profile.email, "a@b.com")
        XCTAssertNil(profile.birthday)
    }

    func testAnonymousProfileWithBirthdayOnly() {
        let birthday = Date(timeIntervalSince1970: 946684800)
        let profile = AnonymousProfile(firstName: "A", lastName: "B", username: "ab", birthday: birthday)
        XCTAssertNil(profile.email)
        XCTAssertEqual(profile.birthday, birthday)
    }

    // MARK: - AnonymousProfile Codable

    func testAnonymousProfileCodableRoundtripRequiredFieldsOnly() throws {
        let original = AnonymousProfile(firstName: "Test", lastName: "User", username: "testuser")
        let encoder = JSONEncoder()
        let data = try encoder.encode(original)
        let decoded = try JSONDecoder().decode(AnonymousProfile.self, from: data)
        XCTAssertEqual(decoded.firstName, "Test")
        XCTAssertEqual(decoded.lastName, "User")
        XCTAssertEqual(decoded.username, "testuser")
        XCTAssertNil(decoded.email)
        XCTAssertNil(decoded.birthday)
    }

    func testAnonymousProfileCodableRoundtripAllFields() throws {
        let birthday = Date(timeIntervalSince1970: 946684800)
        let original = AnonymousProfile(
            firstName: "Full", lastName: "Profile", username: "fullprofile",
            email: "full@test.com", birthday: birthday
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .secondsSince1970
        let data = try encoder.encode(original)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        let decoded = try decoder.decode(AnonymousProfile.self, from: data)
        XCTAssertEqual(decoded.firstName, "Full")
        XCTAssertEqual(decoded.lastName, "Profile")
        XCTAssertEqual(decoded.username, "fullprofile")
        XCTAssertEqual(decoded.email, "full@test.com")
        XCTAssertEqual(decoded.birthday, birthday)
    }

    func testAnonymousProfileDecodesNullOptionals() throws {
        let json = """
        {
            "firstName": "Null",
            "lastName": "Test",
            "username": "nulltest",
            "email": null,
            "birthday": null
        }
        """.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(AnonymousProfile.self, from: json)
        XCTAssertEqual(decoded.firstName, "Null")
        XCTAssertNil(decoded.email)
        XCTAssertNil(decoded.birthday)
    }

    // MARK: - AnonymousSessionResponse

    func testAnonymousSessionResponseDecodesFromJSON() throws {
        let json = """
        {
            "profile": {
                "firstName": "Anon",
                "lastName": "User",
                "username": "anonuser"
            }
        }
        """.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(AnonymousSessionResponse.self, from: json)
        XCTAssertEqual(decoded.profile.firstName, "Anon")
        XCTAssertEqual(decoded.profile.lastName, "User")
        XCTAssertEqual(decoded.profile.username, "anonuser")
        XCTAssertNil(decoded.profile.email)
        XCTAssertNil(decoded.profile.birthday)
    }

    func testAnonymousSessionResponseDecodesWithFullProfile() throws {
        let json = """
        {
            "profile": {
                "firstName": "Full",
                "lastName": "Anon",
                "username": "fullanon",
                "email": "anon@test.com",
                "birthday": 946684800
            }
        }
        """.data(using: .utf8)!
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .secondsSince1970
        let decoded = try decoder.decode(AnonymousSessionResponse.self, from: json)
        XCTAssertEqual(decoded.profile.email, "anon@test.com")
        XCTAssertNotNil(decoded.profile.birthday)
    }

    // MARK: - APIParticipant JSON Decoding - User Type

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
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

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

    // MARK: - APIParticipant JSON Decoding - Anonymous Type

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
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.type, .anonymous)
        XCTAssertNil(participant.userId)
        XCTAssertEqual(participant.displayName, "Guest_42")
        XCTAssertEqual(participant.nickname, "Guest_42")
        XCTAssertEqual(participant.name, "Guest_42")
        XCTAssertFalse(participant.permissions.canSendFiles)
    }

    // MARK: - APIParticipant JSON Decoding - Bot Type

    func testAPIParticipantDecodesBotType() throws {
        let json = makeMinimalParticipantJSON(
            id: "aaa000000000000000000005",
            type: "bot",
            displayName: "TranslatorBot",
            role: "bot"
        )
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.type, .bot)
        XCTAssertEqual(participant.displayName, "TranslatorBot")
        XCTAssertEqual(participant.role, "bot")
        XCTAssertNil(participant.userId)
    }

    // MARK: - APIParticipant name Computed Property

    func testAPIParticipantNamePrefersNickname() throws {
        let json = makeMinimalParticipantJSON(
            id: "aaa000000000000000000003",
            displayName: "Robert Dupont",
            extras: "\"nickname\": \"Bobby\", \"userId\": \"ccc000000000000000000003\""
        )
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.name, "Bobby")
        XCTAssertEqual(participant.displayName, "Robert Dupont")
    }

    func testAPIParticipantNameFallsBackToDisplayName() throws {
        let json = makeMinimalParticipantJSON(
            id: "aaa000000000000000000004",
            displayName: "Alice Wonder"
        )
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.name, "Alice Wonder")
        XCTAssertNil(participant.nickname)
    }

    func testAPIParticipantNameWithEmptyNicknameReturnsEmptyString() throws {
        let json = makeMinimalParticipantJSON(
            displayName: "RealName",
            extras: "\"nickname\": \"\""
        )
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.name, "")
        XCTAssertEqual(participant.nickname, "")
    }

    // MARK: - APIParticipant resolvedAvatar Computed Property

    func testResolvedAvatarReturnsSelfAvatarWhenPresent() throws {
        let json = makeMinimalParticipantJSON(
            extras: "\"avatar\": \"https://example.com/self.jpg\""
        )
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.resolvedAvatar, "https://example.com/self.jpg")
    }

    func testResolvedAvatarReturnsUserAvatarWhenSelfAvatarNil() throws {
        let json = """
        {
            "id": "aaa000000000000000000010",
            "conversationId": "bbb000000000000000000001",
            "type": "user",
            "userId": "ccc000000000000000000010",
            "displayName": "WithUser",
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
            "joinedAt": "2026-01-01T00:00:00.000Z",
            "user": {
                "id": "ccc000000000000000000010",
                "username": "withuser",
                "avatar": "https://example.com/user-avatar.jpg"
            }
        }
        """
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertNil(participant.avatar)
        XCTAssertEqual(participant.resolvedAvatar, "https://example.com/user-avatar.jpg")
    }

    func testResolvedAvatarReturnsNilWhenBothNil() throws {
        let json = makeMinimalParticipantJSON()
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertNil(participant.avatar)
        XCTAssertNil(participant.user)
        XCTAssertNil(participant.resolvedAvatar)
    }

    func testResolvedAvatarPrefersSelfAvatarOverUserAvatar() throws {
        let json = """
        {
            "id": "aaa000000000000000000011",
            "conversationId": "bbb000000000000000000001",
            "type": "user",
            "userId": "ccc000000000000000000011",
            "displayName": "BothAvatars",
            "avatar": "https://example.com/self-avatar.jpg",
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
            "joinedAt": "2026-01-01T00:00:00.000Z",
            "user": {
                "id": "ccc000000000000000000011",
                "username": "bothavatars",
                "avatar": "https://example.com/user-avatar.jpg"
            }
        }
        """
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.resolvedAvatar, "https://example.com/self-avatar.jpg")
    }

    func testResolvedAvatarWithUserHavingAvatarUrlFallback() throws {
        let json = """
        {
            "id": "aaa000000000000000000012",
            "conversationId": "bbb000000000000000000001",
            "type": "user",
            "userId": "ccc000000000000000000012",
            "displayName": "AvatarUrl",
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
            "joinedAt": "2026-01-01T00:00:00.000Z",
            "user": {
                "id": "ccc000000000000000000012",
                "username": "avatarurl",
                "avatarUrl": "https://example.com/avatar-url.jpg"
            }
        }
        """
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertNil(participant.avatar)
        XCTAssertEqual(participant.resolvedAvatar, "https://example.com/avatar-url.jpg")
    }

    // MARK: - APIParticipant All Optional Fields Nil

    func testAPIParticipantAllOptionalsNil() throws {
        let json = makeMinimalParticipantJSON()
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertNil(participant.userId)
        XCTAssertNil(participant.avatar)
        XCTAssertNil(participant.isOnline)
        XCTAssertNil(participant.leftAt)
        XCTAssertNil(participant.bannedAt)
        XCTAssertNil(participant.nickname)
        XCTAssertNil(participant.lastActiveAt)
        XCTAssertNil(participant.user)
    }

    // MARK: - APIParticipant All Fields Present

    func testAPIParticipantAllFieldsPresent() throws {
        let json = """
        {
            "id": "aaa000000000000000000020",
            "conversationId": "bbb000000000000000000020",
            "type": "user",
            "userId": "ccc000000000000000000020",
            "displayName": "FullUser",
            "avatar": "https://example.com/full.jpg",
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
            "isOnline": false,
            "joinedAt": "2026-01-15T10:30:00.000Z",
            "leftAt": "2026-02-01T08:00:00.000Z",
            "bannedAt": "2026-02-01T07:55:00.000Z",
            "nickname": "FullNick",
            "lastActiveAt": "2026-01-31T23:59:59.999Z",
            "user": {
                "id": "ccc000000000000000000020",
                "username": "fulluser",
                "displayName": "Full User Display",
                "firstName": "Full",
                "lastName": "User",
                "avatar": "https://example.com/user-full.jpg"
            }
        }
        """
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.id, "aaa000000000000000000020")
        XCTAssertEqual(participant.conversationId, "bbb000000000000000000020")
        XCTAssertEqual(participant.type, .user)
        XCTAssertEqual(participant.userId, "ccc000000000000000000020")
        XCTAssertEqual(participant.displayName, "FullUser")
        XCTAssertEqual(participant.avatar, "https://example.com/full.jpg")
        XCTAssertEqual(participant.role, "admin")
        XCTAssertEqual(participant.language, "fr")
        XCTAssertTrue(participant.isActive)
        XCTAssertEqual(participant.isOnline, false)
        XCTAssertNotNil(participant.joinedAt)
        XCTAssertNotNil(participant.leftAt)
        XCTAssertNotNil(participant.bannedAt)
        XCTAssertEqual(participant.nickname, "FullNick")
        XCTAssertNotNil(participant.lastActiveAt)
        XCTAssertNotNil(participant.user)
        XCTAssertEqual(participant.user?.username, "fulluser")
        XCTAssertEqual(participant.name, "FullNick")
        XCTAssertEqual(participant.resolvedAvatar, "https://example.com/full.jpg")
    }

    // MARK: - APIParticipant Minimal Fields

    func testAPIParticipantMinimalFieldsDecodes() throws {
        let json = makeMinimalParticipantJSON(
            displayName: "Minimal",
            role: "member",
            language: "en"
        )
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.displayName, "Minimal")
        XCTAssertEqual(participant.role, "member")
        XCTAssertEqual(participant.language, "en")
        XCTAssertTrue(participant.isActive)
    }

    // MARK: - APIParticipant Date Decoding

    func testAPIParticipantDateDecodingISO8601WithFractionalSeconds() throws {
        let json = makeMinimalParticipantJSON(
            joinedAt: "2026-03-09T14:30:45.123Z"
        )
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertNotNil(participant.joinedAt)
        let calendar = Calendar(identifier: .gregorian)
        var utcCalendar = calendar
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!
        let components = utcCalendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: participant.joinedAt)
        XCTAssertEqual(components.year, 2026)
        XCTAssertEqual(components.month, 3)
        XCTAssertEqual(components.day, 9)
        XCTAssertEqual(components.hour, 14)
        XCTAssertEqual(components.minute, 30)
        XCTAssertEqual(components.second, 45)
    }

    func testAPIParticipantMultipleDateFieldsDecode() throws {
        let json = """
        {
            "id": "aaa000000000000000000030",
            "conversationId": "bbb000000000000000000030",
            "type": "user",
            "displayName": "Dates",
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
            "isActive": false,
            "joinedAt": "2026-01-01T00:00:00.000Z",
            "leftAt": "2026-02-01T12:00:00.000Z",
            "bannedAt": "2026-02-01T11:59:00.000Z",
            "lastActiveAt": "2026-01-31T23:00:00.000Z"
        }
        """
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertNotNil(participant.joinedAt)
        XCTAssertNotNil(participant.leftAt)
        XCTAssertNotNil(participant.bannedAt)
        XCTAssertNotNil(participant.lastActiveAt)
        XCTAssertFalse(participant.isActive)
    }

    // MARK: - APIParticipant Identifiable

    func testAPIParticipantIdentifiableId() throws {
        let json = makeMinimalParticipantJSON(id: "uniqueid123456789012345a")
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.id, "uniqueid123456789012345a")
    }

    // MARK: - Edge Cases - Empty Strings

    func testAPIParticipantEmptyDisplayName() throws {
        let json = makeMinimalParticipantJSON(displayName: "")
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.displayName, "")
        XCTAssertEqual(participant.name, "")
    }

    func testAPIParticipantEmptyRole() throws {
        let json = makeMinimalParticipantJSON(role: "")
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.role, "")
    }

    func testAPIParticipantEmptyLanguage() throws {
        let json = makeMinimalParticipantJSON(language: "")
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.language, "")
    }

    // MARK: - Edge Cases - Special Characters

    func testAPIParticipantSpecialCharactersInDisplayName() throws {
        let json = makeMinimalParticipantJSON(displayName: "Jean-Pierre O'Brien")
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.displayName, "Jean-Pierre O'Brien")
    }

    func testAPIParticipantUnicodeInDisplayName() throws {
        let json = makeMinimalParticipantJSON(displayName: "太郎山田")
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.displayName, "太郎山田")
    }

    func testAPIParticipantEmojiInDisplayName() throws {
        let json = makeMinimalParticipantJSON(displayName: "User 🎉🌍")
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.displayName, "User 🎉🌍")
    }

    // MARK: - Edge Cases - Long Strings

    func testAPIParticipantVeryLongDisplayName() throws {
        let longName = String(repeating: "A", count: 1000)
        let json = makeMinimalParticipantJSON(displayName: longName)
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.displayName, longName)
        XCTAssertEqual(participant.displayName.count, 1000)
    }

    // MARK: - Edge Cases - AnonymousProfile Special Characters

    func testAnonymousProfileSpecialCharacters() {
        let profile = AnonymousProfile(
            firstName: "Jean-Pierre",
            lastName: "O'Brien",
            username: "jp_obrien-123"
        )
        XCTAssertEqual(profile.firstName, "Jean-Pierre")
        XCTAssertEqual(profile.lastName, "O'Brien")
        XCTAssertEqual(profile.username, "jp_obrien-123")
    }

    func testAnonymousProfileUnicodeNames() {
        let profile = AnonymousProfile(
            firstName: "太郎",
            lastName: "山田",
            username: "taro_yamada"
        )
        XCTAssertEqual(profile.firstName, "太郎")
        XCTAssertEqual(profile.lastName, "山田")
    }

    func testAnonymousProfileEmptyStrings() {
        let profile = AnonymousProfile(firstName: "", lastName: "", username: "")
        XCTAssertEqual(profile.firstName, "")
        XCTAssertEqual(profile.lastName, "")
        XCTAssertEqual(profile.username, "")
    }

    // MARK: - APIParticipant isOnline States

    func testAPIParticipantIsOnlineTrue() throws {
        let json = makeMinimalParticipantJSON(extras: "\"isOnline\": true")
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.isOnline, true)
    }

    func testAPIParticipantIsOnlineFalse() throws {
        let json = makeMinimalParticipantJSON(extras: "\"isOnline\": false")
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertEqual(participant.isOnline, false)
    }

    func testAPIParticipantIsOnlineAbsent() throws {
        let json = makeMinimalParticipantJSON()
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertNil(participant.isOnline)
    }

    // MARK: - APIParticipant with User Object

    func testAPIParticipantUserObjectFields() throws {
        let json = """
        {
            "id": "aaa000000000000000000040",
            "conversationId": "bbb000000000000000000040",
            "type": "user",
            "userId": "ccc000000000000000000040",
            "displayName": "WithFullUser",
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
            "joinedAt": "2026-01-01T00:00:00.000Z",
            "user": {
                "id": "ccc000000000000000000040",
                "username": "withfulluser",
                "displayName": "Full User Display Name",
                "firstName": "Full",
                "lastName": "User"
            }
        }
        """
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertNotNil(participant.user)
        XCTAssertEqual(participant.user?.id, "ccc000000000000000000040")
        XCTAssertEqual(participant.user?.username, "withfulluser")
        XCTAssertEqual(participant.user?.displayName, "Full User Display Name")
        XCTAssertEqual(participant.user?.firstName, "Full")
        XCTAssertEqual(participant.user?.lastName, "User")
        XCTAssertNil(participant.user?.avatar)
        XCTAssertNil(participant.user?.avatarUrl)
    }

    // MARK: - APIParticipant isActive States

    func testAPIParticipantIsActiveFalse() throws {
        let json = """
        {
            "id": "aaa000000000000000000050",
            "conversationId": "bbb000000000000000000050",
            "type": "user",
            "displayName": "Inactive",
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
            "isActive": false,
            "joinedAt": "2026-01-01T00:00:00.000Z",
            "leftAt": "2026-02-01T00:00:00.000Z"
        }
        """
        let data = json.data(using: .utf8)!
        let participant = try makeISO8601Decoder().decode(APIParticipant.self, from: data)

        XCTAssertFalse(participant.isActive)
        XCTAssertNotNil(participant.leftAt)
    }
}
