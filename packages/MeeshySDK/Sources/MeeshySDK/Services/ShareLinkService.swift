import Foundation

public final class ShareLinkService {
    public static let shared = ShareLinkService()
    private init() {}
    private var api: APIClient { APIClient.shared }

    // MARK: - Get Link Info (public, no auth required)

    public func getLinkInfo(identifier: String) async throws -> ShareLinkInfo {
        let response: APIResponse<ShareLinkInfo> = try await api.request(
            endpoint: "/anonymous/link/\(identifier)"
        )
        return response.data
    }

    // MARK: - Join Anonymously

    public func joinAnonymously(linkId: String, request: AnonymousJoinRequest) async throws -> AnonymousJoinResponse {
        let response: APIResponse<AnonymousJoinResponse> = try await api.post(
            endpoint: "/anonymous/join/\(linkId)",
            body: request
        )
        return response.data
    }

    // MARK: - Leave Anonymous Session

    public func leaveAnonymousSession(sessionToken: String) async throws {
        struct LeaveRequest: Encodable { let sessionToken: String }
        let _: APIResponse<[String: String]> = try await api.post(
            endpoint: "/anonymous/leave",
            body: LeaveRequest(sessionToken: sessionToken)
        )
    }

    // MARK: - Create Share Link (authenticated)

    public func createShareLink(request: CreateShareLinkRequest) async throws -> CreatedShareLink {
        let response: APIResponse<CreatedShareLink> = try await api.post(
            endpoint: "/links",
            body: request
        )
        return response.data
    }

    // MARK: - Toggle Link Active/Inactive (authenticated)

    public func toggleLink(linkId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.request(
            endpoint: "/links/\(linkId)/toggle",
            method: "PATCH"
        )
    }

    // MARK: - Delete Link (authenticated)

    public func deleteLink(linkId: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(
            endpoint: "/links/\(linkId)"
        )
    }
}
