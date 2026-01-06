//
//  CommunityService.swift
//  Meeshy
//
//  Service for community operations
//

import Foundation
import Combine

// MARK: - Community Service

final class CommunityService: Sendable {

    // MARK: - Singleton

    static let shared = CommunityService()

    // MARK: - Properties

    private let apiClient: APIClient

    // MARK: - Initialization

    private init(apiClient: APIClient = APIClient.shared) {
        self.apiClient = apiClient
    }

    // MARK: - Fetch Communities

    func fetchCommunities() async throws -> [Community] {
        let endpoint = CommunityEndpoints.fetchCommunities
        let response: APIResponse<[Community]> = try await apiClient.request(endpoint)

        guard let communities = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        return communities
    }

    // MARK: - Fetch Community Conversations

    func fetchCommunityConversations(
        communityId: String,
        page: Int = 1,
        limit: Int = 20
    ) async throws -> PaginatedResponse<Conversation> {
        let endpoint = CommunityEndpoints.getCommunityConversations(communityId: communityId, page: page, limit: limit)
        let response: APIResponse<[Conversation]> = try await apiClient.request(endpoint)

        guard let conversations = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        // Determine hasMore from response
        let hasMore = conversations.count >= limit

        return PaginatedResponse(
            items: conversations,
            nextCursor: nil,
            hasMore: hasMore,
            totalCount: nil
        )
    }
}
