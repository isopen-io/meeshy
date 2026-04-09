import XCTest
@testable import MeeshySDK

final class CommunityModelsTests: XCTestCase {

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

    // MARK: - CommunityPermission

    func test_communityPermission_allCases() {
        let allCases = CommunityPermission.allCases
        XCTAssertEqual(allCases.count, 8)
        XCTAssertTrue(allCases.contains(.inviteMembers))
        XCTAssertTrue(allCases.contains(.deleteCommunity))
        XCTAssertTrue(allCases.contains(.manageRoles))
    }

    func test_communityPermissions_adminHasAll() {
        let permissions = CommunityPermissions.forRole(.admin)
        XCTAssertEqual(permissions, Set(CommunityPermission.allCases))
    }

    func test_communityPermissions_creatorHasAll() {
        let permissions = CommunityPermissions.forRole(.creator)
        XCTAssertEqual(permissions, Set(CommunityPermission.allCases))
    }

    func test_communityPermissions_moderatorHasSubset() {
        let permissions = CommunityPermissions.forRole(.moderator)
        XCTAssertTrue(permissions.contains(.inviteMembers))
        XCTAssertTrue(permissions.contains(.removeMembers))
        XCTAssertTrue(permissions.contains(.moderateContent))
        XCTAssertFalse(permissions.contains(.deleteCommunity))
        XCTAssertFalse(permissions.contains(.manageRoles))
    }

    func test_communityPermissions_memberHasMinimal() {
        let permissions = CommunityPermissions.forRole(.member)
        XCTAssertEqual(permissions, [.createConversations])
    }

    // MARK: - APICommunityUser

    func test_apiCommunityUser_decodesAllFields() throws {
        let json = """
        {
            "id": "user1",
            "username": "alice",
            "displayName": "Alice W",
            "avatar": "https://img.test/alice.png",
            "isOnline": true
        }
        """.data(using: .utf8)!

        let user = try JSONDecoder().decode(APICommunityUser.self, from: json)
        XCTAssertEqual(user.id, "user1")
        XCTAssertEqual(user.username, "alice")
        XCTAssertEqual(user.name, "Alice W")
        XCTAssertEqual(user.avatar, "https://img.test/alice.png")
        XCTAssertEqual(user.isOnline, true)
    }

    func test_apiCommunityUser_nameFallsBackToUsername() throws {
        let json = """
        {
            "id": "user2",
            "username": "bob",
            "displayName": null,
            "avatar": null,
            "isOnline": false
        }
        """.data(using: .utf8)!

        let user = try JSONDecoder().decode(APICommunityUser.self, from: json)
        XCTAssertEqual(user.name, "bob")
    }

    // MARK: - APICommunityMember

    func test_apiCommunityMember_decodesWithUser() throws {
        let json = """
        {
            "id": "mem1",
            "communityId": "comm1",
            "userId": "user1",
            "role": "admin",
            "joinedAt": "2026-03-01T10:00:00.000Z",
            "user": {
                "id": "user1",
                "username": "alice",
                "displayName": "Alice",
                "avatar": null,
                "isOnline": true
            }
        }
        """.data(using: .utf8)!

        let member = try makeDecoder().decode(APICommunityMember.self, from: json)
        XCTAssertEqual(member.id, "mem1")
        XCTAssertEqual(member.communityId, "comm1")
        XCTAssertEqual(member.communityRole, .admin)
        XCTAssertEqual(member.user?.username, "alice")
    }

    func test_apiCommunityMember_unknownRoleFallsBackToMember() throws {
        let json = """
        {
            "id": "mem2",
            "communityId": "comm1",
            "userId": "user2",
            "role": "superadmin",
            "joinedAt": null,
            "user": null
        }
        """.data(using: .utf8)!

        let member = try makeDecoder().decode(APICommunityMember.self, from: json)
        XCTAssertEqual(member.communityRole, .member)
    }

    // MARK: - APICommunity

