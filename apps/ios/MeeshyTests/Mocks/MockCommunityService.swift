import Foundation
import MeeshySDK

enum CommunityStubs {
    static func community(
        id: String = "c1",
        name: String = "Alpha",
        createdBy: String = "u-creator",
        members: [APICommunityMember]? = nil,
        currentUserRole: String? = nil,
        requiresJoinApproval: Bool? = nil,
        currentUserJoinRequest: String? = nil
    ) -> APICommunity {
        let membersJSON = members
            .flatMap { try? JSONEncoder().encode($0) }
            .map { String(decoding: $0, as: UTF8.self) } ?? "null"
        let roleJSON = currentUserRole.map { "\"\($0)\"" } ?? "null"
        let approvalJSON = requiresJoinApproval.map { "\($0)" } ?? "null"
        let requestJSON = currentUserJoinRequest.map { "\"\($0)\"" } ?? "null"
        let json = """
        {"id":"\(id)","identifier":"mshy_\(id)","name":"\(name)","isPrivate":false,
         "createdBy":"\(createdBy)","createdAt":"2026-09-01T10:00:00.000Z","members":\(membersJSON),
         "currentUserRole":\(roleJSON),"requiresJoinApproval":\(approvalJSON),"currentUserJoinRequest":\(requestJSON)}
        """
        return JSONStub.decode(json)
    }

    static func member(id: String, userId: String, role: String) -> APICommunityMember {
        JSONStub.decode("""
        {"id":"\(id)","communityId":"c1","userId":"\(userId)","role":"\(role)"}
        """)
    }

    static func communityUpdated(communityId: String = "c1", name: String, isPrivate: Bool = true, memberCount: Int = 9) -> CommunityUpdatedEvent {
        CommunityUpdatedEvent(
            communityId: communityId, identifier: "mshy_\(communityId)", name: name, description: "Réglée ailleurs",
            avatar: nil, banner: nil, isPrivate: isPrivate, memberCount: memberCount,
            updatedAt: "2026-11-15T10:00:00.000Z"
        )
    }

    static func memberChange(communityId: String = "c1", userId: String, memberCount: Int = 9, role: MemberRole?) -> CommunityMemberChange {
        CommunityMemberChange(communityId: communityId, userId: userId, memberCount: memberCount, role: role)!
    }

    static func page<T: Decodable>(_ items: [T], hasMore: Bool = false) -> OffsetPaginatedAPIResponse<[T]> {
        OffsetPaginatedAPIResponse(
            success: true,
            data: items,
            pagination: OffsetPagination(total: items.count, hasMore: hasMore, limit: 20, offset: 0),
            error: nil
        )
    }
}

final class MockCommunityService: CommunityServiceProviding, @unchecked Sendable {

    var listResult: Result<OffsetPaginatedAPIResponse<[APICommunity]>, Error> = .success(CommunityStubs.page([APICommunity]()))
    var getResult: Result<APICommunity, Error> = .success(CommunityStubs.community())
    var createResult: Result<APICommunity, Error> = .success(CommunityStubs.community())
    var updateResult: Result<APICommunity, Error> = .success(CommunityStubs.community())
    var membersResult: Result<OffsetPaginatedAPIResponse<[APICommunityMember]>, Error> = .success(CommunityStubs.page([APICommunityMember]()))
    var addMemberResult: Result<APICommunityMember, Error> = .success(CommunityStubs.member(id: "m", userId: "u", role: "member"))
    var inviteResult: Result<APICommunityMember, Error> = .success(CommunityStubs.member(id: "m", userId: "u", role: "member"))
    var conversationsResult: Result<[APIConversation], Error> = .success([])
    var voidResult: Result<Void, Error> = .success(())

    private(set) var listCallCount = 0
    private(set) var lastListSearch: String?
    private(set) var lastListOffset: Int?
    private(set) var createCallCount = 0
    private(set) var addMemberCallCount = 0
    private(set) var lastUpdateName: String?
    private(set) var updateCallCount = 0
    private(set) var inviteCallCount = 0
    private(set) var addConversationCallCount = 0
    private(set) var removeMemberCallCount = 0
    private(set) var leaveCallCount = 0
    private(set) var getMembersCallCount = 0

    func list(search: String?, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APICommunity]> {
        listCallCount += 1
        lastListSearch = search
        lastListOffset = offset
        return try listResult.get()
    }

    func search(query: String, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APICommunitySearchResult]> {
        CommunityStubs.page([APICommunitySearchResult]())
    }

    private(set) var getCallCount = 0
    func get(communityId: String) async throws -> APICommunity {
        getCallCount += 1
        return try getResult.get()
    }

    func create(name: String, identifier: String?, description: String?, isPrivate: Bool) async throws -> APICommunity {
        createCallCount += 1
        return try createResult.get()
    }

    func update(communityId: String, name: String?, identifier: String?, description: String?, isPrivate: Bool?, avatar: String?, banner: String?) async throws -> APICommunity {
        updateCallCount += 1
        lastUpdateName = name
        return try updateResult.get()
    }

    func delete(communityId: String) async throws { try voidResult.get() }

    func getMembers(communityId: String, offset: Int, limit: Int) async throws -> OffsetPaginatedAPIResponse<[APICommunityMember]> {
        getMembersCallCount += 1
        return try membersResult.get()
    }

    func addMember(communityId: String, userId: String, role: MemberRole) async throws -> APICommunityMember {
        addMemberCallCount += 1
        return try addMemberResult.get()
    }

    func updateMemberRole(communityId: String, memberId: String, role: MemberRole) async throws -> APICommunityMember {
        try addMemberResult.get()
    }

    func removeMember(communityId: String, userId: String) async throws {
        removeMemberCallCount += 1
        try voidResult.get()
    }

    var joinResult: Result<CommunityJoinOutcome, Error> = .success(.joined(CommunityStubs.member(id: "m", userId: "u", role: "member")))
    private(set) var joinCallCount = 0
    func join(communityId: String) async throws -> CommunityJoinOutcome {
        joinCallCount += 1
        return try joinResult.get()
    }

    func leave(communityId: String) async throws {
        leaveCallCount += 1
        try voidResult.get()
    }

    func invite(communityId: String, userId: String) async throws -> APICommunityMember {
        inviteCallCount += 1
        return try inviteResult.get()
    }

    func invite(communityId: String, userIds: [String]) async throws { try voidResult.get() }

    func checkIdentifier(_ identifier: String) async throws -> IdentifierAvailability {
        throw MeeshyError.server(statusCode: 501, message: "unused")
    }

    private(set) var getConversationsCallCount = 0
    func getConversations(communityId: String) async throws -> [APIConversation] {
        getConversationsCallCount += 1
        return try conversationsResult.get()
    }

    func addConversation(communityId: String, conversationId: String) async throws -> APIConversation {
        addConversationCallCount += 1
        throw MeeshyError.server(statusCode: 501, message: "unused")
    }
}
