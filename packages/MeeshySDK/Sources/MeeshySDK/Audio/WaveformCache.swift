@preconcurrency import AVFoundation
import Foundation
import ImageIO
import CoreGraphics

// MARK: - Waveform Cache

/// **La mesure d'une forme d'onde, une fois, partout.**
///
/// RMS absolu par compartiment (`WaveformExtractor`, Accelerate), jamais divisé
/// par le pic ; l'échelle qui le rend lisible est `WaveformScale`. Le cache est
/// clé par l'empreinte du CONTENU (`WaveformContentKey`) et du nombre de
/// compartiments : un même son sous deux noms ne se calcule qu'une fois, deux
/// `recording.m4a` ne se confondent pas. Mémoire bornée (FIFO), disque durable.
public actor WaveformCache {

    public static let shared = WaveformCache()
    private init() {
        self.cacheDirectory = FileManager.default.cachesDirectory
            .appendingPathComponent("com.meeshy.waveforms.v2", isDirectory: true)
        try? FileManager.default.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
        try? FileManager.default.removeItem(at: FileManager.default.cachesDirectory
            .appendingPathComponent("com.meeshy.waveforms", isDirectory: true))
    }

    private let cacheDirectory: URL
    // Borné (éviction FIFO) : une éviction mémoire ne coûte qu'une relecture du disque.
    private var memoryCache = BoundedFIFOMap<String, [Float]>(capacity: 300)

    // MARK: - Public API

    /// Le relevé (RMS absolu) d'un fichier audio local.
    public func samples(from url: URL, count: Int = 80) async throws -> [Float] {
        let key = cacheKey(for: WaveformContentKey.identity(of: url), count: count)
        if let cached = cachedSamples(for: key) { return cached }
        let result = try await measure(url, count: count)
        store(result, for: key)
        return result
    }

    /// Le relevé (RMS absolu) d'un audio en mémoire.
    public func samples(from data: Data, count: Int = 80) async throws -> [Float] {
        let identity = WaveformContentKey.identity(of: data)
        let key = cacheKey(for: identity, count: count)
        if let cached = cachedSamples(for: key) { return cached }

        let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("waveform_\(identity).caf")
        defer { try? FileManager.default.removeItem(at: tempURL) }
        try data.write(to: tempURL)

        let result = try await measure(tempURL, count: count)
        store(result, for: key)
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

    // MARK: - Measure

    /// Hors de l'acteur : la mesure est du calcul, elle ne doit pas sérialiser les lectures du cache.
    private func measure(_ url: URL, count: Int) async throws -> [Float] {
        let task = Task.detached(priority: .utility) { try await WaveformExtractor.samples(from: url, count: count) }
        return try await withTaskCancellationHandler { try await task.value } onCancel: { task.cancel() }
    }

    private func cachedSamples(for key: String) -> [Float]? {
        if let cached = memoryCache[key] { return cached }
        guard let disk = loadFromDisk(key: key) else { return nil }
        memoryCache[key] = disk
        return disk
    }

    /// Un relevé vide (fichier illisible, pas encore écrit) ne se retient pas : le prochain appel retente.
    private func store(_ samples: [Float], for key: String) {
        guard !samples.isEmpty else { return }
        memoryCache[key] = samples
        saveToDisk(key: key, samples: samples)
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
            let barHeight = max(1, Int(CGFloat(WaveformScale.displayHeight(rms: sample)) * CGFloat(pixelHeight) * 0.9))
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
}

// MARK: - FileManager Extension

private extension FileManager {
    var cachesDirectory: URL {
        urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? temporaryDirectory
    }
}