    func test_apiCommunity_decodesFullPayload() throws {
        let json = """
        {
            "id": "comm1",
            "identifier": "swift-devs",
            "name": "Swift Developers",
            "description": "A community for Swift enthusiasts",
            "avatar": "https://img.test/swift.png",
            "banner": "https://img.test/banner.png",
            "isPrivate": false,
            "createdBy": "user1",
            "createdAt": "2026-01-15T08:00:00.000Z",
            "updatedAt": "2026-04-01T12:00:00.000Z",
            "creator": {
                "id": "user1",
                "username": "alice",
                "displayName": "Alice",
                "avatar": null,
                "isOnline": false
            },
            "members": [],
            "_count": { "members": 42, "Conversation": 5 }
        }
        """.data(using: .utf8)!

        let community = try makeDecoder().decode(APICommunity.self, from: json)
        XCTAssertEqual(community.id, "comm1")
        XCTAssertEqual(community.identifier, "swift-devs")
        XCTAssertEqual(community.name, "Swift Developers")
        XCTAssertEqual(community.description, "A community for Swift enthusiasts")
        XCTAssertFalse(community.isPrivate)
        XCTAssertEqual(community._count?.members, 42)
        XCTAssertEqual(community._count?.conversations, 5)
    }

    func test_apiCommunity_toCommunityConversion() throws {
        let json = """
        {
            "id": "comm2",
            "identifier": "art-club",
            "name": "Art Club",
            "description": null,
            "avatar": null,
            "banner": null,
            "isPrivate": true,
            "createdBy": "user3",
            "createdAt": "2026-02-20T14:00:00.000Z",
            "updatedAt": null,
            "creator": null,
            "members": null,
            "_count": { "members": 10, "Conversation": 3 }
        }
        """.data(using: .utf8)!

        let api = try makeDecoder().decode(APICommunity.self, from: json)
        let community = api.toCommunity()
        XCTAssertEqual(community.id, "comm2")
        XCTAssertEqual(community.identifier, "art-club")
        XCTAssertEqual(community.name, "Art Club")
        XCTAssertTrue(community.isPrivate)
        XCTAssertEqual(community.memberCount, 10)
        XCTAssertEqual(community.conversationCount, 3)
    }

    // MARK: - APICommunitySearchResult

    func test_apiCommunitySearchResult_decodes() throws {
        let json = """
        {
            "id": "comm3",
            "name": "Gamers Hub",
            "identifier": "gamers-hub",
            "description": "Gaming community",
            "avatar": null,
            "isPrivate": false,
            "memberCount": 100,
            "conversationCount": 8,
            "createdAt": "2026-03-10T09:00:00.000Z",
            "creator": null,
            "members": null
        }
        """.data(using: .utf8)!

        let result = try makeDecoder().decode(APICommunitySearchResult.self, from: json)
        XCTAssertEqual(result.id, "comm3")
        XCTAssertEqual(result.name, "Gamers Hub")
        XCTAssertEqual(result.memberCount, 100)

        let community = result.toCommunity()
        XCTAssertEqual(community.memberCount, 100)
        XCTAssertEqual(community.conversationCount, 8)
    }

    // MARK: - IdentifierAvailability

    func test_identifierAvailability_decodes() throws {
        let json = """
        { "available": true, "identifier": "cool-name" }
        """.data(using: .utf8)!

        let availability = try JSONDecoder().decode(IdentifierAvailability.self, from: json)
        XCTAssertTrue(availability.available)
        XCTAssertEqual(availability.identifier, "cool-name")
    }

    func test_identifierAvailability_unavailable() throws {
        let json = """
        { "available": false, "identifier": "taken-name" }
        """.data(using: .utf8)!

        let availability = try JSONDecoder().decode(IdentifierAvailability.self, from: json)
        XCTAssertFalse(availability.available)
    }

    // MARK: - APICommunityCount

    func test_apiCommunityCount_conversationsDefaultsToZero() throws {
        let json = """
        { "members": 5 }
        """.data(using: .utf8)!

        let count = try JSONDecoder().decode(APICommunityCount.self, from: json)
        XCTAssertEqual(count.members, 5)
        XCTAssertEqual(count.conversations, 0)
    }
}
