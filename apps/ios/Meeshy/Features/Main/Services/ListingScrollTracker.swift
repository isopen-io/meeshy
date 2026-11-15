import Foundation
import Combine
import QuartzCore
import MeeshySDK
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Le défilement d'un listing, un résumé par passage (#10509)

/// Nourri par l'offset que la surface relaie DÉJÀ (aucun observateur de plus),
/// décimé à 10 Hz par `ScrollDepthAccumulator`. Aucune propriété publiée :
/// rien ne se redessine pendant le défilement. Rien ne part avant la fin du
/// passage — passage en arrière-plan, 30 s sans défilement suivies d'une
/// reprise, ou `finish()` explicite — sauf un segment toutes les 60 s.
@MainActor
final class ListingScrollTracker {
    nonisolated deinit {}

    /// Le fil (iPhone et iPad relaient tous deux leur offset).
    static let feed = ListingScrollTracker(surface: SocialSurface(.feed))

    /// Au-delà, une reprise du défilement ouvre un NOUVEAU passage.
    static let idleGapMs = 30_000

    let surface: SocialSurface
    private let reporter: @MainActor () -> SocialEventsV2Reporting
    private let clockMs: @MainActor () -> Int
    private let wallClock: @MainActor () -> Date
    private var session: ScrollListingSession?
    private var lastSampleMs: Int?
    private var cancellables = Set<AnyCancellable>()

    init(
        surface: SocialSurface,
        reporter: @escaping @MainActor () -> SocialEventsV2Reporting = { SocialEventsV2Reporter.shared },
        clockMs: @escaping @MainActor () -> Int = { Int(CACurrentMediaTime() * 1_000) },
        wallClock: @escaping @MainActor () -> Date = { Date() },
        observesBackground: Bool = true
    ) {
        self.surface = surface
        self.reporter = reporter
        self.clockMs = clockMs
        self.wallClock = wallClock
        #if canImport(UIKit)
        if observesBackground {
            NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
                .receive(on: DispatchQueue.main)
                .sink { [weak self] _ in
                    MainActor.assumeIsolated { self?.finish() }
                }
                .store(in: &cancellables)
        }
        #endif
    }

    /// L'offset VERTICAL du contenu (positif vers le bas), à chaque image.
    func noteOffset(_ contentOffsetY: CGFloat) {
        let now = clockMs()
        if let last = lastSampleMs, now - last > Self.idleGapMs { finish() }
        lastSampleMs = now
        if session == nil { session = ScrollListingSession(startedAtMs: now) }
        guard let segment = session?.sample(offsetPt: Double(contentOffsetY), atMs: now) else { return }
        emit(segment)
    }

    func noteRendered(position: Int) { session?.noteRendered(position: position) }
    func noteViewable() { session?.noteViewable() }
    func noteRefresh() { session?.noteRefresh() }
    func notePagination() { session?.notePagination() }
    func noteReachedEnd() { session?.noteReachedEnd() }

    func finish() {
        guard var current = session else { return }
        session = nil
        lastSampleMs = nil
        guard let summary = current.finish(atMs: clockMs()) else { return }
        emit(summary)
    }

    private func emit(_ summary: ScrollListingSummary) {
        reporter().emit(SocialEventV2(
            occurredAt: wallClock(),
            target: nil,
            surface: surface,
            listing: SocialListing(listingSessionId: summary.listingSessionId),
            payload: .scrollListing(summary)
        ))
    }
}

// MARK: - Le défilement À L'INTÉRIEUR d'un contenu

/// Un carrousel, un texte long, des commentaires : un `scroll.content` par
/// contenu et par ouverture, émis à la fermeture.
@MainActor
final class ContentScrollTracker {
    nonisolated deinit {}

    private let target: SocialTarget
    private let surface: SocialSurface?
    private let reporter: @MainActor () -> SocialEventsV2Reporting
    private let clockMs: @MainActor () -> Int
    private var accumulator: ScrollContentAccumulator

    init(
        target: SocialTarget,
        contentKind: ScrollContentSummary.ContentKind,
        itemsTotal: Int? = nil,
        surface: SocialSurface? = nil,
        reporter: @escaping @MainActor () -> SocialEventsV2Reporting = { SocialEventsV2Reporter.shared },
        clockMs: @escaping @MainActor () -> Int = { Int(CACurrentMediaTime() * 1_000) }
    ) {
        self.target = target
        self.surface = surface
        self.reporter = reporter
        self.clockMs = clockMs
        self.accumulator = ScrollContentAccumulator(contentKind: contentKind, itemsTotal: itemsTotal, startedAtMs: clockMs())
    }

    func noteIndex(_ index: Int) { accumulator.noteIndex(index) }
    func noteScroll(fraction: Double, readThrough: Double? = nil) { accumulator.noteScroll(fraction: fraction, readThrough: readThrough) }

    /// Rien ne part si le lecteur n'a pas bougé.
    func finish() {
        guard let summary = accumulator.finish(atMs: clockMs()) else { return }
        accumulator = ScrollContentAccumulator(contentKind: summary.contentKind, itemsTotal: summary.itemsTotal, startedAtMs: clockMs())
        reporter().emit(SocialEventV2(target: target, surface: surface, payload: .scrollContent(summary)))
    }
}
