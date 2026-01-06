//
//  PaginationManager.swift
//  Meeshy
//
//  Generic, production-ready pagination manager for infinite scroll
//  Supports both cursor-based and page-based pagination
//  iOS 16+
//
//  FEATURES:
//  - Generic support for any Identifiable & Equatable type
//  - Proper loading states: idle, loading, loadingMore, refreshing, error
//  - Deduplication by ID
//  - Prefetching support (load next page when N items from bottom)
//  - Cache integration with PaginatedCache
//  - Thread-safe with @MainActor isolation
//

import Foundation
import Combine

// MARK: - Pagination State

/// Current state of pagination
public enum PaginationState: Equatable, Sendable {
    case idle
    case loading           // Initial load
    case loadingMore       // Loading next page
    case refreshing        // Pull-to-refresh
    case error(String)     // Error with message

    public var isLoading: Bool {
        switch self {
        case .loading, .loadingMore, .refreshing:
            return true
        default:
            return false
        }
    }

    public var canLoadMore: Bool {
        switch self {
        case .idle:
            return true
        default:
            return false
        }
    }
}

// MARK: - Pagination Type

/// Type of pagination the API supports
public enum PaginationType: Sendable {
    case cursor(String?)   // Cursor-based (preferred)
    case page(Int)         // Page-based (fallback)
    case offset(Int)       // Offset-based

    var description: String {
        switch self {
        case .cursor(let cursor):
            return "cursor=\(cursor ?? "nil")"
        case .page(let page):
            return "page=\(page)"
        case .offset(let offset):
            return "offset=\(offset)"
        }
    }
}

// MARK: - Paginated Response

/// Standard response from paginated API calls
public struct PaginatedResponse<T: Sendable>: Sendable {
    public let items: [T]
    public let nextCursor: String?  // For cursor-based pagination
    public let hasMore: Bool
    public let totalCount: Int?

    public init(
        items: [T],
        nextCursor: String? = nil,
        hasMore: Bool = false,
        totalCount: Int? = nil
    ) {
        self.items = items
        self.nextCursor = nextCursor
        self.hasMore = hasMore
        self.totalCount = totalCount
    }

    /// Create from API response with page-based pagination
    public static func fromPageBased(
        items: [T],
        page: Int,
        limit: Int,
        total: Int
    ) -> PaginatedResponse {
        let hasMore = page * limit < total
        return PaginatedResponse(
            items: items,
            nextCursor: nil,
            hasMore: hasMore,
            totalCount: total
        )
    }
}

// MARK: - Pagination Configuration

public struct PaginationConfiguration: Sendable {
    /// Number of items per page
    public let pageSize: Int

    /// Number of items from the end to trigger prefetch
    public let prefetchThreshold: Int

    /// Whether to enable caching
    public let enableCache: Bool

    /// Cache key prefix
    public let cacheKeyPrefix: String

    /// Maximum retry attempts for failed requests
    public let maxRetries: Int

    /// Retry delay in seconds
    public let retryDelay: TimeInterval

    public init(
        pageSize: Int = 20,
        prefetchThreshold: Int = 5,
        enableCache: Bool = true,
        cacheKeyPrefix: String = "",
        maxRetries: Int = 2,
        retryDelay: TimeInterval = 1.0
    ) {
        self.pageSize = pageSize
        self.prefetchThreshold = prefetchThreshold
        self.enableCache = enableCache
        self.cacheKeyPrefix = cacheKeyPrefix
        self.maxRetries = maxRetries
        self.retryDelay = retryDelay
    }

    public static let conversations = PaginationConfiguration(
        pageSize: 100,
        prefetchThreshold: 10,
        enableCache: true,
        cacheKeyPrefix: "conversations"
    )

    public static let messages = PaginationConfiguration(
        pageSize: 50,
        prefetchThreshold: 10,
        enableCache: true,
        cacheKeyPrefix: "messages"
    )
}

// MARK: - Pagination Manager

/// Generic pagination manager for infinite scroll
@MainActor
public final class PaginationManager<T: Identifiable & Equatable & Sendable>: ObservableObject where T.ID: Hashable & Sendable {

    // MARK: - Published Properties

    @Published public private(set) var items: [T] = []
    @Published public private(set) var state: PaginationState = .idle
    @Published public private(set) var hasMorePages: Bool = true
    @Published public private(set) var totalCount: Int?

    // MARK: - Properties

    private let configuration: PaginationConfiguration
    private let fetchFunction: (PaginationType, Int) async throws -> PaginatedResponse<T>

    private var currentCursor: String?
    private var currentPage: Int = 1
    private var retryCount: Int = 0

