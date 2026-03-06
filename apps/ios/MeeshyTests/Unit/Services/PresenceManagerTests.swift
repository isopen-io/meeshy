import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class PresenceManagerTests: XCTestCase {

    // Use typealias to disambiguate the app's UserPresence from the SDK's
    private typealias AppUserPresence = Meeshy.UserPresence

    private var sut: PresenceManager!

    override func setUp() async throws {
        sut = PresenceManager.shared
        sut.presenceMap.removeAll()
    }

    override func tearDown() async throws {
        sut.presenceMap.removeAll()
        sut = nil
    }

    // MARK: - UserPresence.state computed property

    func test_state_whenOffline_returnsOffline() {
        let presence = AppUserPresence(isOnline: false, lastActiveAt: nil)
        XCTAssertEqual(presence.state, PresenceState.offline)
    }

    func test_state_whenOfflineWithLastActiveAt_returnsOffline() {
        let presence = AppUserPresence(isOnline: false, lastActiveAt: Date())
        XCTAssertEqual(presence.state, PresenceState.offline)
    }

    func test_state_whenOnlineNoLastActiveAt_returnsOnline() {
        let presence = AppUserPresence(isOnline: true, lastActiveAt: nil)
        XCTAssertEqual(presence.state, PresenceState.online)
    }

    func test_state_whenOnlineRecentActivity_returnsOnline() {
        let recentDate = Date().addingTimeInterval(-60)
        let presence = AppUserPresence(isOnline: true, lastActiveAt: recentDate)
        XCTAssertEqual(presence.state, PresenceState.online)
    }

    func test_state_whenOnlineActivityUnder300s_returnsOnline() {
        let borderDate = Date().addingTimeInterval(-299)
        let presence = AppUserPresence(isOnline: true, lastActiveAt: borderDate)
        XCTAssertEqual(presence.state, PresenceState.online)
    }

    func test_state_whenOnlineActivityOver300s_returnsAway() {
        let staleDate = Date().addingTimeInterval(-301)
        let presence = AppUserPresence(isOnline: true, lastActiveAt: staleDate)
        XCTAssertEqual(presence.state, PresenceState.away)
    }

    func test_state_whenOnlineActivityLongAgo_returnsAway() {
        let veryStaleDate = Date().addingTimeInterval(-3600)
        let presence = AppUserPresence(isOnline: true, lastActiveAt: veryStaleDate)
        XCTAssertEqual(presence.state, PresenceState.away)
    }

    // MARK: - presenceState(for:)

    func test_presenceState_unknownUserId_returnsOffline() {
        let state = sut.presenceState(for: "unknown-user-id")
        XCTAssertEqual(state, PresenceState.offline)
    }

    func test_presenceState_knownOnlineUser_returnsOnline() {
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: true, lastActiveAt: nil)
        let state = sut.presenceState(for: "user-1")
        XCTAssertEqual(state, PresenceState.online)
    }

    func test_presenceState_knownOfflineUser_returnsOffline() {
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: false, lastActiveAt: nil)
        let state = sut.presenceState(for: "user-1")
        XCTAssertEqual(state, PresenceState.offline)
    }

    func test_presenceState_knownAwayUser_returnsAway() {
        let staleDate = Date().addingTimeInterval(-600)
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: true, lastActiveAt: staleDate)
        let state = sut.presenceState(for: "user-1")
        XCTAssertEqual(state, PresenceState.away)
    }

    // MARK: - seed(from:currentUserId:)

    func test_seed_populatesPresenceMapFromConversations() {
        let conversations = [makeConversation(members: [
            makeMemberJSON(userId: "me", isOnline: true, lastActiveAt: nil),
            makeMemberJSON(userId: "other-1", isOnline: true, lastActiveAt: nil),
            makeMemberJSON(userId: "other-2", isOnline: false, lastActiveAt: nil)
        ])]

        sut.seed(from: conversations, currentUserId: "me")

        XCTAssertEqual(sut.presenceMap.count, 2)
        XCTAssertEqual(sut.presenceState(for: "other-1"), PresenceState.online)
        XCTAssertEqual(sut.presenceState(for: "other-2"), PresenceState.offline)
    }

    func test_seed_excludesCurrentUser() {
        let conversations = [makeConversation(members: [
            makeMemberJSON(userId: "me", isOnline: true, lastActiveAt: nil),
            makeMemberJSON(userId: "other-1", isOnline: true, lastActiveAt: nil)
        ])]

        sut.seed(from: conversations, currentUserId: "me")

        XCTAssertNil(sut.presenceMap["me"])
        XCTAssertEqual(sut.presenceMap.count, 1)
    }

    func test_seed_multipleConversations_aggregatesAllMembers() {
        let conversations = [
            makeConversation(members: [
                makeMemberJSON(userId: "me", isOnline: true, lastActiveAt: nil),
                makeMemberJSON(userId: "user-A", isOnline: true, lastActiveAt: nil)
            ]),
            makeConversation(members: [
                makeMemberJSON(userId: "me", isOnline: true, lastActiveAt: nil),
                makeMemberJSON(userId: "user-B", isOnline: false, lastActiveAt: nil)
            ])
        ]

        sut.seed(from: conversations, currentUserId: "me")

        XCTAssertEqual(sut.presenceMap.count, 2)
        XCTAssertEqual(sut.presenceState(for: "user-A"), PresenceState.online)
        XCTAssertEqual(sut.presenceState(for: "user-B"), PresenceState.offline)
    }

    func test_seed_skipsConversationsWithNoMembers() {
        let conversations = [makeConversation(members: nil)]

        sut.seed(from: conversations, currentUserId: "me")

        XCTAssertTrue(sut.presenceMap.isEmpty)
    }

    func test_seed_skipsMembersWithNoUser() {
        let conversations = [makeConversation(members: [
            ["userId": "other-1"] as [String: Any]
        ])]

        sut.seed(from: conversations, currentUserId: "me")

        XCTAssertTrue(sut.presenceMap.isEmpty)
    }

    func test_seed_skipsMembersWithNilIsOnline() {
        let conversations = [makeConversation(members: [
            makeMemberJSON(userId: "me", isOnline: true, lastActiveAt: nil),
            ["userId": "other-1", "user": ["id": "other-1", "username": "other1"]] as [String: Any]
        ])]

        sut.seed(from: conversations, currentUserId: "me")

        XCTAssertNil(sut.presenceMap["other-1"])
    }

    func test_seed_preservesLastActiveAt_awayState() {
        let activeDate = Date().addingTimeInterval(-600)
        let conversations = [makeConversation(members: [
            makeMemberJSON(userId: "me", isOnline: true, lastActiveAt: nil),
            makeMemberJSON(userId: "other-1", isOnline: true, lastActiveAt: activeDate)
        ])]

        sut.seed(from: conversations, currentUserId: "me")

        XCTAssertEqual(sut.presenceState(for: "other-1"), PresenceState.away)
    }

    func test_seed_emptyConversations_doesNotPopulate() {
        sut.seed(from: [], currentUserId: "me")
        XCTAssertTrue(sut.presenceMap.isEmpty)
    }

    // MARK: - presenceMap clearing

    func test_clearingPresenceMap_allUsersReturnOffline() {
        sut.presenceMap["user-1"] = AppUserPresence(isOnline: true, lastActiveAt: nil)
        sut.presenceMap["user-2"] = AppUserPresence(isOnline: true, lastActiveAt: nil)

        sut.presenceMap.removeAll()

        XCTAssertEqual(sut.presenceState(for: "user-1"), PresenceState.offline)
        XCTAssertEqual(sut.presenceState(for: "user-2"), PresenceState.offline)
    }

    // MARK: - Factory Helpers

    private func makeConversation(members: [[String: Any]]?) -> APIConversation {
        var json: [String: Any] = [
            "id": UUID().uuidString,
            "type": "direct",
            "createdAt": ISO8601DateFormatter().string(from: Date())
        ]
        if let members {
            json["members"] = members
        }
        let data = try! JSONSerialization.data(withJSONObject: json)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let dateStr = try container.decode(String.self)
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = iso.date(from: dateStr) { return date }
            iso.formatOptions = [.withInternetDateTime]
            if let date = iso.date(from: dateStr) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected date string to be ISO8601-formatted.")
        }
        return try! decoder.decode(APIConversation.self, from: data)
    }

    private func makeMemberJSON(userId: String, isOnline: Bool, lastActiveAt: Date?) -> [String: Any] {
        var userDict: [String: Any] = [
            "id": userId,
            "username": "user_\(userId)",
            "isOnline": isOnline
        ]
        if let lastActiveAt {
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            userDict["lastActiveAt"] = formatter.string(from: lastActiveAt)
        }
        return [
            "userId": userId,
            "user": userDict
        ]
    }
}
