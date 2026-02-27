import Foundation
import AVFoundation

// MARK: - Audio Waveform Analyzer

@MainActor
public class AudioWaveformAnalyzer: ObservableObject {
    @Published public var samples: [Float] = []
    @Published public var isAnalyzing = false

    private var analyzeTask: Task<Void, Never>?

    public init() {}

    public func analyze(data: Data, barCount: Int = 120) {
        analyzeTask?.cancel()
        isAnalyzing = true

        analyzeTask = Task.detached { [weak self] in
            let result = Self.extractSamples(from: data, barCount: barCount)
            guard !Task.isCancelled else { return }
            await MainActor.run { [weak self] in
                self?.samples = result
                self?.isAnalyzing = false
            }
        }
    }

    nonisolated private static func extractSamples(from data: Data, barCount: Int) -> [Float] {
        let tempDir = FileManager.default.temporaryDirectory
        let tempFile = tempDir.appendingPathComponent("waveform_\(UUID().uuidString).caf")

        defer { try? FileManager.default.removeItem(at: tempFile) }

        do {
            try data.write(to: tempFile)

            let audioFile = try AVAudioFile(forReading: tempFile)
            let format = audioFile.processingFormat
            let frameCount = AVAudioFrameCount(audioFile.length)

            guard frameCount > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
                return Self.generateFallback(count: barCount)
            }

            try audioFile.read(into: buffer)

            guard let channelData = buffer.floatChannelData else {
                return Self.generateFallback(count: barCount)
            }

            let totalFrames = Int(buffer.frameLength)
            guard totalFrames > 0 else { return Self.generateFallback(count: barCount) }

            let samplesPerBar = max(1, totalFrames / barCount)
            var result = [Float](repeating: 0, count: barCount)

            for bar in 0..<barCount {
                let start = bar * samplesPerBar
                let end = min(start + samplesPerBar, totalFrames)
                guard start < end else { continue }

                var sum: Float = 0
                for i in start..<end {
                    sum += abs(channelData[0][i])
                }
                result[bar] = sum / Float(end - start)
            }

            let maxVal = result.max() ?? 1.0
            guard maxVal > 0 else { return Self.generateFallback(count: barCount) }

            return result.map { min(1.0, $0 / maxVal) }
        } catch {
            return Self.generateFallback(count: barCount)
        }
    }

    nonisolated private static func generateFallback(count: Int) -> [Float] {
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
