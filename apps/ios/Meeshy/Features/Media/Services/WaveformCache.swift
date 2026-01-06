//
//  WaveformCache.swift
//  Meeshy
//
//  Persistent cache for audio waveform data
//  Avoids regenerating waveforms on every conversation open
//

import Foundation
import AVFoundation

/// Thread-safe cache for audio waveform data
actor WaveformCache {

    // MARK: - Singleton

    static let shared = WaveformCache()

    // MARK: - Properties

    private let cacheDirectory: URL
    private let sampleCount = 50
    private var memoryCache: [String: [CGFloat]] = [:]
    private let maxMemoryCacheSize = 100

    // MARK: - Initialization

    private init() {
        // Create cache directory
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        cacheDirectory = caches.appendingPathComponent("WaveformCache", isDirectory: true)

        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    // MARK: - Public API

    /// Get cached waveform or generate and cache it
    /// - Parameter url: URL of the audio file
    /// - Returns: Array of waveform levels (0.0 to 1.0)
    func getWaveform(for url: URL) async -> [CGFloat] {
        let cacheKey = cacheKey(for: url)

        // 1. Check memory cache first (fastest)
        if let cached = memoryCache[cacheKey] {
            return cached
        }

        // 2. Check disk cache
        if let cached = loadFromDisk(key: cacheKey) {
            // Store in memory cache for faster access
            storeInMemoryCache(key: cacheKey, waveform: cached)
            return cached
        }

        // 3. Generate new waveform
        let waveform = await generateWaveform(for: url)

        // 4. Cache it
        storeInMemoryCache(key: cacheKey, waveform: waveform)
        saveToDisk(key: cacheKey, waveform: waveform)

        return waveform
    }

    /// Pre-generate and cache waveform in background
    /// Call this when loading messages to avoid delay on playback
    func preloadWaveform(for url: URL) {
        Task.detached(priority: .background) {
            _ = await self.getWaveform(for: url)
        }
    }

    /// Clear all cached waveforms
    func clearCache() {
        memoryCache.removeAll()
        try? FileManager.default.removeItem(at: cacheDirectory)
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    /// Get cache size in bytes
    func cacheSize() -> Int64 {
        var size: Int64 = 0

        if let enumerator = FileManager.default.enumerator(at: cacheDirectory, includingPropertiesForKeys: [.fileSizeKey]) {
            for case let fileURL as URL in enumerator {
                if let fileSize = try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize {
                    size += Int64(fileSize)
                }
            }
        }

        return size
    }

    // MARK: - Cache Key Generation

    private func cacheKey(for url: URL) -> String {
        // Use URL hash + file size for unique key
        let urlString = url.absoluteString
        let hash = urlString.data(using: .utf8)?.base64EncodedString() ?? urlString

        // Shorten the key
        let shortHash = String(hash.prefix(32)).replacingOccurrences(of: "/", with: "_")
        return shortHash
    }

    // MARK: - Memory Cache

    private func storeInMemoryCache(key: String, waveform: [CGFloat]) {
        // Evict oldest entries if cache is full
        if memoryCache.count >= maxMemoryCacheSize {
            // Remove first 20% of entries
            let keysToRemove = Array(memoryCache.keys.prefix(maxMemoryCacheSize / 5))
            for k in keysToRemove {
                memoryCache.removeValue(forKey: k)
            }
        }

        memoryCache[key] = waveform
    }

    // MARK: - Disk Cache

    private func fileURL(for key: String) -> URL {
        cacheDirectory.appendingPathComponent("\(key).waveform")
    }

    private func loadFromDisk(key: String) -> [CGFloat]? {
        let fileURL = fileURL(for: key)

        guard FileManager.default.fileExists(atPath: fileURL.path),
              let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode([CGFloat].self, from: data) else {
            return nil
        }

        return decoded
    }

    private func saveToDisk(key: String, waveform: [CGFloat]) {
        let fileURL = fileURL(for: key)

        guard let data = try? JSONEncoder().encode(waveform) else {
            return
        }

        try? data.write(to: fileURL)
    }

    // MARK: - Waveform Generation

    private func generateWaveform(for url: URL) async -> [CGFloat] {
        // Try to analyze actual audio file
        if let analyzed = analyzeAudioFile(url: url) {
            return analyzed
        }

        // Fallback to random waveform
        return generateRandomWaveform()
    }

    private nonisolated func analyzeAudioFile(url: URL) -> [CGFloat]? {
        guard let asset = try? AVAudioFile(forReading: url) else {
            return nil
        }

        let frameCount = AVAudioFrameCount(asset.length)
        let samplesPerBar = Int(frameCount) / sampleCount

        guard samplesPerBar > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: asset.processingFormat, frameCapacity: frameCount) else {
            return nil
        }

        do {
            try asset.read(into: buffer)
        } catch {
            return nil
        }

        guard let channelData = buffer.floatChannelData?[0] else {
            return nil
        }

        var levels: [CGFloat] = []

        for i in 0..<sampleCount {
            let startSample = i * samplesPerBar
            let endSample = min(startSample + samplesPerBar, Int(frameCount))

            var sum: Float = 0
            for j in startSample..<endSample {
                sum += abs(channelData[j])
            }

            let average = sum / Float(endSample - startSample)
            let normalized = CGFloat(min(1.0, average * 3)) // Amplify for visibility
            levels.append(max(0.15, normalized)) // Minimum height
        }

        return levels
    }

    private nonisolated func generateRandomWaveform() -> [CGFloat] {
        var levels: [CGFloat] = []
        var previous: CGFloat = 0.5

        for _ in 0..<sampleCount {
            let change = CGFloat.random(in: -0.3...0.3)
            let newLevel = max(0.15, min(1.0, previous + change))
            levels.append(newLevel)
            previous = newLevel
        }

        return levels
    }
}
