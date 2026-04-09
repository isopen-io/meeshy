import XCTest
@testable import MeeshySDK

final class ShareLinkModelsTests: XCTestCase {

    private func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateString = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: dateString) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: dateString) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid date: \(dateString)")
        }
        return decoder
    }

    // MARK: - ShareLinkInfo

    func test_shareLinkInfo_decodesFullPayload() throws {
        let json = """
        {
            "id": "sl1",
            "linkId": "abc-123-def",
            "name": "Team Meeting Link",
            "description": "Join our weekly sync",
            "expiresAt": "2026-12-31T23:59:59.000Z",
            "maxUses": 50,
            "currentUses": 12,
            "maxConcurrentUsers": 25,
            "currentConcurrentUsers": 3,
            "requireAccount": false,
            "requireNickname": true,
            "requireEmail": false,
            "requireBirthday": false,
            "allowedLanguages": ["fr", "en", "es"],
            "conversation": {
                "id": "conv1",
                "title": "Weekly Sync",
                "description": "Team sync every Monday",
                "type": "group",
                "createdAt": "2026-01-01T00:00:00.000Z"
            },
            "creator": {
                "id": "user1",
                "username": "alice",
                "firstName": "Alice",
                "lastName": "Martin",
                "displayName": "Alice M",
                "avatar": "https://img.test/alice.png"
            },
            "stats": {
                "totalParticipants": 15,
                "memberCount": 10,
                "anonymousCount": 5,
                "languageCount": 3,
                "spokenLanguages": ["fr", "en", "es"]
            }
        }
        """.data(using: .utf8)!

        let info = try makeDecoder().decode(ShareLinkInfo.self, from: json)
        XCTAssertEqual(info.id, "sl1")
        XCTAssertEqual(info.linkId, "abc-123-def")
        XCTAssertEqual(info.name, "Team Meeting Link")
        XCTAssertEqual(info.maxUses, 50)
        XCTAssertEqual(info.currentUses, 12)
        XCTAssertEqual(info.maxConcurrentUsers, 25)
        XCTAssertEqual(info.currentConcurrentUsers, 3)
        XCTAssertTrue(info.requireNickname)
        XCTAssertFalse(info.requireAccount)
        XCTAssertEqual(info.allowedLanguages, ["fr", "en", "es"])
        XCTAssertEqual(info.conversation.id, "conv1")
        XCTAssertEqual(info.conversation.type, "group")
        XCTAssertEqual(info.creator.name, "Alice M")
        XCTAssertEqual(info.stats.totalParticipants, 15)
        XCTAssertEqual(info.stats.anonymousCount, 5)
    }

    func test_shareLinkInfo_decodesWithOptionalFieldsNull() throws {
        let json = """
        {
            "id": "sl2",
            "linkId": "xyz-789",
            "name": null,
            "description": null,
            "expiresAt": null,
            "maxUses": null,
            "currentUses": 0,
            "maxConcurrentUsers": null,
            "currentConcurrentUsers": 0,
            "requireAccount": false,
            "requireNickname": false,
            "requireEmail": false,
            "requireBirthday": false,
            "allowedLanguages": [],
            "conversation": {
                "id": "conv2",
                "title": null,
                "description": null,
                "type": "direct",
                "createdAt": "2026-02-15T08:00:00.000Z"
            },
            "creator": {
                "id": "user2",
                "username": "bob",
                "firstName": null,
                "lastName": null,
                "displayName": null,
                "avatar": null
            },
            "stats": {
                "totalParticipants": 0,
                "memberCount": 0,
                "anonymousCount": 0,
                "languageCount": 0,
                "spokenLanguages": []
            }
        }
        """.data(using: .utf8)!

        let info = try makeDecoder().decode(ShareLinkInfo.self, from: json)
        XCTAssertNil(info.name)
        XCTAssertNil(info.expiresAt)
        XCTAssertNil(info.maxUses)
        XCTAssertEqual(info.currentUses, 0)
        XCTAssertEqual(info.creator.name, "bob")
    }

    // MARK: - ShareLinkCreator

    func test_shareLinkCreator_nameFallbackPriority() throws {
        let jsonDisplayName = """
        { "id": "u1", "username": "alice", "firstName": "Alice", "lastName": "M", "displayName": "Alice Display", "avatar": null }
        """.data(using: .utf8)!

        let creator1 = try JSONDecoder().decode(ShareLinkCreator.self, from: jsonDisplayName)
        XCTAssertEqual(creator1.name, "Alice Display")

        let jsonFirstLast = """
        { "id": "u2", "username": "bob", "firstName": "Bob", "lastName": "Smith", "displayName": null, "avatar": null }
        """.data(using: .utf8)!

        let creator2 = try JSONDecoder().decode(ShareLinkCreator.self, from: jsonFirstLast)
        XCTAssertEqual(creator2.name, "Bob Smith")

        let jsonUsernameOnly = """
        { "id": "u3", "username": "charlie", "firstName": null, "lastName": null, "displayName": null, "avatar": null }
        """.data(using: .utf8)!

        let creator3 = try JSONDecoder().decode(ShareLinkCreator.self, from: jsonUsernameOnly)
        XCTAssertEqual(creator3.name, "charlie")
    }

    // MARK: - AnonymousJoinResponse

    func test_anonymousJoinResponse_decodes() throws {
        let json = """
        {
            "sessionToken": "sess-token-abc",
            "participant": {
                "id": "anon1",
                "username": "guest_1234",
                "displayName": "Guest User",
                "firstName": "Guest",
                "lastName": "User",
                "avatar": null,
                "banner": null,
                "language": "fr",
                "isMeeshyer": false,
                "canSendMessages": true,
                "canSendFiles": false,
                "canSendImages": false
            },
            "conversation": {
                "id": "conv1",
                "title": "Public Chat",
                "type": "group",
                "allowViewHistory": true
            },
            "linkId": "link-abc",
            "id": "join1"
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(AnonymousJoinResponse.self, from: json)
        XCTAssertEqual(response.sessionToken, "sess-token-abc")
        XCTAssertEqual(response.participant.id, "anon1")
        XCTAssertEqual(response.participant.language, "fr")
        XCTAssertFalse(response.participant.isMeeshyer)
        XCTAssertTrue(response.participant.canSendMessages)
        XCTAssertFalse(response.participant.canSendFiles)
        XCTAssertEqual(response.conversation.id, "conv1")
        XCTAssertTrue(response.conversation.allowViewHistory)
        XCTAssertEqual(response.linkId, "link-abc")
    }

    // MARK: - MyShareLink

    func test_myShareLink_decodesAndComputedProperties() throws {
        let json = """
        {
            "id": "msl1",
            "linkId": "link-id-123",
            "identifier": "my-link",
            "name": "Personal Link",
            "isActive": true,
            "currentUses": 5,
            "maxUses": 100,
            "expiresAt": "2026-12-31T23:59:59.000Z",
            "createdAt": "2026-01-01T00:00:00.000Z",
            "conversationTitle": "My Chat"
        }
        """.data(using: .utf8)!

        let link = try makeDecoder().decode(MyShareLink.self, from: json)
        XCTAssertEqual(link.id, "msl1")
        XCTAssertEqual(link.displayName, "Personal Link")
        XCTAssertEqual(link.currentUses, 5)
        XCTAssertEqual(link.maxUses, 100)
        XCTAssertTrue(link.isActive)
    }

    func test_myShareLink_displayNameFallback() throws {
        let json = """
        {
            "id": "msl2",
            "linkId": "fallback-id",
            "identifier": "ident-fallback",
            "name": null,
            "isActive": false,
            "currentUses": 0,
            "maxUses": null,
            "expiresAt": null,
            "createdAt": "2026-06-01T00:00:00.000Z",
            "conversationTitle": null
        }
        """.data(using: .utf8)!

        let link = try makeDecoder().decode(MyShareLink.self, from: json)
        XCTAssertEqual(link.displayName, "ident-fallback")
    }

    // MARK: - MyShareLinkStats

    func test_myShareLinkStats_decodes() throws {
        let json = """
        {
            "totalLinks": 10,
            "activeLinks": 7,
            "totalUses": 250
        }
        """.data(using: .utf8)!

        let stats = try JSONDecoder().decode(MyShareLinkStats.self, from: json)
        XCTAssertEqual(stats.totalLinks, 10)
        XCTAssertEqual(stats.activeLinks, 7)
        XCTAssertEqual(stats.totalUses, 250)
        XCTAssertEqual(stats.id, "stats")
    }

    // MARK: - CreateShareLinkResponse (internal)

    func test_createShareLinkResponse_decodes() throws {
        let json = """
        {
            "linkId": "new-link-id",
            "conversationId": "conv1",
            "shareLink": {
                "id": "sl-new",
                "linkId": "new-link-id",
                "name": "New Link",
                "description": "A new share link",
                "expiresAt": "2026-12-31T23:59:59.000Z",
                "isActive": true
            }
        }
        """.data(using: .utf8)!

        let response = try makeDecoder().decode(CreateShareLinkResponse.self, from: json)
        XCTAssertEqual(response.linkId, "new-link-id")
        XCTAssertEqual(response.conversationId, "conv1")
        XCTAssertEqual(response.shareLink.id, "sl-new")
        XCTAssertTrue(response.shareLink.isActive)
    }
}
