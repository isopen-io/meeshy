import AVFoundation
import UIKit

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
        let asset = AVURLAsset(url: url)

        guard let duration = try? await asset.load(.duration) else { return [] }
        let totalSeconds = CMTimeGetSeconds(duration)
        guard totalSeconds > 0 else { return [] }

        let generator = AVAssetImageGenerator(asset: asset)
        generator.maximumSize = CGSize(width: 80, height: 80)
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = CMTime(seconds: 0.5, preferredTimescale: 600)
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.5, preferredTimescale: 600)

        let frameCount = min(maxFrames, max(1, Int(totalSeconds)))
        let interval = totalSeconds / Double(frameCount)
        var frames: [UIImage] = []

        for i in 0..<frameCount {
            guard !Task.isCancelled else { break }

            let time = CMTime(seconds: interval * Double(i) + interval / 2.0, preferredTimescale: 600)
            guard let cgImage = try? await generator.image(at: time).image else { continue }
            frames.append(UIImage(cgImage: cgImage))
        }

        return frames
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
