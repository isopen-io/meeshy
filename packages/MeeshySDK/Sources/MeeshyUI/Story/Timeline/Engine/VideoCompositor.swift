import Foundation
import AVFoundation
import CoreMedia
import CoreImage
import MeeshySDK

// MARK: - Opacity Ramp

/// Describes a single opacity ramp applied to a layer instruction.
public struct OpacityRamp: Sendable {
    public nonisolated let fromOpacity: Float
    public nonisolated let toOpacity: Float
    public nonisolated let timeRange: CMTimeRange

    public nonisolated init(fromOpacity: Float, toOpacity: Float, timeRange: CMTimeRange) {
        self.fromOpacity = fromOpacity
        self.toOpacity = toOpacity
        self.timeRange = timeRange
    }
}

// MARK: - Layer Instruction Config

/// Carries all parameters needed to configure a single `AVMutableVideoCompositionLayerInstruction`.
/// Pure value — no AVFoundation side effects.
public struct LayerInstructionConfig: Sendable {
    public nonisolated let opacityRamps: [OpacityRamp]
    public nonisolated let usesDissolveFilter: Bool

    public nonisolated init(opacityRamps: [OpacityRamp], usesDissolveFilter: Bool) {
        self.opacityRamps = opacityRamps
        self.usesDissolveFilter = usesDissolveFilter
    }
}

// MARK: - Composition Segment

/// One contiguous time interval of the composition, annotated with which clip IDs are active.
public struct CompositionSegment: Sendable {
    public nonisolated let timeRange: CMTimeRange
    public nonisolated let activeClipIds: [String]

    public nonisolated init(timeRange: CMTimeRange, activeClipIds: [String]) {
        self.timeRange = timeRange
        self.activeClipIds = activeClipIds
    }
}

// MARK: - VideoCompositor

/// Pure logic — takes a `TimelineProject` and returns a fully configured `AVMutableVideoComposition`.
/// Never touches the MainActor, never imports UIKit.
public struct VideoCompositor: Sendable {

    public nonisolated static let defaultFrameDuration = CMTime(value: 1, timescale: 60)

    // MARK: - Public API

    public nonisolated static func makeComposition(
        project: TimelineProject,
        composition: AVMutableComposition,
        renderSize: CGSize = CGSize(width: 1080, height: 1920)
    ) -> AVMutableVideoComposition {
        let videoComposition = AVMutableVideoComposition()
        videoComposition.renderSize = renderSize
        videoComposition.frameDuration = defaultFrameDuration

        let slideDuration = project.slideDuration

        let videoClips = project.mediaObjects.filter {
            $0.kind == .video && $0.isBackground != true
        }

        let segments = computeSegments(clips: videoClips, slideDuration: slideDuration)

        // Build clipId → trackID map by pairing video clips with composition video
        // tracks in insertion order. `StoryTimelineEngine.insertVideoTracks` uses
        // the exact same filter + iteration order as `videoClips` above, so the
        // pairing is deterministic. When the caller hasn't inserted tracks yet
        // (e.g. unit tests that skip asset loading), the map is empty and we emit
        // empty `layerInstructions` arrays — preserving the previous behaviour.
        let trackIDsByClip = makeTrackIDMap(videoClips: videoClips, composition: composition)

        let instructions: [AVVideoCompositionInstructionProtocol] = segments.map { segment in
            let instruction = AVMutableVideoCompositionInstruction()
            instruction.timeRange = segment.timeRange
            instruction.layerInstructions = makeSegmentLayerInstructions(
                segment: segment,
                videoClips: videoClips,
                clipTransitions: project.clipTransitions,
                slideDuration: slideDuration,
                trackIDsByClip: trackIDsByClip
            )
            return instruction
        }

        videoComposition.instructions = instructions

        // Attach compositor based on transition kinds present.
        // Priority: non-built-in kinds → CustomTransitionCompositor (forward compat)
        //           dissolve only      → DissolveVideoCompositor (CIDissolveTransition)
        //           crossfade only     → no custom compositor (native opacity ramp)
        //
        // When a custom compositor is registered, AVFoundation reads the per-track
        // `sourceTrackIDs` from each layer instruction to feed `startRequest`.
        // `makeSegmentLayerInstructions` always emits layer instructions for active
        // clips (when track IDs are known), so the dissolve / custom paths receive
        // the source frames they need. Opacity ramps are still attached — the
        // custom compositor ignores them when it overrides per-pixel blending, but
        // the ramps remain authoritative for the native crossfade path.
        let hasDissolve = project.clipTransitions.contains { $0.kind == .dissolve }
        let usesCustomKind = project.clipTransitions.contains { transition in
            switch transition.kind {
            case .crossfade, .dissolve:
                return false
            @unknown default:
                return true
            }
        }
        if usesCustomKind && CustomTransitionCompositor.isMetalAvailable {
            videoComposition.customVideoCompositorClass = CustomTransitionCompositor.self
        } else if hasDissolve {
            videoComposition.customVideoCompositorClass = DissolveVideoCompositor.self
        }

        return videoComposition
    }

