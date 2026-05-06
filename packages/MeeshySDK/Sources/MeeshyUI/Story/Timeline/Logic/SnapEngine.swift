import Foundation

// MARK: - SnapCandidate

/// A candidate point in time that the SnapEngine can snap a raw user time to.
public struct SnapCandidate: Sendable {

    /// The semantic kind of a snap candidate. Used to break ties (priority order).
    public enum Kind: Sendable {
        case playhead
        case clipStart
        case clipEnd
        case gridMajor
        case gridMinor
        case keyframe
        case slideStart
        case slideEnd
    }

    public nonisolated let kind: Kind
    public nonisolated let time: Float
    public nonisolated let label: String?

    public nonisolated init(kind: Kind, time: Float, label: String? = nil) {
        self.kind = kind
        self.time = time
        self.label = label
    }
}

extension SnapCandidate: Equatable {
    public nonisolated static func == (lhs: SnapCandidate, rhs: SnapCandidate) -> Bool {
        lhs.kind == rhs.kind && lhs.time == rhs.time && lhs.label == rhs.label
    }
}

extension SnapCandidate.Kind: Equatable {
    public nonisolated static func == (lhs: SnapCandidate.Kind, rhs: SnapCandidate.Kind) -> Bool {
        switch (lhs, rhs) {
        case (.playhead, .playhead),
             (.clipStart, .clipStart),
             (.clipEnd, .clipEnd),
             (.gridMajor, .gridMajor),
             (.gridMinor, .gridMinor),
             (.keyframe, .keyframe),
             (.slideStart, .slideStart),
             (.slideEnd, .slideEnd):
            return true
        default:
            return false
        }
    }
}

// MARK: - SnapResult

/// The output of `SnapEngine.snap`. `matched == nil` means no snap occurred
/// (raw time was returned unchanged).
public struct SnapResult: Sendable {
    public nonisolated let snappedTime: Float
    public nonisolated let matched: SnapCandidate?

    public nonisolated init(snappedTime: Float, matched: SnapCandidate?) {
        self.snappedTime = snappedTime
        self.matched = matched
    }
}

extension SnapResult: Equatable {
    public nonisolated static func == (lhs: SnapResult, rhs: SnapResult) -> Bool {
        lhs.snappedTime == rhs.snappedTime && lhs.matched == rhs.matched
    }
}

// MARK: - SnapEngine

/// Pure value-type snap engine. Picks the best snap candidate within tolerance,
/// using priority hierarchy to break ties.
///
/// This type is `Sendable` and contains no mutable state.
public struct SnapEngine: Sendable {

    /// Tolerance in seconds. A candidate is eligible if `|candidate.time - rawTime| <= tolerance`.
    /// Clamped to 0 if a negative value is provided.
    public nonisolated let toleranceSeconds: Float

    public nonisolated init(toleranceSeconds: Float) {
        self.toleranceSeconds = max(0, toleranceSeconds)
    }
}

extension SnapEngine {

    private nonisolated static let kDistanceEpsilon: Float = 1e-6

    /// Higher value = higher priority (wins tie-break at equal distance).
    /// Order matches spec section 4.1 priority hierarchy.
    nonisolated static func priority(for kind: SnapCandidate.Kind) -> Int {
        switch kind {
        case .playhead:                return 70
        case .clipStart, .clipEnd:     return 60
        case .keyframe:                return 50
        case .gridMajor:               return 40
        case .gridMinor:               return 30
        case .slideStart, .slideEnd:   return 20
        }
    }

    /// Returns the snapped time and matching candidate (if any).
    ///
    /// - Parameters:
    ///   - rawTime: The raw user-input time (e.g. from a drag gesture).
    ///   - candidates: All snap candidates to consider for the current frame.
    ///   - disabled: If `true` (e.g. user is doing a 2-finger override drag),
    ///               returns `rawTime` unchanged with `matched: nil`.
    /// - Returns: A `SnapResult` with `snappedTime` (= candidate.time when matched)
    ///            and `matched` (the winning candidate or nil).
    ///
    /// - Complexity: O(n) over `candidates`. Safe to call at 60 fps.
    public nonisolated func snap(
        rawTime: Float,
        candidates: [SnapCandidate],
        disabled: Bool = false
    ) -> SnapResult {
        if disabled {
            return SnapResult(snappedTime: rawTime, matched: nil)
        }
        return Self.pickBest(rawTime: rawTime, candidates: candidates, tolerance: toleranceSeconds)
    }

    nonisolated static func pickBest(rawTime: Float, candidates: [SnapCandidate], tolerance: Float) -> SnapResult {
        guard !candidates.isEmpty else {
            return SnapResult(snappedTime: rawTime, matched: nil)
        }
        var best: (candidate: SnapCandidate, distance: Float, priority: Int)?
        for c in candidates {
            let d = abs(c.time - rawTime)
            if d > tolerance { continue }
            let p = priority(for: c.kind)
            if let cur = best {
                let isCloser = d < cur.distance - Self.kDistanceEpsilon
                let isTieAndHigherPriority = abs(d - cur.distance) <= Self.kDistanceEpsilon && p > cur.priority
                if isCloser || isTieAndHigherPriority {
                    best = (c, d, p)
                }
            } else {
                best = (c, d, p)
            }
        }
        guard let winner = best?.candidate else {
            return SnapResult(snappedTime: rawTime, matched: nil)
        }
        return SnapResult(snappedTime: winner.time, matched: winner)
    }
}
