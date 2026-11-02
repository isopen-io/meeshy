import AVFoundation
import UIKit
import os

public actor VideoFrameExtractor {
    public static let shared = VideoFrameExtractor()

    // MARK: - Cache

    private var cache: [String: [UIImage]] = [:]
    private var insertionOrder: [String] = []
    private let maxCacheEntries = 20

    // MARK: - In-flight deduplication

    private var inFlightTasks: [String: Task<[UIImage], Never>] = [:]

    // MARK: - Init

    private init() {
        let center = NotificationCenter.default
        Task { [weak center] in
            guard let center else { return }
            for await _ in center.notifications(named: UIApplication.didReceiveMemoryWarningNotification) {
                await VideoFrameExtractor.shared.evictAll()
            }
        }
    }

    // MARK: - Public API

    public func extractFrames(objectId: String, url: URL, maxFrames: Int = 10) async -> [UIImage] {
        if let cached = cache[objectId] {
            return cached
        }

        if let existing = inFlightTasks[objectId] {
            return await existing.value
        }

        let task = Task.detached(priority: .utility) {
            await Self.doExtract(url: url, maxFrames: maxFrames)
        }

        inFlightTasks[objectId] = task
        let frames = await task.value
        inFlightTasks[objectId] = nil

        storeCached(frames, for: objectId)
        return frames
    }

    public func evict(objectId: String) {
        cache[objectId] = nil
        insertionOrder.removeAll { $0 == objectId }
    }

    public func evictAll() {
        cache.removeAll()
        insertionOrder.removeAll()
    }

    // MARK: - Extraction

    private static func doExtract(url: URL, maxFrames: Int) async -> [UIImage] {
        await VideoThumbnailGenerator.shared.images(for: VideoThumbnailRequest(
            url: url,
            instants: .evenlySpaced(count: maxFrames, atMostOnePerSecond: true),
            maximumSize: CGSize(width: 80, height: 80),
            tolerance: .seconds(0.5)))
    }

    // MARK: - Cache Management

    private func storeCached(_ frames: [UIImage], for objectId: String) {
        if cache[objectId] != nil {
            insertionOrder.removeAll { $0 == objectId }
        }

        while insertionOrder.count >= maxCacheEntries {
            let oldest = insertionOrder.removeFirst()
            cache[oldest] = nil
        }

        cache[objectId] = frames
        insertionOrder.append(objectId)
    }
}