    // MARK: - Segment computation

    public nonisolated static func computeSegments(
        clips: [StoryMediaObject],
        slideDuration: Float
    ) -> [CompositionSegment] {
        let slideDurationD = Double(slideDuration)
        var boundaries = Set<Double>()
        boundaries.insert(0)
        boundaries.insert(slideDurationD)
        for clip in clips {
            let start = clip.startTime ?? 0
            let duration = clip.duration ?? slideDurationD
            boundaries.insert(max(0, start))
            boundaries.insert(min(slideDurationD, start + duration))
        }
        let sorted = boundaries.sorted()
        guard sorted.count >= 2 else {
            let full = CMTimeRange(
                start: .zero,
                duration: CMTime(seconds: slideDurationD, preferredTimescale: 600)
            )
            return [CompositionSegment(timeRange: full, activeClipIds: [])]
        }
        var segments: [CompositionSegment] = []
        for i in 0..<(sorted.count - 1) {
            let from = sorted[i]
            let to = sorted[i + 1]
            guard to > from else { continue }
            let active = clips.compactMap { clip -> String? in
                let s = clip.startTime ?? 0
                let d = clip.duration ?? slideDurationD
                let e = s + d
                return (s <= from + 0.0001 && e >= to - 0.0001) ? clip.id : nil
            }
            let range = CMTimeRange(
                start: CMTime(seconds: from, preferredTimescale: 600),
                duration: CMTime(seconds: to - from, preferredTimescale: 600)
            )
            segments.append(CompositionSegment(timeRange: range, activeClipIds: active))
        }
        return segments
    }

    // MARK: - Layer Instruction Config

    public nonisolated static func layerInstructionConfig(
        timeRange: CMTimeRange,
        fadeIn: Float,
        fadeOut: Float,
        outgoingTransition: StoryClipTransition?,
        incomingTransition: StoryClipTransition?
    ) -> LayerInstructionConfig {
        var ramps: [OpacityRamp] = []
        var usesDissolve = false

        // Fade-in ramp at the leading edge
        if fadeIn > 0 {
            let fadeInRange = CMTimeRange(
                start: timeRange.start,
                duration: makePreciseDuration(seconds: Double(fadeIn))
            )
            ramps.append(OpacityRamp(fromOpacity: 0, toOpacity: 1, timeRange: fadeInRange))
        }

        // Fade-out ramp at the trailing edge
        if fadeOut > 0 {
            let fadeOutDuration = makePreciseDuration(seconds: Double(fadeOut))
            let fadeOutStart = CMTimeSubtract(CMTimeRangeGetEnd(timeRange), fadeOutDuration)
            let fadeOutRange = CMTimeRange(start: fadeOutStart, duration: fadeOutDuration)
            ramps.append(OpacityRamp(fromOpacity: 1, toOpacity: 0, timeRange: fadeOutRange))
        }

        // Outgoing transition (at trailing edge)
        if let out = outgoingTransition {
            switch out.kind {
            case .crossfade:
                let transDuration = makePreciseDuration(seconds: Double(out.duration))
                let transStart = CMTimeSubtract(CMTimeRangeGetEnd(timeRange), transDuration)
                let transRange = CMTimeRange(start: transStart, duration: transDuration)
                ramps.append(OpacityRamp(fromOpacity: 1, toOpacity: 0, timeRange: transRange))
            case .dissolve:
                usesDissolve = true
            }
        }

        // Incoming transition (at leading edge)
        if let inc = incomingTransition {
            switch inc.kind {
            case .crossfade:
                let transDuration = makePreciseDuration(seconds: Double(inc.duration))
                let transRange = CMTimeRange(start: timeRange.start, duration: transDuration)
                ramps.append(OpacityRamp(fromOpacity: 0, toOpacity: 1, timeRange: transRange))
            case .dissolve:
                usesDissolve = true
            }
        }

        return LayerInstructionConfig(opacityRamps: ramps, usesDissolveFilter: usesDissolve)
    }

    // MARK: - Layer Instruction Builder

