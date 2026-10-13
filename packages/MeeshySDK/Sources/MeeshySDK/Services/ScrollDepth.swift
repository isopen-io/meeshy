import Foundation

// MARK: - Le défilement, agrégé par passage — jamais par image (#10509)
//
// L'accumulateur est une structure de TAILLE FIXE faite d'entiers : pas de
// tableau qui grandit, pas d'allocation, pas d'écriture, pas de réseau par
// image. Les échantillons sont décimés à ≤ 10 Hz par l'horloge fournie.
// Rien ne part avant la fin du passage (ou d'un segment de 60 s).

public struct ScrollListingSummary: Encodable, Sendable, Equatable {
    public let listingSessionId: String
    public let segment: Int
    public let durationMs: Int
    public let activeScrollMs: Int
    public let itemsRendered: Int
    public let itemsViewable: Int
    public let maxPosition: Int
    public let distancePt: Int
    /// Ms passées dans chaque classe de vitesse : <500, 500–1500, 1500–4000, ≥4000 pt/s.
    public let velocityHistogram: [Int]
    public let directionChanges: Int
    public let upDistanceRatio: Double
    public let flings: Int
    public let stops: Int
    public let refreshes: Int
    public let paginations: Int
    public let reachedEnd: Bool
}

public struct ScrollDepthAccumulator: Sendable, Equatable {
    public static let minSampleIntervalMs = 100
    /// Un écart plus long n'est pas du défilement continu : il est borné.
    static let maxStepMs = 1_000
    static let stopThresholdMs = 1_000
    static let velocityBounds = (500, 1_500, 4_000)

    private var lastSampleMs: Int?
    private var lastOffsetPt: Int?
    private var lastDirection = 0
    private var stillSinceMs: Int?
    private var stopCounted = false
    private var lastBucket = 0

    public private(set) var distancePt = 0
    public private(set) var upDistancePt = 0
    public private(set) var directionChanges = 0
    public private(set) var activeScrollMs = 0
    public private(set) var flings = 0
    public private(set) var stops = 0
    public private(set) var bucket0Ms = 0
    public private(set) var bucket1Ms = 0
    public private(set) var bucket2Ms = 0
    public private(set) var bucket3Ms = 0
    public private(set) var maxPosition = 0
    public private(set) var itemsViewable = 0
    public private(set) var refreshes = 0
    public private(set) var paginations = 0
    public private(set) var reachedEnd = false

    public init() {}

    public var velocityHistogram: [Int] { [bucket0Ms, bucket1Ms, bucket2Ms, bucket3Ms] }

    public var upDistanceRatio: Double {
        guard distancePt > 0 else { return 0 }
        return SocialEventsV2Wire.fraction(Double(upDistancePt) / Double(distancePt))
    }

    /// Un échantillon de position (points logiques). Rend `false` s'il est
    /// décimé — plus proche que 100 ms du précédent.
    @discardableResult
    public mutating func sample(offsetPt: Double, atMs: Int) -> Bool {
        let offset = Int(offsetPt.rounded())
        guard let previousMs = lastSampleMs, let previousOffset = lastOffsetPt else {
            lastSampleMs = atMs
            lastOffsetPt = offset
            stillSinceMs = atMs
            return true
        }
        let elapsed = atMs - previousMs
        guard elapsed >= Self.minSampleIntervalMs else { return false }
        lastSampleMs = atMs
        lastOffsetPt = offset
        let delta = offset - previousOffset
        guard delta != 0 else {
            noteStill(atMs: atMs)
            return true
        }
        let step = min(elapsed, Self.maxStepMs)
        let magnitude = abs(delta)
        distancePt += magnitude
        activeScrollMs += step
        stillSinceMs = atMs
        stopCounted = false
        let direction = delta > 0 ? 1 : -1
        if direction < 0 { upDistancePt += magnitude }
        if lastDirection != 0, direction != lastDirection { directionChanges += 1 }
        lastDirection = direction
        addVelocity(ptPerSecond: magnitude * 1_000 / max(1, elapsed), stepMs: step)
        return true
    }

    private mutating func noteStill(atMs: Int) {
        let since = stillSinceMs ?? atMs
        stillSinceMs = since
        lastBucket = 0
        guard !stopCounted, atMs - since >= Self.stopThresholdMs, distancePt > 0 else { return }
        stops += 1
        stopCounted = true
    }

    private mutating func addVelocity(ptPerSecond: Int, stepMs: Int) {
        let (low, mid, high) = Self.velocityBounds
        let bucket = ptPerSecond < low ? 0 : ptPerSecond < mid ? 1 : ptPerSecond < high ? 2 : 3
        switch bucket {
        case 0: bucket0Ms += stepMs
        case 1: bucket1Ms += stepMs
        case 2: bucket2Ms += stepMs
        default: bucket3Ms += stepMs
        }
        if bucket == 3, lastBucket != 3 { flings += 1 }
        lastBucket = bucket
    }

    public mutating func noteRendered(position: Int) { maxPosition = max(maxPosition, position) }
    public mutating func noteViewable() { itemsViewable += 1 }
    public mutating func noteRefresh() { refreshes += 1 }
    public mutating func notePagination() { paginations += 1 }
    public mutating func noteReachedEnd() { reachedEnd = true }
}

