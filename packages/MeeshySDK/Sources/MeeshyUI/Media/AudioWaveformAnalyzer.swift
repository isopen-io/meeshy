import Foundation
import Combine
import AVFoundation
import MeeshySDK

// MARK: - Audio Waveform Analyzer

/// Observable wrapper around WaveformCache for SwiftUI views.
/// Provides @Published samples that views can bind to directly.
@MainActor
public class AudioWaveformAnalyzer: ObservableObject {
    @Published public var samples: [Float] = []
    @Published public var isAnalyzing = false

    private var analyzeTask: Task<Void, Never>?

    public init() {}

    public func analyze(data: Data, barCount: Int = 120) {
        analyzeTask?.cancel()
        isAnalyzing = true

        analyzeTask = Task { [weak self] in
            do {
                let result = try await WaveformCache.shared.samples(from: data, count: barCount)
                guard !Task.isCancelled else { return }
                self?.samples = result
                self?.isAnalyzing = false
            } catch {
                guard !Task.isCancelled else { return }
                self?.samples = Self.generateFallback(count: barCount)
                self?.isAnalyzing = false
            }
        }
    }

    public func analyze(url: URL, barCount: Int = 120) {
        analyzeTask?.cancel()
        isAnalyzing = true

        analyzeTask = Task { [weak self] in
            do {
                let result = try await WaveformCache.shared.samples(from: url, count: barCount)
                guard !Task.isCancelled else { return }
                self?.samples = result
                self?.isAnalyzing = false
            } catch {
                guard !Task.isCancelled else { return }
                self?.samples = Self.generateFallback(count: barCount)
                self?.isAnalyzing = false
            }
        }
    }

    /// Generate waveform image data for use as audio thumbhash.
    public func waveformImageData(from url: URL, width: Int = 64, height: Int = 32) async -> Data {
        do {
            return try await WaveformCache.shared.waveformImageData(from: url, width: width, height: height)
        } catch {
            return Data()
        }
    }

    nonisolated static func generateFallback(count: Int) -> [Float] {
        (0..<count).map { i in
            let seed = Double(i * 7 + 3)
            let value = 0.2 + abs(sin(seed) * 0.4 + cos(seed * 0.5) * 0.3)
            return Float(min(1.0, value))
        }
    }

    deinit {
        analyzeTask?.cancel()
    }
}
