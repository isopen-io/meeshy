//
//  CommunityCache.swift
//  Meeshy
//
//  Fast JSON-based cache for communities
//  Provides instant startup by persisting community data to disk
//

import Foundation

/// Fast disk cache for communities using JSON serialization
/// Optimized for quick read/write operations during app startup
actor CommunityCache {

    // MARK: - Singleton

    static let shared = CommunityCache()

    // MARK: - Properties

    private var communities: [Community] = []
    private var lastUpdated: Date?
    private let fileManager = FileManager.default

    // MARK: - File Paths

    private var cacheDirectory: URL {
        let cachesDir = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return cachesDir.appendingPathComponent("CommunityCache", isDirectory: true)
    }

    private var communitiesFile: URL {
        cacheDirectory.appendingPathComponent("communities.json")
    }

    private var metadataFile: URL {
        cacheDirectory.appendingPathComponent("metadata.json")
    }

    // MARK: - Initialization

    private init() {
        // Ensure cache directory exists
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    // MARK: - Public API

    /// Load communities from disk cache
    /// Returns empty array if no cache exists
    func loadCommunities() async -> [Community] {
        guard fileManager.fileExists(atPath: communitiesFile.path) else {
            cacheLogger.debug("CommunityCache: No cache file found")
            return []
        }

        do {
            let data = try Data(contentsOf: communitiesFile)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601

            let cached = try decoder.decode(CachedCommunityData.self, from: data)
            self.communities = cached.communities
            self.lastUpdated = cached.lastUpdated

            cacheLogger.info("CommunityCache: Loaded \(cached.communities.count) communities from disk")
            return cached.communities

        } catch {
            cacheLogger.error("CommunityCache: Failed to load from disk: \(error.localizedDescription)")
            return []
        }
    }

    /// Save communities to disk cache
    func saveCommunities(_ communities: [Community]) async {
        self.communities = communities
        self.lastUpdated = Date()

        let cached = CachedCommunityData(
            communities: communities,
            lastUpdated: Date(),
            version: 1
        )

        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]

            let data = try encoder.encode(cached)
            try data.write(to: communitiesFile, options: .atomic)

            cacheLogger.info("CommunityCache: Saved \(communities.count) communities to disk")

        } catch {
            cacheLogger.error("CommunityCache: Failed to save to disk: \(error.localizedDescription)")
        }
    }

    /// Get cached communities (memory-first)
    func getCommunities() -> [Community] {
        return communities
    }

    /// Update a single community in cache
    func updateCommunity(_ community: Community) async {
        if let index = communities.firstIndex(where: { $0.id == community.id }) {
            communities[index] = community
        } else {
            communities.append(community)
        }
        await saveCommunities(communities)
    }

    /// Remove a community from cache
    func removeCommunity(id: String) async {
        communities.removeAll { $0.id == id }
        await saveCommunities(communities)
    }

    /// Clear all cached data
    func clearCache() async {
        communities = []
        lastUpdated = nil

        try? fileManager.removeItem(at: communitiesFile)
        try? fileManager.removeItem(at: metadataFile)

        cacheLogger.info("CommunityCache: Cleared all cached data")
    }

    /// Check if cache is stale (older than specified interval)
    func isCacheStale(maxAge: TimeInterval = 300) -> Bool {
        guard let lastUpdated = lastUpdated else { return true }
        return Date().timeIntervalSince(lastUpdated) > maxAge
    }

    /// Get cache age in seconds
    func cacheAge() -> TimeInterval? {
        guard let lastUpdated = lastUpdated else { return nil }
        return Date().timeIntervalSince(lastUpdated)
    }
}

// MARK: - Cache Data Model

private struct CachedCommunityData: Codable {
    let communities: [Community]
    let lastUpdated: Date
    let version: Int
}