    /// Cache key for this pagination context
    private var cacheKey: String {
        configuration.cacheKeyPrefix.isEmpty ? "default" : configuration.cacheKeyPrefix
    }

    // MARK: - Initialization

    /// Initialize with a fetch function
    /// - Parameters:
    ///   - configuration: Pagination configuration
    ///   - fetch: Async function to fetch items. Receives pagination type and page size.
    public init(
        configuration: PaginationConfiguration = PaginationConfiguration(),
        fetch: @escaping (PaginationType, Int) async throws -> PaginatedResponse<T>
    ) {
        self.configuration = configuration
        self.fetchFunction = fetch
    }

    // MARK: - Public API

    /// Load initial data (first page)
    /// Call this when the view appears or needs fresh data
    public func loadInitial() async {
        guard state != .loading else {
            cacheLogger.debug("PaginationManager: Already loading initial, skipping")
            return
        }

        state = .loading
        currentPage = 1
        currentCursor = nil
        retryCount = 0

        await performFetch(isInitial: true)
    }

    /// Refresh data (pull-to-refresh)
    /// Fetches first page and replaces all items
    public func refresh() async {
        guard state != .refreshing else {
            cacheLogger.debug("PaginationManager: Already refreshing, skipping")
            return
        }

        state = .refreshing
        currentPage = 1
        currentCursor = nil
        retryCount = 0

        await performFetch(isInitial: true)
    }

    /// Load next page
    /// Call this when user scrolls near the bottom
    public func loadMore() async {
        guard state.canLoadMore && hasMorePages else {
            cacheLogger.debug("PaginationManager: Cannot load more (state: \(state), hasMore: \(hasMorePages))")
            return
        }

        state = .loadingMore
        retryCount = 0

        await performFetch(isInitial: false)
    }

    /// Check if should prefetch based on item position
    /// Call this in `.onAppear` for list items
    /// - Parameter item: The item that appeared
    /// - Returns: True if should trigger loadMore
    public func shouldPrefetch(for item: T) -> Bool {
        guard let index = items.firstIndex(where: { $0.id == item.id }) else {
            return false
        }

        let distanceFromEnd = items.count - index - 1
        return distanceFromEnd <= configuration.prefetchThreshold && hasMorePages && state.canLoadMore
    }

    /// Handle item appearing (convenience method for SwiftUI)
    /// Automatically triggers loadMore if needed
    public func onItemAppear(_ item: T) async {
        if shouldPrefetch(for: item) {
            await loadMore()
        }
    }

    /// Insert a new item at the beginning
    /// Use for real-time updates (e.g., new message received)
    public func prepend(_ item: T) {
        guard !items.contains(where: { $0.id == item.id }) else { return }
        items.insert(item, at: 0)
    }

    /// Insert multiple items at the beginning
    public func prepend(contentsOf newItems: [T]) {
        let existingIds = Set(items.map { $0.id })
        let uniqueNewItems = newItems.filter { !existingIds.contains($0.id) }
        items.insert(contentsOf: uniqueNewItems, at: 0)
    }

    /// Update an existing item
    public func update(_ item: T) {
        if let index = items.firstIndex(where: { $0.id == item.id }) {
            items[index] = item
        }
    }

    /// Remove an item
    public func remove(_ item: T) {
        items.removeAll { $0.id == item.id }
    }

    /// Remove item by ID
    public func remove(id: T.ID) {
        items.removeAll { $0.id == id }
    }

    /// Clear all items and reset state
    public func reset() {
        items = []
        state = .idle
        hasMorePages = true
        totalCount = nil
        currentCursor = nil
        currentPage = 1
        retryCount = 0
    }

    /// Retry failed request
    public func retry() async {
        switch state {
        case .error:
            // Determine if we were loading initial or more
            if items.isEmpty {
                await loadInitial()
            } else {
                await loadMore()
            }
        default:
            break
        }
    }

    // MARK: - Private Methods

    private func performFetch(isInitial: Bool) async {
        do {
            // Determine pagination type
            let paginationType: PaginationType
            if let cursor = currentCursor, !isInitial {
                paginationType = .cursor(cursor)
            } else {
                paginationType = .page(currentPage)
            }

            cacheLogger.debug("PaginationManager: Fetching \(paginationType.description), pageSize: \(configuration.pageSize)")

            // Fetch data
            let response = try await fetchFunction(paginationType, configuration.pageSize)

            // Update state
            if isInitial {
                items = response.items
            } else {
                // Deduplicate and append
                let existingIds = Set(items.map { $0.id })
                let newItems = response.items.filter { !existingIds.contains($0.id) }
                items.append(contentsOf: newItems)
            }

            // Update pagination state
            currentCursor = response.nextCursor
            currentPage += 1
            hasMorePages = response.hasMore
            totalCount = response.totalCount

            state = .idle
            retryCount = 0

            cacheLogger.info("PaginationManager: Fetched \(response.items.count) items, total: \(items.count), hasMore: \(hasMorePages)")

        } catch {
            // Handle retry
            if retryCount < configuration.maxRetries {
                retryCount += 1
                cacheLogger.warn("PaginationManager: Fetch failed, retrying (\(retryCount)/\(configuration.maxRetries)): \(error.localizedDescription)")

                try? await Task.sleep(nanoseconds: UInt64(configuration.retryDelay * 1_000_000_000))
                await performFetch(isInitial: isInitial)
            } else {
                state = .error(error.localizedDescription)
                cacheLogger.error("PaginationManager: Fetch failed after \(configuration.maxRetries) retries: \(error.localizedDescription)")
            }
        }
    }
}

