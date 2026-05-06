import Foundation

// MARK: - SnapCandidate

/// A candidate point in time that the SnapEngine can snap a raw user time to.
public struct SnapCandidate: Equatable, Sendable {

    /// The semantic kind of a snap candidate. Used to break ties (priority order).
    public enum Kind: Sendable, Equatable {
        case playhead
        case clipStart
        case clipEnd
        case gridMajor
        case gridMinor
        case keyframe
        case slideStart
        case slideEnd
    }

    public let kind: Kind
    public let time: Float
    public let label: String?

    public init(kind: Kind, time: Float, label: String? = nil) {
        self.kind = kind
        self.time = time
        self.label = label
    }
}

// MARK: - SnapResult

/// The output of `SnapEngine.snap`. `matched == nil` means no snap occurred
/// (raw time was returned unchanged).
public struct SnapResult: Equatable, Sendable {
    public let snappedTime: Float
    public let matched: SnapCandidate?

    public init(snappedTime: Float, matched: SnapCandidate?) {
        self.snappedTime = snappedTime
        self.matched = matched
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
    public let toleranceSeconds: Float

    public init(toleranceSeconds: Float) {
        self.toleranceSeconds = max(0, toleranceSeconds)
    }
}

extension SnapEngine {

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
    public func snap(
        rawTime: Float,
        candidates: [SnapCandidate],
        disabled: Bool = false
    ) -> SnapResult {
        if disabled {
            return SnapResult(snappedTime: rawTime, matched: nil)
        }
        return Self.pickBest(rawTime: rawTime, candidates: candidates, tolerance: toleranceSeconds)
    }

    static func pickBest(rawTime: Float, candidates: [SnapCandidate], tolerance: Float) -> SnapResult {
        guard !candidates.isEmpty else {
            return SnapResult(snappedTime: rawTime, matched: nil)
        }
        let inRange = candidates.filter { abs($0.time - rawTime) <= tolerance }
        guard let winner = inRange.first else {
            return SnapResult(snappedTime: rawTime, matched: nil)
        }
        return SnapResult(snappedTime: winner.time, matched: winner)
    }
}
