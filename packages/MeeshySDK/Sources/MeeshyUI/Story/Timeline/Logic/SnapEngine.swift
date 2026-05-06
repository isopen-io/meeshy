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
