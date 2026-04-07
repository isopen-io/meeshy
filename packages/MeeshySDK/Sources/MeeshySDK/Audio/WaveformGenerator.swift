@preconcurrency import AVFoundation

/// Deprecated: Use WaveformCache.shared instead.
/// This wrapper delegates to WaveformCache for backward compatibility.
@available(*, deprecated, message: "Use WaveformCache.shared.samples(from:count:) instead")
public actor WaveformGenerator {

    public static let shared = WaveformGenerator()
    private init() {}

    public func generateSamples(from url: URL, sampleCount: Int = 80) async throws -> [Float] {
        try await WaveformCache.shared.samples(from: url, count: sampleCount)
    }
}
