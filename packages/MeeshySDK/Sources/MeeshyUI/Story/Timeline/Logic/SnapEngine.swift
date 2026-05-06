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
