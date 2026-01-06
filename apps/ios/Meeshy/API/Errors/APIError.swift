//
//  APIError.swift
//  Meeshy
//
//  Type alias for API errors to maintain backward compatibility
//

import Foundation

// MARK: - APIError Type Alias

/// Type alias for backward compatibility with existing code
/// Maps APIError to MeeshyError for unified error handling
typealias APIError = MeeshyError

// MARK: - Additional Error Factory Methods

extension APIError {
    /// Invalid URL error
    static var invalidURL: APIError {
        return .network(.invalidURL)
    }

    /// Creates a server error with a message
    static func serverError(_ message: String) -> APIError {
        return .network(.serverError(500))
    }

    /// Creates an authentication error
    static func authenticationError(_ message: String) -> APIError {
        return .auth(.unauthorized)
    }

    /// Creates a validation error
    static func validationError(_ message: String) -> APIError {
        return .validation(.custom(message))
    }
}