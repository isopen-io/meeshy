@preconcurrency import AVFoundation
import Foundation
import ImageIO
import CoreGraphics

// MARK: - Waveform Cache

/// Unified waveform sample extraction with persistent disk cache.
/// Replaces both WaveformGenerator (URL-based) and AudioWaveformAnalyzer (Data-based).
/// Samples are cached to disk by content hash to avoid recalculation.
public actor WaveformCache {

    public static let shared = WaveformCache()
    private init() {
        self.cacheDirectory = FileManager.default.cachesDirectory
            .appendingPathComponent("com.meeshy.waveforms", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    private let cacheDirectory: URL
    private var memoryCache: [String: [Float]] = [:]

    // MARK: - Public API

    /// Generate waveform samples from a local audio URL.
    /// Results are cached by filename + sampleCount.
    public func samples(from url: URL, count: Int = 80) async throws -> [Float] {
        let key = cacheKey(for: url.lastPathComponent, count: count)

        if let cached = memoryCache[key] { return cached }
        if let disk = loadFromDisk(key: key) {
            memoryCache[key] = disk
            return disk
        }

        let result = try await extractSamples(from: url, count: count)
        memoryCache[key] = result
        saveToDisk(key: key, samples: result)
        return result
    }

    /// Generate waveform samples from raw audio Data.
    /// Writes to a temp file, extracts, then cleans up.
    public func samples(from data: Data, count: Int = 80) async throws -> [Float] {
        let hash = stableHash(data)
        let key = cacheKey(for: hash, count: count)

        if let cached = memoryCache[key] { return cached }
        if let disk = loadFromDisk(key: key) {
            memoryCache[key] = disk
            return disk
        }

        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("waveform_\(hash).caf")
        defer { try? FileManager.default.removeItem(at: tempURL) }
        try data.write(to: tempURL)

        let result = try await extractSamples(from: tempURL, count: count)
        memoryCache[key] = result
        saveToDisk(key: key, samples: result)
        return result
    }

    /// Generate a waveform image (PNG data) suitable for use as a thumbhash.
    /// The image is a compact representation of the audio waveform.
    public func waveformImageData(from url: URL, width: Int = 64, height: Int = 32) async throws -> Data {
        let waveformSamples = try await samples(from: url, count: width)
        return renderWaveformImage(samples: waveformSamples, width: width, height: height)
    }

    /// Generate a waveform image from raw audio data.
    public func waveformImageData(from data: Data, width: Int = 64, height: Int = 32) async throws -> Data {
        let waveformSamples = try await samples(from: data, count: width)
        return renderWaveformImage(samples: waveformSamples, width: width, height: height)
    }

    /// Evict all cached waveforms from memory (disk cache remains).
    public func clearMemoryCache() {
        memoryCache.removeAll()
    }

    /// Evict all cached waveforms from memory and disk.
    public func clearAllCaches() {
        memoryCache.removeAll()
        try? FileManager.default.removeItem(at: cacheDirectory)
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    // MARK: - Sample Extraction

    private func extractSamples(from url: URL, count: Int) async throws -> [Float] {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration)
        guard duration.seconds > 0 else { return [] }

        guard let track = try await asset.loadTracks(withMediaType: .audio).first else {
            return []
        }

        let reader = try AVAssetReader(asset: asset)
        let outputSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false,
        ]
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: outputSettings)
        reader.add(output)
        reader.startReading()
        defer { if reader.status == .reading { reader.cancelReading() } }

        // Two-pass streaming: first count total samples, then bucket in a streaming pass
        // For short audio (< 5min), single-pass with estimated total is fine
        let sampleRate = try await track.load(.naturalTimeScale)
        let estimatedTotalSamples = Int(duration.seconds * Double(sampleRate))
        let estimatedBucketSize = max(1, estimatedTotalSamples / count)

        var buckets = [Float](repeating: 0, count: count)
        var bucketCounts = [Int](repeating: 0, count: count)
        var globalSampleIndex = 0

        while let buffer = output.copyNextSampleBuffer() {
            try Task.checkCancellation()
            guard let blockBuffer = CMSampleBufferGetDataBuffer(buffer) else { continue }
            let length = CMBlockBufferGetDataLength(blockBuffer)
            guard length > 0 else { continue }

            var data = Data(count: length)
            _ = data.withUnsafeMutableBytes { ptr in
                guard let base = ptr.baseAddress else { return OSStatus(0) }
                return CMBlockBufferCopyDataBytes(blockBuffer, atOffset: 0,
                                                  dataLength: length, destination: base)
            }

            data.withUnsafeBytes { ptr in
                let int16Ptr = ptr.bindMemory(to: Int16.self)
                for sample in int16Ptr {
                    let bucketIndex = min(globalSampleIndex / estimatedBucketSize, count - 1)
                    buckets[bucketIndex] += Float(abs(sample)) / Float(Int16.max)
                    bucketCounts[bucketIndex] += 1
                    globalSampleIndex += 1
                }
            }
        }

        guard globalSampleIndex > 0 else { return [] }

        var result = [Float](repeating: 0, count: count)
        for i in 0..<count {
            result[i] = bucketCounts[i] > 0 ? buckets[i] / Float(bucketCounts[i]) : 0
        }

        let maxVal = result.max() ?? 1.0
        guard maxVal > 0 else { return result }
        return result.map { $0 / maxVal }
    }

    // MARK: - Waveform Image Rendering

    private func renderWaveformImage(samples: [Float], width: Int, height: Int) -> Data {
        let scale = 2
        let pixelWidth = width * scale
        let pixelHeight = height * scale
        let bytesPerRow = pixelWidth * 4
        let colorSpace = CGColorSpaceCreateDeviceRGB()

        guard let context = CGContext(
            data: nil,
            width: pixelWidth,
            height: pixelHeight,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else {
            return Data()
        }

        context.setFillColor(red: 0, green: 0, blue: 0, alpha: 0)
        context.fill(CGRect(x: 0, y: 0, width: pixelWidth, height: pixelHeight))

        let barWidth = max(1, pixelWidth / max(1, samples.count))
        let gap = max(0, (pixelWidth - barWidth * samples.count) / max(1, samples.count))

        // Indigo brand color: #6366F1
        context.setFillColor(red: 0.388, green: 0.400, blue: 0.945, alpha: 1.0)

        for (i, sample) in samples.enumerated() {
            let barHeight = max(1, Int(CGFloat(sample) * CGFloat(pixelHeight) * 0.9))
            let x = i * (barWidth + gap)
            let y = (pixelHeight - barHeight) / 2
            context.fill(CGRect(x: x, y: y, width: max(1, barWidth - 1), height: barHeight))
        }

        guard let cgImage = context.makeImage() else { return Data() }

        let mutableData = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(mutableData, "public.png" as CFString, 1, nil) else {
            return Data()
        }
        CGImageDestinationAddImage(dest, cgImage, nil)
        CGImageDestinationFinalize(dest)
        return mutableData as Data
    }

    // MARK: - Disk Cache

    private func cacheKey(for identifier: String, count: Int) -> String {
        "\(identifier)_\(count)"
    }

    private func cacheFileURL(for key: String) -> URL {
        cacheDirectory.appendingPathComponent("\(key).waveform")
    }

    private func loadFromDisk(key: String) -> [Float]? {
        let fileURL = cacheFileURL(for: key)
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return data.withUnsafeBytes { ptr -> [Float]? in
            guard ptr.count > 0, ptr.count % MemoryLayout<Float>.size == 0 else { return nil }
            let floatPtr = ptr.bindMemory(to: Float.self)
            return Array(floatPtr)
        }
    }

    private func saveToDisk(key: String, samples: [Float]) {
        let fileURL = cacheFileURL(for: key)
        let data = samples.withUnsafeBufferPointer { ptr in
            Data(buffer: ptr)
        }
        try? data.write(to: fileURL, options: .atomic)
    }

    private func stableHash(_ data: Data) -> String {
        var hash: UInt64 = 14695981039346656037
        for byte in data.prefix(8192) {
            hash ^= UInt64(byte)
            hash &*= 1099511628211
        }
        return String(format: "%016llx", hash)
    }
}

// MARK: - FileManager Extension

private extension FileManager {
    var cachesDirectory: URL {
        urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? temporaryDirectory
    }
}
