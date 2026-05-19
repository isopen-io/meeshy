import Foundation
// `@preconcurrency` suppresses Sendable diagnostics from the not-yet-audited
// AVFoundation module — consistent with `WaveformCache` in this directory.
@preconcurrency import AVFoundation

// MARK: - Audio Edit Error

public enum AudioEditError: LocalizedError, Equatable, Sendable {
    case sourceUnreadable
    case noAudioTrack
    case compositionFailed
    case resultTooShort
    case exportSessionUnavailable
    case exportFailed(String)
    case cancelled

    public var errorDescription: String? {
        switch self {
        case .sourceUnreadable:
            return "The audio file could not be read."
        case .noAudioTrack:
            return "The file contains no audio track."
        case .compositionFailed:
            return "The edit could not be assembled."
        case .resultTooShort:
            return "The result would be too short to keep."
        case .exportSessionUnavailable:
            return "Audio export is unavailable on this device."
        case .exportFailed(let reason):
            return "Audio export failed: \(reason)"
        case .cancelled:
            return "The edit was cancelled."
        }
    }
}

// MARK: - Audio Edit Engine

/// Renders `AudioEditOperation`s into concrete audio files using AVFoundation.
///
/// The engine is pure and stateless: every call takes a source URL and writes
/// a new file into a caller-owned directory — the source is never mutated, so
/// editing stays non-destructive. All work runs off the main actor and honours
/// `Task` cancellation, so callers can abort a long export safely.
public enum AudioEditEngine {

    /// Applies a single operation to `source` and returns the URL of the
    /// rendered result inside `directory`.
    ///
    /// - Throws: `AudioEditError` for audio/export failures, or
    ///   `CancellationError` if the surrounding task is cancelled.
    public static func apply(_ operation: AudioEditOperation,
                             to source: URL,
                             sourceDuration: TimeInterval,
                             into directory: URL) async throws -> URL {
        let plan = try renderPlan(for: operation, sourceDuration: sourceDuration)
        return try await render(source: source, plan: plan, into: directory)
    }

    // MARK: - Render Plan

    /// A normalized, engine-ready description of an edit: which slices of the
    /// source to keep, plus the time/volume transforms to apply.
    struct RenderPlan: Equatable {
        var keptRanges: [CMTimeRange]
        var speed: Double
        var gain: Float
        var fadeIn: Bool
        var fadeOut: Bool
    }

    /// Lowers an `AudioEditOperation` into a `RenderPlan`, clamping every
    /// parameter to a safe range so a malformed operation can never crash the
    /// AVFoundation pipeline.
    static func renderPlan(for operation: AudioEditOperation,
                           sourceDuration: TimeInterval) throws -> RenderPlan {
        let duration = max(0, sourceDuration)
        let fullRange = CMTimeRange(start: .zero, end: cmTime(duration, max: duration))

        switch operation {
        case .original:
            return RenderPlan(keptRanges: [fullRange], speed: 1, gain: 1,
                              fadeIn: false, fadeOut: false)

        case .trim(let start, let end):
            let lo = max(0, min(start, end))
            let hi = min(duration, max(start, end))
            guard hi - lo > 0.1 else { throw AudioEditError.resultTooShort }
            let range = CMTimeRange(start: cmTime(lo, max: duration),
                                    end: cmTime(hi, max: duration))
            return RenderPlan(keptRanges: [range], speed: 1, gain: 1,
                              fadeIn: false, fadeOut: false)

        case .removeRange(let start, let end):
            let lo = max(0, min(start, end))
            let hi = min(duration, max(start, end))
            var ranges: [CMTimeRange] = []
            if lo > 0.1 {
                ranges.append(CMTimeRange(start: .zero, end: cmTime(lo, max: duration)))
            }
            if duration - hi > 0.1 {
                ranges.append(CMTimeRange(start: cmTime(hi, max: duration),
                                          end: cmTime(duration, max: duration)))
            }
            guard !ranges.isEmpty else { throw AudioEditError.resultTooShort }
            return RenderPlan(keptRanges: ranges, speed: 1, gain: 1,
                              fadeIn: false, fadeOut: false)

        case .fade(let fadeIn, let fadeOut):
            return RenderPlan(keptRanges: [fullRange], speed: 1, gain: 1,
                              fadeIn: fadeIn, fadeOut: fadeOut)

        case .speed(let rate):
            let clamped = min(3.0, max(0.25, rate))
            return RenderPlan(keptRanges: [fullRange], speed: clamped, gain: 1,
                              fadeIn: false, fadeOut: false)

        case .gain(let multiplier):
            let clamped = Float(min(4.0, max(0.0, multiplier)))
            return RenderPlan(keptRanges: [fullRange], speed: 1, gain: clamped,
                              fadeIn: false, fadeOut: false)
        }
    }

