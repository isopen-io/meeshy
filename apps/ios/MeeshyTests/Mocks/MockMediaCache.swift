import Foundation
import UIKit
import XCTest

final class MockMediaCache: @unchecked Sendable {

    // MARK: - Storage

    private var storage: [String: Data] = [:]

    // MARK: - Call Tracking

    var dataCallCount = 0
    var imageCallCount = 0
    var localFileURLCallCount = 0
    var prefetchCallCount = 0
    var conditionalPrefetchCallCount = 0
    var cachedDataCallCount = 0
    var isCachedCallCount = 0
    var storeCallCount = 0
    var removeCallCount = 0
    var clearAllCallCount = 0
    var evictExpiredCallCount = 0

    // MARK: - Stubbed Behavior

    var errorToThrow: Error?

    // MARK: - Protocol Methods

    func data(for urlString: String) async throws -> Data {
        dataCallCount += 1
        if let error = errorToThrow { throw error }
        guard let data = storage[urlString] else {
            throw URLError(.fileDoesNotExist)
        }
        return data
    }

    func image(for urlString: String) async throws -> UIImage {
        imageCallCount += 1
        if let error = errorToThrow { throw error }
        guard let data = storage[urlString], let image = UIImage(data: data) else {
            throw URLError(.cannotDecodeContentData)
        }
        return image
    }

    func localFileURL(for urlString: String) async throws -> URL {
        localFileURLCallCount += 1
        if let error = errorToThrow { throw error }
        return URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(urlString.hashValue.description)
    }

    func prefetch(_ urlString: String) async {
        prefetchCallCount += 1
    }

    func conditionalPrefetch(_ urlString: String, fileSizeMB: Int) async {
        conditionalPrefetchCallCount += 1
    }

    func cachedData(for urlString: String) async -> Data? {
        cachedDataCallCount += 1
        return storage[urlString]
    }

    func isCached(_ urlString: String) async -> Bool {
        isCachedCallCount += 1
        return storage[urlString] != nil
    }

    func store(_ data: Data, for urlString: String) async {
        storeCallCount += 1
        storage[urlString] = data
    }

    func remove(for urlString: String) async {
        removeCallCount += 1
        storage.removeValue(forKey: urlString)
    }

    func clearAll() async {
        clearAllCallCount += 1
        storage.removeAll()
    }

    func evictExpired() async {
        evictExpiredCallCount += 1
    }

    // MARK: - Test Helpers

    func seedData(_ data: Data, for urlString: String) {
        storage[urlString] = data
    }

    // MARK: - Reset

    func reset() {
        storage.removeAll()
        dataCallCount = 0
        imageCallCount = 0
        localFileURLCallCount = 0
        prefetchCallCount = 0
        conditionalPrefetchCallCount = 0
        cachedDataCallCount = 0
        isCachedCallCount = 0
        storeCallCount = 0
        removeCallCount = 0
        clearAllCallCount = 0
        evictExpiredCallCount = 0
        errorToThrow = nil
    }
}
