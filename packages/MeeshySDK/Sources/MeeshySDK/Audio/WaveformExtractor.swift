@preconcurrency import AVFoundation
import Accelerate
import Foundation

// MARK: - L'extracteur

/// **Le seul endroit qui ouvre de l'audio pour mesurer une onde.**
///
/// Fichier lisible par `AVAudioFile` (voix, son, audio d'une vidéo) : lecture par
/// blocs de 64 Ki trames, mono par moyenne des canaux, RMS par compartiment. Sinon
/// (conteneur que `AVAudioFile` refuse) : `AVAssetReader` décode en mono 44,1 kHz
/// flottant et alimente le MÊME accumulateur. Synchrone côté CPU : l'appelant le
/// pose hors de tout acteur.
enum WaveformExtractor {

    private static let chunkFrames: AVAudioFrameCount = 65_536
    private static let fallbackSampleRate: Double = 44_100

    static func samples(from url: URL, count: Int) async throws -> [Float] {
        guard count > 0 else { return [] }
        guard let file = try? AVAudioFile(forReading: url) else {
            return try await samplesByAssetReader(from: url, count: count)
        }
        return try samples(from: file, count: count)
    }

    private static func samples(from file: AVAudioFile, count: Int) throws -> [Float] {
        let total = file.length
        let format = file.processingFormat
        guard total > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: chunkFrames) else { return [] }
        let channelCount = Int(format.channelCount)
        var mono = [Float](repeating: 0, count: channelCount > 1 ? Int(chunkFrames) : 0)
        var accumulator = WaveformAccumulator(count: count, totalFrames: total)

        while file.framePosition < total {
            try Task.checkCancellation()
            buffer.frameLength = 0
            try file.read(into: buffer, frameCount: chunkFrames)
            let frames = Int(buffer.frameLength)
            guard frames > 0, let channels = buffer.floatChannelData else { break }
            guard channelCount > 1 else {
                accumulator.append(UnsafeBufferPointer(start: channels[0], count: frames))
                continue
            }
            let pointers = (0..<channelCount).map { UnsafePointer(channels[$0]) }
            mono.withUnsafeMutableBufferPointer { output in
                guard let destination = output.baseAddress else { return }
                WaveformMath.mixToMono(pointers, frames: frames, into: destination)
                accumulator.append(UnsafeBufferPointer(start: destination, count: frames))
            }
        }
        return accumulator.result()
    }

    private static func samplesByAssetReader(from url: URL, count: Int) async throws -> [Float] {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration)
        guard duration.seconds > 0, let track = try await asset.loadTracks(withMediaType: .audio).first else { return [] }

        let reader = try AVAssetReader(asset: asset)
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false,
            AVSampleRateKey: fallbackSampleRate,
            AVNumberOfChannelsKey: 1,
        ])
        reader.add(output)
        reader.startReading()
        defer { if reader.status == .reading { reader.cancelReading() } }

        var accumulator = WaveformAccumulator(count: count, totalFrames: Int64(duration.seconds * fallbackSampleRate))
        while let sampleBuffer = output.copyNextSampleBuffer() {
            try Task.checkCancellation()
            guard let block = CMSampleBufferGetDataBuffer(sampleBuffer) else { continue }
            let floatCount = CMBlockBufferGetDataLength(block) / MemoryLayout<Float>.size
            guard floatCount > 0 else { continue }
            var floats = [Float](repeating: 0, count: floatCount)
            let byteCount = floatCount * MemoryLayout<Float>.size
            let copied = floats.withUnsafeMutableBytes { (raw) -> OSStatus in
                guard let destination = raw.baseAddress else { return -1 }
                return CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: byteCount, destination: destination)
            }
            guard copied == kCMBlockBufferNoErr else { continue }
            accumulator.append(floats)
        }
        return accumulator.result()
    }
}
