import CoreGraphics
import Foundation

/// Le journal d'un appel : TOUTES les phrases, rangées à leur heure de capture,
/// sans rien qui fasse tomber les plus anciennes (#17342).
enum CallTranscriptJournal {
    static func inserting(_ segment: CallTranscriptionSegment, into sorted: [CallTranscriptionSegment]) -> [CallTranscriptionSegment] {
        var journal = sorted
        journal.insert(segment, at: insertionIndex(for: segment.capturedAt, in: sorted))
        return journal
    }

    static func insertionIndex(for date: Date, in sorted: [CallTranscriptionSegment]) -> Int {
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
}

/// L'heure d'une phrase DANS l'appel (mm:ss depuis son début, h:mm:ss au-delà) :
/// la même pour la ligne du journal vivant, la ligne de capture et le journal
/// d'après l'appel. Sans début d'appel connu, aucune heure plutôt qu'une heure
/// murale qui ne dirait pas la même chose.
enum CallJournalClock {
    static func label(at date: Date, since start: Date?, locale: Locale = .current) -> String? {
        guard let start else { return nil }
        return CallManager.formatDuration(max(0, date.timeIntervalSince(start)), locale: locale)
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
