import Foundation
@testable import Meeshy
import MeeshySDK

final class MockShareLinkManager: ShareLinkManaging, @unchecked Sendable {
    var listMyLinksResult: Result<[MyShareLink], Error> = .success([])
    var fetchLinkStatsResult: Result<ShareLinkArrivalStats, Error> = .success(
        ShareLinkArrivalStats(visits: 0, arrivals: 0, anonymousArrivals: 0)
    )
    var updateLinkResult: Result<Void, Error> = .success(())
    var toggleLinkResult: Result<Void, Error> = .success(())
    var deleteLinkResult: Result<Void, Error> = .success(())

    private(set) var fetchLinkStatsCallCount = 0
    private(set) var updateLinkCallCount = 0
    private(set) var toggleLinkCallCount = 0
    private(set) var deleteLinkCallCount = 0
    private(set) var lastUpdatedSettings: ShareLinkSettings?
    private(set) var lastToggledActive: Bool?

    func listMyLinks(offset: Int, limit: Int) async throws -> [MyShareLink] {
        try listMyLinksResult.get()
    }

    func fetchLinkStats(linkId: String) async throws -> ShareLinkArrivalStats {
        fetchLinkStatsCallCount += 1
        return try fetchLinkStatsResult.get()
    }

    func updateLink(linkId: String, settings: ShareLinkSettings) async throws {
        updateLinkCallCount += 1
        lastUpdatedSettings = settings
        try updateLinkResult.get()
    }

    func toggleLink(linkId: String, isActive: Bool) async throws {
        toggleLinkCallCount += 1
        lastToggledActive = isActive
        try toggleLinkResult.get()
    }

    func deleteLink(linkId: String) async throws {
        deleteLinkCallCount += 1
        try deleteLinkResult.get()
    }

    func reset() {
        listMyLinksResult = .success([])
        fetchLinkStatsResult = .success(ShareLinkArrivalStats(visits: 0, arrivals: 0, anonymousArrivals: 0))
        updateLinkResult = .success(())
        toggleLinkResult = .success(())
        deleteLinkResult = .success(())
        fetchLinkStatsCallCount = 0
        updateLinkCallCount = 0
        toggleLinkCallCount = 0
        deleteLinkCallCount = 0
        lastUpdatedSettings = nil
        lastToggledActive = nil
    }
}
