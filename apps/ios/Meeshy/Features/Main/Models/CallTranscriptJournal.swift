import CoreGraphics
import Foundation

enum CallTranscriptJournal {
    static let ceiling = 10_000

    static func inserting(_ segment: TranscriptionSegment, into sorted: [TranscriptionSegment]) -> [TranscriptionSegment] {
        let index = insertionIndex(for: segment.capturedAt, in: sorted)
        return Array(sorted[..<index]) + [segment] + Array(sorted[index...])
    }

    static func insertionIndex(for date: Date, in sorted: [TranscriptionSegment]) -> Int {
        var low = 0
        var high = sorted.count
        while low < high {
            let middle = (low + high) / 2
            if sorted[middle].capturedAt <= date {
                low = middle + 1
            } else {
                high = middle
            }
        }
        return low
    }

    static func bounded(_ sorted: [TranscriptionSegment]) -> [TranscriptionSegment] {
        sorted.count > ceiling ? Array(sorted.suffix(ceiling)) : sorted
    }
}

nonisolated struct CallJournalScrollMetrics: Equatable, Sendable {
    let offset: CGFloat
    let contentHeight: CGFloat
    let viewportHeight: CGFloat

    var distanceFromBottom: CGFloat {
        contentHeight - offset - viewportHeight
    }
}

struct CallJournalFollow: Equatable, Sendable {
    let isFollowing: Bool
    let hasUnseen: Bool

    static let live = CallJournalFollow(isFollowing: true, hasUnseen: false)
    static let liveEdgeTolerance: CGFloat = 32

    var showsReturnToLive: Bool { !isFollowing }

    func scrolled(from previous: CallJournalScrollMetrics?, to current: CallJournalScrollMetrics) -> CallJournalFollow {
        if current.distanceFromBottom <= Self.liveEdgeTolerance { return .live }
        guard let previous, current.offset < previous.offset - 0.5 else { return self }
        return CallJournalFollow(isFollowing: false, hasUnseen: hasUnseen)
    }

    func lineArrived() -> CallJournalFollow {
        isFollowing ? self : CallJournalFollow(isFollowing: false, hasUnseen: true)
    }
}
