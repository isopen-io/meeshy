import AVFoundation
import CoreGraphics
import MeeshySDK

/// Decodes still frames from foreground overlay videos for the MP4 exporter.
///
/// The live canvas plays foreground videos through an `AVPlayerLayer`, which
/// `CALayer.render(in:)` cannot capture — so `StoryAVCompositor` pulls one
/// decoded frame per output tick from here and paints it as the media layer's
/// `contents` instead (see `StoryMediaLayer.applyExportFrame`). One
/// `AVAssetImageGenerator` is memoised per media id and reused across the
/// export's frames.
///
/// `appliesPreferredTrackTransform` handles camera-rotated clips, so callers
/// never deal with orientation. A small time tolerance keeps per-frame decoding
/// cheap; overlay motion doesn't need frame-exact seeks.
///
/// Thread-safety: `StoryAVCompositor` calls `frame(for:at:)` from its bridged
/// main-actor `renderFrame`, but the generator map is lock-guarded so the type
/// stays `Sendable` for storage on the (nonisolated) compositor instance.
public final class StoryForegroundVideoFrameSource: @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    private nonisolated let lock = NSLock()
    private nonisolated(unsafe) var generators: [String: AVAssetImageGenerator] = [:]

    public nonisolated init() {}

    /// Decodes the current frame of every FOREGROUND video overlay in `slide` at
    /// slide time `time`, keyed by media id.
    ///
    /// CRITICAL: call this OFF the main thread — e.g. on `StoryAVCompositor`'s
    /// worker queue, BEFORE it bridges into `DispatchQueue.main.sync`. A
    /// synchronous `AVAssetImageGenerator` decode performed on the main thread
    /// while the compositor holds `main.sync` deadlocks against AVFoundation's
    /// own callbacks (observed: the export hangs indefinitely).
    public nonisolated func decodeOverlayFrames(slide: StorySlide, at time: CMTime) -> [String: CGImage] {
        var frames: [String: CGImage] = [:]
        for media in slide.effects.mediaObjects ?? []
        where media.kind == .video && !media.isBackground {
            if let frame = frame(for: media, at: time) {
                frames[media.id] = frame
            }
        }
        return frames
    }

    /// Returns the decoded frame of the foreground video `media` at slide time
    /// `time`, or `nil` when `media` is not a foreground video, is outside its
    /// visibility window, or the frame cannot be decoded. The clip is offset by
    /// `media.startTime` so the exported overlay stays in sync with the slide.
    public nonisolated func frame(for media: StoryMediaObject, at time: CMTime) -> CGImage? {
        guard media.kind == .video, !media.isBackground,
              let urlString = media.mediaURL,
              let url = URL(string: urlString) else { return nil }

        let start = media.startTime ?? 0
        let slideSeconds = time.seconds
        guard slideSeconds >= start else { return nil }
        if let duration = media.duration, slideSeconds > start + duration { return nil }

        let generator = generator(for: media.id, url: url)
        let clipTime = CMTime(seconds: slideSeconds - start, preferredTimescale: 600)
        return try? generator.copyCGImage(at: clipTime, actualTime: nil)
    }

    private nonisolated func generator(for id: String, url: URL) -> AVAssetImageGenerator {
        lock.lock()
        defer { lock.unlock() }
        if let existing = generators[id] { return existing }
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = CMTime(seconds: 0.05, preferredTimescale: 600)
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.05, preferredTimescale: 600)
        generators[id] = generator
        return generator
    }
}
