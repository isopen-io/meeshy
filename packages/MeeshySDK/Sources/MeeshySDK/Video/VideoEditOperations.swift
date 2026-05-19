import Foundation

/// Pure, non-destructive edit operations.
///
/// Every method returns a *new* document — the caller (`VideoEditSession`)
/// pushes the result onto the undo stack. No method ever throws or mutates
/// shared state, which makes them trivially unit-testable.
extension VideoEditDocument {

    // MARK: - Timeline geometry

    /// Edited-timeline start time of each segment (same count as `segments`).
    public var segmentEditedStarts: [Double] {
        var acc: [Double] = []
        var cursor = 0.0
        for segment in segments {
            acc.append(cursor)
            cursor += segment.playbackDuration
        }
        return acc
    }

    /// Edited-timeline times where two segments meet — used for snapping and
    /// divider rendering. Excludes 0 and the final end.
    public var internalBoundaries: [Double] {
        guard segments.count > 1 else { return [] }
        return Array(segmentEditedStarts.dropFirst())
    }

    /// Maps a *source* time to its position on the edited timeline, or `nil`
    /// if that moment was trimmed away. Used to re-anchor caption segments
    /// (produced against the source file) onto the edited result.
    public func editedTime(forSourceTime sourceTime: Double) -> Double? {
        var cursor = 0.0
        for segment in segments {
            if sourceTime >= segment.start && sourceTime <= segment.end, segment.speed > 0 {
                return cursor + (sourceTime - segment.start) / segment.speed
            }
            cursor += segment.playbackDuration
        }
        return nil
    }

    /// Resolves an edited-timeline time to the segment that contains it and
    /// the equivalent *source* time inside that segment.
    public func locate(editedTime: Double) -> (index: Int, sourceTime: Double)? {
        guard !segments.isEmpty else { return nil }
        let clamped = min(max(0, editedTime), editedDuration)
        var cursor = 0.0
        for (index, segment) in segments.enumerated() {
            let next = cursor + segment.playbackDuration
            if clamped < next || index == segments.count - 1 {
                let localPlayback = min(max(0, clamped - cursor), segment.playbackDuration)
                let sourceTime = segment.start + localPlayback * segment.speed
                return (index, min(segment.end, sourceTime))
            }
            cursor = next
        }
        return (segments.count - 1, segments[segments.count - 1].end)
    }

    // MARK: - Revision

    private func bumped(_ transform: (inout VideoEditDocument) -> Void) -> VideoEditDocument {
        var copy = self
        transform(&copy)
        copy.revision &+= 1
        return copy
    }

    // MARK: - Trim (Simple mode — whole-timeline in / out)

    /// Moves the in-point (source seconds). Resizes the first segment.
    public func settingInPoint(_ sourceTime: Double) -> VideoEditDocument {
        guard let first = segments.first else { return self }
        let maxStart = first.end - VideoEditLimits.minSegmentDuration
        let clamped = min(max(0, sourceTime), max(0, maxStart))
        return bumped { doc in
            doc.segments[0].start = clamped
        }
    }

    /// Moves the out-point (source seconds). Resizes the last segment.
    public func settingOutPoint(_ sourceTime: Double) -> VideoEditDocument {
        guard let last = segments.last else { return self }
        let lastIndex = segments.count - 1
        let minEnd = last.start + VideoEditLimits.minSegmentDuration
        let clamped = max(min(sourceDuration, sourceTime), min(sourceDuration, minEnd))
        return bumped { doc in
            doc.segments[lastIndex].end = clamped
        }
    }

    // MARK: - Split

    /// Splits the segment under `editedTime` into two. No-op if either half
    /// would be shorter than `minSegmentDuration`.
    public func splitting(atEditedTime editedTime: Double) -> VideoEditDocument {
        guard let (index, sourceTime) = locate(editedTime: editedTime) else { return self }
        let segment = segments[index]
        let leadSource = sourceTime - segment.start
        let tailSource = segment.end - sourceTime
        guard leadSource >= VideoEditLimits.minSegmentDuration,
              tailSource >= VideoEditLimits.minSegmentDuration else { return self }
        return bumped { doc in
            let lead = VideoSegment(id: segment.id, start: segment.start, end: sourceTime, speed: segment.speed)
            let tail = VideoSegment(start: sourceTime, end: segment.end, speed: segment.speed)
            doc.segments.replaceSubrange(index...index, with: [lead, tail])
        }
    }

