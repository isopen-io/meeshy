import Foundation
import MeeshySDK

nonisolated protocol JoinFlowLinkProviding: Sendable {
    func getLinkInfo(identifier: String) async throws -> ShareLinkInfo
    func joinAnonymously(linkId: String, request: AnonymousJoinRequest) async throws -> AnonymousJoinResponse
}

extension ShareLinkService: JoinFlowLinkProviding {}
