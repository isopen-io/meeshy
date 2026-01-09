//
//  UserService.swift
//  Meeshy
//
//  Service for user operations
//  UPDATED: Uses offset/limit pagination pattern
//  iOS 16+
//

import Foundation

@MainActor
final class UserService: @unchecked Sendable {
    // MARK: - Singleton

    static let shared = UserService()

    // MARK: - Properties

    private let apiClient: APIClient

    // MARK: - Initialization

    private init(apiClient: APIClient = APIClient.shared) {
        self.apiClient = apiClient
    }

    // MARK: - Get Current User

    func getCurrentUser() async throws -> User {
        let endpoint = UserEndpoints.getCurrentUser
        userLogger.info("Fetching current user from: \(endpoint.path)")

        let response: APIResponse<User> = try await apiClient.request(endpoint)

        guard let user = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        userLogger.info("Successfully fetched current user: \(user.username)")
        return user
    }

    // MARK: - Get User by ID

    func getUser(userId: String) async throws -> User {
        let endpoint = UserEndpoints.getUser(userId: userId)
        userLogger.info("Fetching user \(userId) from: \(endpoint.path)")

        let response: APIResponse<User> = try await apiClient.request(endpoint)

        guard let user = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        userLogger.info("Successfully fetched user: \(user.username)")
        return user
    }

    // MARK: - Search Users

    func searchUsers(query: String, offset: Int = 0, limit: Int = 20) async throws -> [User] {
        let endpoint = UserEndpoints.searchUsers(query: query, offset: offset, limit: limit)
        userLogger.info("Searching users with query '\(query)' at: \(endpoint.path)")

        let response: APIResponse<[User]> = try await apiClient.request(endpoint)

        guard let users = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        userLogger.info("Found \(users.count) users matching '\(query)'")
        return users
    }

    // MARK: - Update Profile

    func updateProfile(request: UserProfileUpdateRequest) async throws -> User {
        let endpoint = UserEndpoints.updateProfile(request)
        userLogger.info("Updating user profile at: \(endpoint.path)")

        let response: APIResponse<User> = try await apiClient.request(endpoint)

        guard let user = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        userLogger.info("Successfully updated profile for: \(user.username)")
        return user
    }

    // MARK: - Upload Avatar

    func uploadAvatar(imageData: Data) async throws -> User {
        userLogger.info("Uploading avatar (\(imageData.count) bytes)")

        let endpoint = UserEndpoints.uploadAvatar
        let response: APIResponse<User> = try await apiClient.upload(
            endpoint,
            fileData: imageData,
            mimeType: "image/jpeg",
            fileName: "avatar.jpg"
        )

        guard let user = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        userLogger.info("Successfully uploaded avatar for: \(user.username)")
        return user
    }

    // MARK: - Update Status

    func updateStatus(presence: UserPresence, statusMessage: String? = nil) async throws {
        userLogger.info("Updating user status: \(presence.rawValue)")

        let request = UserStatusUpdateRequest(presence: presence, statusMessage: statusMessage)
        let endpoint = UserEndpoints.updateStatus(request)
        let _: APIResponse<EmptyResponse> = try await apiClient.request(endpoint)

        userLogger.info("Successfully updated status to: \(presence.rawValue)")
    }

    // MARK: - Update Preferences

    func updatePreferences(preferences: UserPreferences) async throws -> UserPreferences {
        userLogger.info("Updating user preferences")

        let endpoint = UserEndpoints.updatePreferences(preferences)
        let response: APIResponse<UserPreferences> = try await apiClient.request(endpoint)

        guard let updatedPreferences = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        userLogger.info("Successfully updated preferences")
        return updatedPreferences
    }

    // MARK: - Block User

    func blockUser(userId: String) async throws {
        userLogger.info("Blocking user: \(userId)")

        let endpoint = UserEndpoints.blockUser(userId: userId)
        let _: APIResponse<EmptyResponse> = try await apiClient.request(endpoint)

        userLogger.info("Successfully blocked user: \(userId)")
    }

    // MARK: - Unblock User

    func unblockUser(userId: String) async throws {
        userLogger.info("Unblocking user: \(userId)")

        let endpoint = UserEndpoints.unblockUser(userId: userId)
        let _: APIResponse<EmptyResponse> = try await apiClient.request(endpoint)

        userLogger.info("Successfully unblocked user: \(userId)")
    }

    // MARK: - Report User

    func reportUser(userId: String, reason: String, details: String? = nil) async throws {
        userLogger.info("Reporting user: \(userId)")

        let endpoint = UserEndpoints.reportUser(userId: userId, reason: reason)
        let _: APIResponse<EmptyResponse> = try await apiClient.request(endpoint)

        userLogger.info("Successfully reported user: \(userId)")
    }

    // MARK: - Get Blocked Users

    func getBlockedUsers() async throws -> [User] {
        userLogger.info("Fetching blocked users")

        let endpoint = UserEndpoints.getBlockedUsers
        let response: APIResponse<[User]> = try await apiClient.request(endpoint)

        guard let users = response.data else {
            throw MeeshyError.network(.invalidResponse)
        }

        userLogger.info("Found \(users.count) blocked users")
        return users
    }

    // MARK: - Delete Account

    func deleteAccount() async throws {
        userLogger.info("Deleting user account")

        let endpoint = UserEndpoints.deleteAccount
        let _: APIResponse<EmptyResponse> = try await apiClient.request(endpoint)

        userLogger.info("Successfully deleted account")
    }
}
