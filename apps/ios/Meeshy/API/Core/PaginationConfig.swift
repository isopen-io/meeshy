//
//  PaginationConfig.swift
//  Meeshy
//
//  Centralized pagination configuration
//  Single source of truth for all pagination-related constants
//  UPDATED: Uses offset/limit pattern instead of page/pageSize
//

import Foundation

/// Centralized pagination configuration
/// All pagination logic should reference these constants
enum PaginationConfig {

    // MARK: - Default Limits

    /// Default limit for conversations
    /// The backend will NEVER return more than this, regardless of what we request
    static let conversationsLimit: Int = 50

    /// Default limit for messages
    static let messagesLimit: Int = 50

    /// Default limit for members
    static let membersLimit: Int = 20

    // MARK: - Safety Limits

    /// Maximum offset before stopping (prevents infinite loops)
    /// At 50 items per request, this allows 5000 items
    static let maxOffset: Int = 5000

    /// Maximum consecutive duplicate fetches before stopping
    static let maxDuplicateFetches: Int = 3

    // MARK: - Helper Methods

    /// Calculate next offset after loading items
    /// - Parameters:
    ///   - currentOffset: Current offset
    ///   - loadedCount: Number of items just loaded
    /// - Returns: Next offset for the following request
    ///
    /// Example:
    /// - currentOffset: 0, loadedCount: 50 -> nextOffset: 50
    /// - currentOffset: 50, loadedCount: 50 -> nextOffset: 100
    /// - currentOffset: 100, loadedCount: 30 -> nextOffset: 130
    static func nextOffset(currentOffset: Int, loadedCount: Int) -> Int {
        return currentOffset + loadedCount
    }

    /// Determine if there are more items based on received count
    /// - Parameters:
    ///   - receivedCount: Number of items received from backend
    ///   - limit: Expected items per request
    /// - Returns: true if backend likely has more data
    static func hasMore(receivedCount: Int, limit: Int = conversationsLimit) -> Bool {
        return receivedCount >= limit
    }

    /// Calculate total items loaded from current offset
    /// - Parameters:
    ///   - offset: Current offset
    ///   - currentBatchCount: Items in current batch
    /// - Returns: Total items loaded so far
    static func totalItems(offset: Int, currentBatchCount: Int) -> Int {
        return offset + currentBatchCount
    }

    // MARK: - Legacy Compatibility (Page to Offset Conversion)

    /// Convert page number to offset (for legacy code)
    /// - Parameters:
    ///   - page: Page number (1-indexed)
    ///   - limit: Items per page
    /// - Returns: Offset for API request
    @available(*, deprecated, message: "Use offset directly instead of page-based pagination")
    static func offset(forPage page: Int, limit: Int = conversationsLimit) -> Int {
        return (page - 1) * limit
    }

    /// Legacy alias for hasMore (for backward compatibility)
    @available(*, deprecated, renamed: "hasMore(receivedCount:limit:)")
    static func hasMorePages(receivedCount: Int, pageSize: Int = conversationsLimit) -> Bool {
        return hasMore(receivedCount: receivedCount, limit: pageSize)
    }

    /// Legacy alias for calculating current page from total items
    @available(*, deprecated, message: "Use offset tracking instead of page-based pagination")
    static func currentPage(forTotalItems totalItems: Int, pageSize: Int = conversationsLimit) -> Int {
        guard totalItems > 0 else { return 1 }
        return (totalItems / pageSize) + (totalItems % pageSize > 0 ? 1 : 0)
    }

    // MARK: - Convenience Aliases

    /// Alias for backward compatibility
    static var conversationsPerPage: Int { conversationsLimit }
    static var messagesPerPage: Int { messagesLimit }
    static var membersPerPage: Int { membersLimit }
}
