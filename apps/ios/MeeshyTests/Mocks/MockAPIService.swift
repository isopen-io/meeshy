//
//  MockAPIService.swift
//  MeeshyTests
//
//  Mock API Service for unit testing
//  Provides configurable responses and error simulation
//

import Foundation
@testable import Meeshy

final class MockAPIService {
    // MARK: - Configuration

    var shouldFail = false
    var errorToThrow: Error = APIError.serverError(500)
    var networkDelay: TimeInterval = 0.0
    var requestCount = 0

    // MARK: - Response Mocks

    var mockLoginResponse: (user: User, accessToken: String, refreshToken: String, requires2FA: Bool)?
    var mockRegisterResponse: (user: User, accessToken: String, refreshToken: String)?
    var mockUserResponse: User?
    var mockConversationsResponse: [Conversation] = []
    var mockMessagesResponse: [Message] = []
    var mockMessageResponse: Message?
    var mockCallResponse: Call?
    var mockTranslationResponse: Translation?
    var mockAttachmentResponse: Attachment?

    // MARK: - Request Tracking

    var lastEndpoint: String?
    var lastMethod: String?
    var lastBody: Any?
    var lastParameters: [String: String]?

    // MARK: - Mock Methods

    func get<T: Decodable>(
        _ endpoint: String,
        parameters: [String: String]? = nil,
        requiresAuth: Bool = true
    ) async throws -> T {
        requestCount += 1
        lastEndpoint = endpoint
        lastMethod = "GET"
        lastParameters = parameters

        if networkDelay > 0 {
            try await Task.sleep(nanoseconds: UInt64(networkDelay * 1_000_000_000))
        }

        if shouldFail {
            throw errorToThrow
        }

        // Return appropriate mock response based on endpoint
        if endpoint.contains("profile") {
            if let response = mockUserResponse as? T {
                return response
            }
        } else if endpoint.contains("conversations") && endpoint.contains("messages") {
            if let response = mockMessagesResponse as? T {
                return response
            }
        } else if endpoint.contains("conversations") {
            if let response = mockConversationsResponse as? T {
                return response
            }
        }

        throw APIError.invalidResponse
    }

    func post<T: Decodable, U: Encodable>(
        _ endpoint: String,
        body: U,
        requiresAuth: Bool = true
    ) async throws -> T {
        requestCount += 1
        lastEndpoint = endpoint
        lastMethod = "POST"
        lastBody = body

        if networkDelay > 0 {
            try await Task.sleep(nanoseconds: UInt64(networkDelay * 1_000_000_000))
        }

        if shouldFail {
            throw errorToThrow
        }

        // Return appropriate mock response based on endpoint
        if endpoint.contains("login") {
            if let mock = mockLoginResponse {
                let response = LoginResponse(
                    user: mock.user,
                    accessToken: mock.accessToken,
                    refreshToken: mock.refreshToken,
                    requires2FA: mock.requires2FA
                )
                if let typedResponse = response as? T {
                    return typedResponse
                }
            }
        } else if endpoint.contains("register") {
            if let mock = mockRegisterResponse {
                let response = RegisterResponse(
                    user: mock.user,
                    accessToken: mock.accessToken,
                    refreshToken: mock.refreshToken
                )
                if let typedResponse = response as? T {
                    return typedResponse
                }
            }
        } else if endpoint.contains("messages/send") {
            if let response = mockMessageResponse as? T {
                return response
            }
        } else if endpoint.contains("translation") {
            if let response = mockTranslationResponse as? T {
                return response
            }
        }

        throw APIError.invalidResponse
    }

    func put<T: Decodable, U: Encodable>(
        _ endpoint: String,
        body: U,
        requiresAuth: Bool = true
    ) async throws -> T {
        requestCount += 1
        lastEndpoint = endpoint
        lastMethod = "PUT"
        lastBody = body

        if networkDelay > 0 {
            try await Task.sleep(nanoseconds: UInt64(networkDelay * 1_000_000_000))
        }

        if shouldFail {
            throw errorToThrow
        }

        if let response = EmptyResponse() as? T {
            return response
        }

        throw APIError.invalidResponse
    }

    func delete<T: Decodable>(
        _ endpoint: String,
        requiresAuth: Bool = true
    ) async throws -> T {
        requestCount += 1
        lastEndpoint = endpoint
        lastMethod = "DELETE"

        if networkDelay > 0 {
            try await Task.sleep(nanoseconds: UInt64(networkDelay * 1_000_000_000))
        }

        if shouldFail {
            throw errorToThrow
        }

        if let response = EmptyResponse() as? T {
            return response
        }

        throw APIError.invalidResponse
    }

    func upload<T: Decodable>(
        _ endpoint: String,
        data: Data,
        filename: String,
        mimeType: String,
        parameters: [String: String]? = nil,
        progressHandler: ((Double) -> Void)? = nil
    ) async throws -> T {
        requestCount += 1
        lastEndpoint = endpoint
        lastMethod = "POST"
        lastParameters = parameters

        if networkDelay > 0 {
            try await Task.sleep(nanoseconds: UInt64(networkDelay * 1_000_000_000))
        }

        if shouldFail {
            throw errorToThrow
        }

        // Simulate upload progress
        progressHandler?(0.5)
        progressHandler?(1.0)

        if let response = mockAttachmentResponse as? T {
            return response
        }

        throw APIError.invalidResponse
    }

    // MARK: - Helper Methods

    func reset() {
        shouldFail = false
        errorToThrow = APIError.serverError(500)
        networkDelay = 0.0
        requestCount = 0
        lastEndpoint = nil
        lastMethod = nil
        lastBody = nil
        lastParameters = nil
    }
}

// MARK: - Mock Response Types

private struct LoginResponse: Codable {
    let user: User
    let accessToken: String
    let refreshToken: String
    let requires2FA: Bool
}

private struct RegisterResponse: Codable {
    let user: User
    let accessToken: String
    let refreshToken: String
}