/// Un PASSAGE dans un listing : un `scroll.listing` à la sortie, au passage en
/// arrière-plan, ou en segment toutes les 60 s d'un passage qui dure.
public struct ScrollListingSession: Sendable, Equatable {
    public static let segmentMs = 60_000

    public let listingSessionId: String
    public private(set) var segment = 0
    private var segmentStartMs: Int
    private var accumulator = ScrollDepthAccumulator()
    private var baseline = ScrollDepthAccumulator()

    public init(listingSessionId: String = UUID().uuidString.lowercased(), startedAtMs: Int) {
        self.listingSessionId = listingSessionId
        self.segmentStartMs = startedAtMs
    }

    /// Rend un segment quand le passage dépasse 60 s, sinon `nil`.
    public mutating func sample(offsetPt: Double, atMs: Int) -> ScrollListingSummary? {
        accumulator.sample(offsetPt: offsetPt, atMs: atMs)
        guard atMs - segmentStartMs >= Self.segmentMs else { return nil }
        return closeSegment(atMs: atMs)
    }

    public mutating func noteRendered(position: Int) { accumulator.noteRendered(position: position) }
    public mutating func noteViewable() { accumulator.noteViewable() }
    public mutating func noteRefresh() { accumulator.noteRefresh() }
    public mutating func notePagination() { accumulator.notePagination() }
    public mutating func noteReachedEnd() { accumulator.noteReachedEnd() }

    /// La fin du passage : `nil` si rien ne s'y est passé depuis le dernier segment.
    public mutating func finish(atMs: Int) -> ScrollListingSummary? {
        guard segment == 0 || accumulator != baseline else { return nil }
        return closeSegment(atMs: atMs)
    }

    private mutating func closeSegment(atMs: Int) -> ScrollListingSummary {
        let a = accumulator
        let summary = ScrollListingSummary(
            listingSessionId: listingSessionId,
            segment: segment,
            durationMs: max(0, atMs - segmentStartMs),
            activeScrollMs: a.activeScrollMs,
            itemsRendered: a.maxPosition + 1,
            itemsViewable: a.itemsViewable,
            maxPosition: a.maxPosition,
            distancePt: a.distancePt,
            velocityHistogram: a.velocityHistogram,
            directionChanges: a.directionChanges,
            upDistanceRatio: a.upDistanceRatio,
            flings: a.flings,
            stops: a.stops,
            refreshes: a.refreshes,
            paginations: a.paginations,
            reachedEnd: a.reachedEnd
        )
        segment += 1
        segmentStartMs = atMs
        var next = ScrollDepthAccumulator()
        next.noteRendered(position: a.maxPosition)
        accumulator = next
        baseline = next
        return summary
    }
}

// MARK: - Le défilement À L'INTÉRIEUR d'un contenu

public struct ScrollContentSummary: Encodable, Sendable, Equatable {
    public enum ContentKind: String, Encodable, Sendable, CaseIterable {
        case carousel
        case longText = "long_text"
        case comments
        case storySlides = "story_slides"
        case thread
    }

    public let contentKind: ContentKind
    public let itemsTotal: Int
    public let maxIndexReached: Int
    public let swipes: Int
    public let maxScrollFraction: Double
    public let readThroughFraction: Double
    public let durationMs: Int
}

/// Un contenu ouvert : carrousel (index), texte long ou commentaires (fraction).
public struct ScrollContentAccumulator: Sendable, Equatable {
    public let contentKind: ScrollContentSummary.ContentKind
    public let itemsTotal: Int?
    private let startedAtMs: Int
    private var maxIndex: Int?
    private var swipes = 0
    private var maxFraction: Double?
    private var readThrough: Double?

    public init(contentKind: ScrollContentSummary.ContentKind, itemsTotal: Int? = nil, startedAtMs: Int) {
        self.contentKind = contentKind
        self.itemsTotal = itemsTotal
        self.startedAtMs = startedAtMs
    }

    public mutating func noteIndex(_ index: Int) {
        let previous = maxIndex
        maxIndex = max(previous ?? 0, index)
        if previous != nil || index > 0 { swipes += 1 }
    }

    public mutating func noteScroll(fraction: Double, readThrough: Double? = nil) {
        maxFraction = max(maxFraction ?? 0, SocialEventsV2Wire.fraction(fraction))
        if let readThrough {
            self.readThrough = max(self.readThrough ?? 0, SocialEventsV2Wire.fraction(readThrough))
        }
    }

    /// `nil` quand le lecteur n'a pas bougé : un contenu non parcouru ne dit rien.
    public func finish(atMs: Int) -> ScrollContentSummary? {
        guard maxIndex != nil || maxFraction != nil else { return nil }
        return ScrollContentSummary(
            contentKind: contentKind,
            itemsTotal: itemsTotal ?? 0,
            maxIndexReached: maxIndex ?? 0,
            swipes: swipes,
            maxScrollFraction: maxFraction ?? 0,
            readThroughFraction: readThrough ?? maxFraction ?? 0,
            durationMs: max(0, atMs - startedAtMs)
        )
    }
}
