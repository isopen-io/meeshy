//
//  PaginationConfig.swift
//  Meeshy
//
//  Centralized pagination configuration
//  Single source of truth for all pagination-related constants
//

import Foundation

/// Centralized pagination configuration
/// All pagination logic should reference these constants
enum PaginationConfig {

    // MARK: - Backend Limits

    /// Backend's maximum items per page for conversations
    /// The backend will NEVER return more than this, regardless of what we request
    static let conversationsPerPage: Int = 50

    /// Backend's maximum items per page for messages
    static let messagesPerPage: Int = 50

    /// Backend's maximum items per page for members
    static let membersPerPage: Int = 20

    // MARK: - Safety Limits

    /// Maximum pages to fetch before stopping (prevents infinite loops)
    static let maxPages: Int = 100

    /// Maximum consecutive duplicate pages before stopping
    static let maxDuplicatePages: Int = 3

    // MARK: - Helper Methods

    /// Calculate offset from page number
    /// - Parameters:
    ///   - page: Page number (1-indexed)
    ///   - pageSize: Items per page
    /// - Returns: Offset for API request
    ///
    /// Example:
    /// - Page 1: offset = 0
    /// - Page 2: offset = 50
    /// - Page 3: offset = 100
    static func offset(forPage page: Int, pageSize: Int = conversationsPerPage) -> Int {
        return (page - 1) * pageSize
    }

    /// Determine if there are more pages based on received count
    /// - Parameters:
    ///   - receivedCount: Number of items received from backend
    ///   - pageSize: Expected items per page
    /// - Returns: true if backend likely has more data
    static func hasMorePages(receivedCount: Int, pageSize: Int = conversationsPerPage) -> Bool {
        return receivedCount >= pageSize
    }

    /// Calculate current page from total items loaded
    /// - Parameters:
    ///   - totalItems: Total items loaded so far
    ///   - pageSize: Items per page
    /// - Returns: Current page number (1-indexed)
    static func currentPage(forTotalItems totalItems: Int, pageSize: Int = conversationsPerPage) -> Int {
        guard totalItems > 0 else { return 1 }
        return (totalItems / pageSize) + (totalItems % pageSize > 0 ? 1 : 0)
    }
}