    public nonisolated static func makeLayerInstruction(
        trackID: CMPersistentTrackID,
        timeRange: CMTimeRange,
        fadeIn: Float,
        fadeOut: Float,
        outgoingTransition: StoryClipTransition?,
        incomingTransition: StoryClipTransition?
    ) -> AVMutableVideoCompositionLayerInstruction {
        let layerInstruction = AVMutableVideoCompositionLayerInstruction()
        layerInstruction.trackID = trackID

        let config = layerInstructionConfig(
            timeRange: timeRange,
            fadeIn: fadeIn,
            fadeOut: fadeOut,
            outgoingTransition: outgoingTransition,
            incomingTransition: incomingTransition
        )
        applyConfig(config, to: layerInstruction)
        return layerInstruction
    }

    // MARK: - Private helpers

    /// Uses a high-precision timescale (600_000) to avoid Float→Double truncation rounding errors
    /// when converting short transition durations (e.g. 0.7s Float → 0.698333s with timescale 600).
    nonisolated private static func makePreciseDuration(seconds: Double) -> CMTime {
        CMTime(seconds: seconds, preferredTimescale: 600_000)
    }

    nonisolated private static func applyConfig(
        _ config: LayerInstructionConfig,
        to instruction: AVMutableVideoCompositionLayerInstruction
    ) {
        for ramp in config.opacityRamps {
            instruction.setOpacityRamp(
                fromStartOpacity: ramp.fromOpacity,
                toEndOpacity: ramp.toOpacity,
                timeRange: ramp.timeRange
            )
        }
    }

    /// Pair the project's video clips with the composition's video tracks by
    /// insertion order. Returns an empty map when the composition has no video
    /// tracks (test contexts that skip asset loading) — callers MUST tolerate
    /// missing entries and fall back to empty `layerInstructions`.
    nonisolated private static func makeTrackIDMap(
        videoClips: [StoryMediaObject],
        composition: AVMutableComposition
    ) -> [String: CMPersistentTrackID] {
        let videoTracks = composition.tracks(withMediaType: .video)
        guard !videoTracks.isEmpty, !videoClips.isEmpty else { return [:] }
        var map: [String: CMPersistentTrackID] = [:]
        let pairCount = min(videoClips.count, videoTracks.count)
        for i in 0..<pairCount {
            map[videoClips[i].id] = videoTracks[i].trackID
        }
        return map
    }

    /// Compute the clip's own time range in composition time, used as the basis
    /// for fadeIn/fadeOut/transition ramp placement. Falls back to a full-slide
    /// range when `startTime` / `duration` are nil (legacy clips).
    nonisolated private static func clipTimeRange(
        clip: StoryMediaObject,
        slideDuration: Float
    ) -> CMTimeRange {
        let start = clip.startTime ?? 0
        let duration = clip.duration ?? Double(slideDuration)
        return CMTimeRange(
            start: CMTime(seconds: max(0, start), preferredTimescale: 600),
            duration: CMTime(seconds: duration, preferredTimescale: 600)
        )
    }

    /// Build the list of `AVMutableVideoCompositionLayerInstruction` to attach
    /// to a single segment's parent instruction. One layer instruction per active
    /// clip whose track ID is known. Each instruction carries:
    /// - `setOpacityRamp` for `fadeIn` / `fadeOut` (per-clip envelope) and
    ///   `.crossfade` transitions (native AVFoundation blending)
    /// - no opacity ramp for `.dissolve` (the custom `DissolveVideoCompositor`
    ///   computes the per-pixel blend itself; ramps would double-up the fade)
    /// - the source `trackID`, required by both native blending AND the custom
    ///   compositors which read `sourceTrackIDs` to fetch source frames
    nonisolated private static func makeSegmentLayerInstructions(
        segment: CompositionSegment,
        videoClips: [StoryMediaObject],
        clipTransitions: [StoryClipTransition],
        slideDuration: Float,
        trackIDsByClip: [String: CMPersistentTrackID]
    ) -> [AVMutableVideoCompositionLayerInstruction] {
        guard !segment.activeClipIds.isEmpty else { return [] }
        let clipsByID = Dictionary(uniqueKeysWithValues: videoClips.map { ($0.id, $0) })
        return segment.activeClipIds.compactMap { clipID -> AVMutableVideoCompositionLayerInstruction? in
            guard let clip = clipsByID[clipID],
                  let trackID = trackIDsByClip[clipID] else { return nil }
            let outgoing = clipTransitions.first { $0.fromClipId == clipID }
            let incoming = clipTransitions.first { $0.toClipId == clipID }
            return makeLayerInstruction(
                trackID: trackID,
                timeRange: clipTimeRange(clip: clip, slideDuration: slideDuration),
                fadeIn: Float(clip.fadeIn ?? 0),
                fadeOut: Float(clip.fadeOut ?? 0),
                outgoingTransition: outgoing,
                incomingTransition: incoming
            )
        }
    }
}