    // MARK: - Segment management

    public func removingSegment(id: UUID) -> VideoEditDocument {
        guard segments.count > 1, segments.contains(where: { $0.id == id }) else { return self }
        return bumped { doc in
            doc.segments.removeAll { $0.id == id }
        }
    }

    public func movingSegment(id: UUID, toIndex target: Int) -> VideoEditDocument {
        guard let from = segments.firstIndex(where: { $0.id == id }) else { return self }
        let bounded = min(max(0, target), segments.count - 1)
        guard bounded != from else { return self }
        return bumped { doc in
            let moved = doc.segments.remove(at: from)
            doc.segments.insert(moved, at: bounded)
        }
    }

    /// Re-merges adjacent segments back into one when they form a contiguous
    /// source range at the same speed (undo of a split without losing media).
    public func mergingSegment(id: UUID) -> VideoEditDocument {
        guard let index = segments.firstIndex(where: { $0.id == id }), index > 0 else { return self }
        let prev = segments[index - 1]
        let current = segments[index]
        guard abs(prev.end - current.start) < 0.001,
              abs(prev.speed - current.speed) < 0.001 else { return self }
        return bumped { doc in
            let merged = VideoSegment(id: prev.id, start: prev.start, end: current.end, speed: prev.speed)
            doc.segments.replaceSubrange((index - 1)...index, with: [merged])
        }
    }

    // MARK: - Speed

    public func settingSpeed(_ speed: Double, forSegment id: UUID) -> VideoEditDocument {
        guard let index = segments.firstIndex(where: { $0.id == id }) else { return self }
        let clamped = min(VideoEditLimits.maxSpeed, max(VideoEditLimits.minSpeed, speed))
        return bumped { doc in
            doc.segments[index].speed = clamped
        }
    }

    /// Applies one speed to the whole timeline (Simple mode).
    public func settingGlobalSpeed(_ speed: Double) -> VideoEditDocument {
        let clamped = min(VideoEditLimits.maxSpeed, max(VideoEditLimits.minSpeed, speed))
        return bumped { doc in
            for index in doc.segments.indices {
                doc.segments[index].speed = clamped
            }
        }
    }

    // MARK: - Geometry

    public func rotatedClockwise() -> VideoEditDocument {
        bumped { doc in
            doc.rotationQuarterTurns = (doc.rotationQuarterTurns + 1) % 4
        }
    }

    public func rotatedCounterClockwise() -> VideoEditDocument {
        bumped { doc in
            doc.rotationQuarterTurns = (doc.rotationQuarterTurns + 3) % 4
        }
    }

    public func settingCrop(_ rect: NormalizedRect) -> VideoEditDocument {
        bumped { doc in
            doc.crop = rect.sanitized
        }
    }

    // MARK: - Look

    public func settingColor(_ color: VideoColorAdjustment) -> VideoEditDocument {
        bumped { doc in
            doc.color = color.sanitized
        }
    }

    public func settingFilter(_ filter: VideoFilterPreset) -> VideoEditDocument {
        bumped { doc in
            doc.filter = filter
        }
    }

    // MARK: - Audio

    public func settingAudio(_ audio: VideoAudioSettings) -> VideoEditDocument {
        bumped { doc in
            doc.audio = audio.sanitized
        }
    }

    public func togglingMute() -> VideoEditDocument {
        bumped { doc in
            doc.audio.isMuted.toggle()
        }
    }

    // MARK: - Captions / transcription

    public func settingCaptions(
        _ captions: [VideoCaption],
        languageCode: String?,
        transcription: String?
    ) -> VideoEditDocument {
        bumped { doc in
            doc.captions = captions.sorted { $0.start < $1.start }
            doc.captionLanguageCode = languageCode
            doc.transcriptionText = transcription
        }
    }

    public func clearingCaptions() -> VideoEditDocument {
        bumped { doc in
            doc.captions = []
            doc.captionLanguageCode = nil
            doc.transcriptionText = nil
        }
    }

    // MARK: - Reset

    public func resettingAllEdits() -> VideoEditDocument {
        bumped { doc in
            doc.segments = [VideoSegment(start: 0, end: doc.sourceDuration)]
            doc.rotationQuarterTurns = 0
            doc.crop = .full
            doc.color = .identity
            doc.filter = .none
            doc.audio = .default
            doc.captions = []
            doc.captionLanguageCode = nil
            doc.transcriptionText = nil
        }
    }
}