// MARK: - Convenience Extensions for SwiftUI

extension PaginationManager {

    /// Binding for loading state (useful for ProgressView)
    public var isLoading: Bool {
        state == .loading
    }

    /// Binding for loading more state
    public var isLoadingMore: Bool {
        state == .loadingMore
    }

    /// Binding for refreshing state
    public var isRefreshing: Bool {
        state == .refreshing
    }

    /// Error message if in error state
    public var errorMessage: String? {
        if case .error(let message) = state {
            return message
        }
        return nil
    }

    /// Whether there's an error
    public var hasError: Bool {
        if case .error = state {
            return true
        }
        return false
    }
}

// MARK: - Sorted Pagination Manager

/// Pagination manager with built-in sorting
@MainActor
public final class SortedPaginationManager<T: Identifiable & Equatable & Sendable>: ObservableObject where T.ID: Hashable & Sendable {

    // MARK: - Properties

    private let paginationManager: PaginationManager<T>
    private let sortComparator: (T, T) -> Bool

    @Published public private(set) var sortedItems: [T] = []

    // Forwarded properties
    public var state: PaginationState { paginationManager.state }
    public var hasMorePages: Bool { paginationManager.hasMorePages }
    public var totalCount: Int? { paginationManager.totalCount }
    public var isLoading: Bool { paginationManager.isLoading }
    public var isLoadingMore: Bool { paginationManager.isLoadingMore }
    public var isRefreshing: Bool { paginationManager.isRefreshing }
    public var errorMessage: String? { paginationManager.errorMessage }

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Initialization

    public init(
        configuration: PaginationConfiguration = PaginationConfiguration(),
        sortBy: @escaping (T, T) -> Bool,
        fetch: @escaping (PaginationType, Int) async throws -> PaginatedResponse<T>
    ) {
        self.sortComparator = sortBy
        self.paginationManager = PaginationManager(configuration: configuration, fetch: fetch)

        // Subscribe to items changes
        paginationManager.$items
            .map { [sortBy] items in
                items.sorted(by: sortBy)
            }
            .assign(to: &$sortedItems)
    }

    // MARK: - Public API

    public func loadInitial() async {
        await paginationManager.loadInitial()
    }

    public func refresh() async {
        await paginationManager.refresh()
    }

    public func loadMore() async {
        await paginationManager.loadMore()
    }

    public func onItemAppear(_ item: T) async {
        await paginationManager.onItemAppear(item)
    }

    public func prepend(_ item: T) {
        paginationManager.prepend(item)
    }

    public func update(_ item: T) {
        paginationManager.update(item)
    }

    public func remove(_ item: T) {
        paginationManager.remove(item)
    }

    public func reset() {
        paginationManager.reset()
    }

    public func retry() async {
        await paginationManager.retry()
    }
}

// MARK: - Categorized Items Support

/// Extension for managing categorized items (e.g., pinned vs unpinned conversations)
extension PaginationManager {

    /// Get items matching a predicate
    public func filter(where predicate: (T) -> Bool) -> [T] {
        items.filter(predicate)
    }

    /// Partition items into categories
    public func partition(by predicate: (T) -> Bool) -> (matching: [T], nonMatching: [T]) {
        var matching: [T] = []
        var nonMatching: [T] = []

        for item in items {
            if predicate(item) {
                matching.append(item)
            } else {
                nonMatching.append(item)
            }
        }

        return (matching, nonMatching)
    }
}

// MARK: - Hashable for PaginationState

extension PaginationState: Hashable {
    public func hash(into hasher: inout Hasher) {
        switch self {
        case .idle:
            hasher.combine(0)
        case .loading:
            hasher.combine(1)
        case .loadingMore:
            hasher.combine(2)
        case .refreshing:
            hasher.combine(3)
        case .error(let message):
            hasher.combine(4)
            hasher.combine(message)
        }
    }
}