    private static func cmTime(_ seconds: TimeInterval, max upper: TimeInterval) -> CMTime {
        CMTime(seconds: Swift.max(0, Swift.min(upper, seconds)), preferredTimescale: 600)
    }

    // MARK: - Render

    private static func render(source: URL,
                               plan: RenderPlan,
                               into directory: URL) async throws -> URL {
        try Task.checkCancellation()

        let asset = AVURLAsset(url: source)
        let audioTracks: [AVAssetTrack]
        do {
            audioTracks = try await asset.loadTracks(withMediaType: .audio)
        } catch {
            throw AudioEditError.sourceUnreadable
        }
        guard let sourceTrack = audioTracks.first else {
            throw AudioEditError.noAudioTrack
        }

        let composition = AVMutableComposition()
        guard let compositionTrack = composition.addMutableTrack(
            withMediaType: .audio,
            preferredTrackID: kCMPersistentTrackID_Invalid
        ) else {
            throw AudioEditError.compositionFailed
        }

        var cursor = CMTime.zero
        for range in plan.keptRanges where range.duration.seconds > 0.01 {
            do {
                try compositionTrack.insertTimeRange(range, of: sourceTrack, at: cursor)
            } catch {
                throw AudioEditError.compositionFailed
            }
            cursor = cursor + range.duration
        }
        guard cursor.seconds > 0.1 else { throw AudioEditError.resultTooShort }

        let speedChanged = abs(plan.speed - 1.0) > 0.001
        if speedChanged {
            let scaledDuration = CMTime(seconds: cursor.seconds / plan.speed,
                                        preferredTimescale: 600)
            compositionTrack.scaleTimeRange(
                CMTimeRange(start: .zero, duration: cursor),
                toDuration: scaledDuration
            )
        }

        let finalDuration = composition.duration

        let parameters = AVMutableAudioMixInputParameters(track: compositionTrack)
        let baseVolume = plan.gain
        parameters.setVolume(baseVolume, at: .zero)

        let fadeSeconds = min(1.2, max(0.2, finalDuration.seconds / 3.0))
        let fade = CMTime(seconds: fadeSeconds, preferredTimescale: 600)
        if plan.fadeIn {
            parameters.setVolumeRamp(fromStartVolume: 0,
                                     toEndVolume: baseVolume,
                                     timeRange: CMTimeRange(start: .zero, duration: fade))
        }
        if plan.fadeOut, finalDuration.seconds > fadeSeconds {
            parameters.setVolumeRamp(fromStartVolume: baseVolume,
                                     toEndVolume: 0,
                                     timeRange: CMTimeRange(start: finalDuration - fade,
                                                            duration: fade))
        }
        let audioMix = AVMutableAudioMix()
        audioMix.inputParameters = [parameters]

        guard let exportSession = AVAssetExportSession(
            asset: composition,
            presetName: AVAssetExportPresetAppleM4A
        ) else {
            throw AudioEditError.exportSessionUnavailable
        }

        let output = directory.appendingPathComponent("v_\(UUID().uuidString).m4a")
        try? FileManager.default.removeItem(at: output)
        exportSession.outputURL = output
        exportSession.outputFileType = .m4a
        exportSession.audioMix = audioMix
        if speedChanged {
            exportSession.audioTimePitchAlgorithm = .spectral
        }

        try Task.checkCancellation()
        await exportSession.export()

        switch exportSession.status {
        case .completed:
            return output
        case .cancelled:
            try? FileManager.default.removeItem(at: output)
            throw CancellationError()
        default:
            try? FileManager.default.removeItem(at: output)
            throw AudioEditError.exportFailed(
                exportSession.error?.localizedDescription ?? "Unknown export error"
            )
        }
    }
}
