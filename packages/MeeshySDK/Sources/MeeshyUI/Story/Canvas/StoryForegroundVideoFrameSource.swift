import AVFoundation
import CoreGraphics
import CoreVideo
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
// unchecked: générateurs sous `generators` (Locked) ; `AVAssetImageGenerator` n'est pas Sendable.
public final class StoryForegroundVideoFrameSource: @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    private nonisolated let generators = Locked(uncheckedState: [String: AVAssetImageGenerator]())

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
        decodeOverlayFrames(slide: slide, at: time, trackFrames: [:], tracks: [:])
    }

    /// Une vidéo qui a sa piste dans la composition (#9877) est servie par la
    /// trame que celle-ci a décodée, en séquence — et par rien d'autre : sans
    /// trame, elle est hors de sa fenêtre. Seule une vidéo sans piste (illisible
    /// à la composition) retombe sur le générateur.
    public nonisolated func decodeOverlayFrames(slide: StorySlide, at time: CMTime,
                                                trackFrames: [String: CVPixelBuffer],
                                                tracks: [String: StoryOverlayTrack]) -> [String: CGImage] {
        var frames: [String: CGImage] = [:]
        for media in slide.effects.mediaObjects ?? []
        where media.kind == .video && !media.isBackground {
            let decoded = tracks[media.id].map { track in
                trackFrames[media.id].flatMap { StoryOverlayVideoTracks.frame(from: $0, track: track, media: media) }
            } ?? frame(for: media, at: time)
            if let decoded {
                frames[media.id] = decoded
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
        // Les réglages de la vidéo (#9169), peints par la même chaîne que la
        // composition de lecture : la pièce rendue montre ce que l'aperçu montrait.
        return (try? generator.copyCGImage(at: clipTime, actualTime: nil))
            .map { StoryVideoAdjustmentsProcessor.apply(media, to: $0) }
    }

    nonisolated func generator(for id: String, url: URL) -> AVAssetImageGenerator {
        generators.mutateUnchecked { generators in
            if let existing = generators[id] { return existing }
            let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
            generator.appliesPreferredTrackTransform = true
            generator.requestedTimeToleranceBefore = CMTime(seconds: 0.05, preferredTimescale: 600)
            generator.requestedTimeToleranceAfter = CMTime(seconds: 0.05, preferredTimescale: 600)
            generators[id] = generator
            return generator
        }
    }
}
