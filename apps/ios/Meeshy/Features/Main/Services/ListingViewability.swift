import Foundation
import Combine
import QuartzCore
import SwiftUI
import MeeshySDK
import MeeshyUI
#if canImport(UIKit)
import UIKit
#endif

// MARK: - L'impression VISIBLE d'une carte de listing (#10501)
//
// Chaque listing compte : la carte qui apparaît est une impression, et elle
// part comme telle. La visibilité au sens MRC (≥ 50 % de la carte pendant
// ≥ 1 s continue, 2 s pour une vidéo) la QUALIFIE, elle ne la conditionne
// pas. Une carte porte un `ViewabilityMeter`, nourri par ses changements de
// cadre ; à sa sortie d'écran part `visibility/measured`, reliée à
// l'impression par `impressionEventId`.

/// Une carte dont la visibilité se mesure : l'impression qu'elle a produite,
/// ce qu'elle montre, et où elle est rendue.
struct ListedCell: Equatable {
    let eventId: String
    let target: SocialTarget
    let listing: SocialListing?
    let isVideo: Bool
}

@MainActor
protocol ListingViewabilityTracking: AnyObject {
    func begin(_ cell: ListedCell)
    func note(fraction: Double, of eventId: String)
    /// La mesure EN COURS d'une carte encore à l'écran ; `nil` si elle n'est
    /// pas (ou plus) suivie.
    func visibility(of eventId: String) -> SocialVisibility?
    /// Clôt la mesure, émet `visibility/measured` et rend ce qui a été mesuré.
    @discardableResult func end(_ eventId: String) -> SocialVisibility?
}

/// Les compteurs des cartes à l'écran d'UN listing. Aucune minuterie, aucune
/// propriété publiée : rien ne se redessine pendant le défilement, et un
/// compteur conclut à l'instant où on le lit.
@MainActor
final class ListingViewabilityTracker: ListingViewabilityTracking {
    nonisolated deinit {}

    private struct Tracked {
        let cell: ListedCell
        var meter: ViewabilityMeter
        var fraction = 0.0
    }

    private let surface: SocialSurface?
    private let reporter: @MainActor () -> SocialEventsV2Reporting
    private let clockMs: @MainActor () -> Int
    private let wallClock: @MainActor () -> Date
    private var tracked: [String: Tracked] = [:]
    private var cancellables = Set<AnyCancellable>()

    init(
        surface: SocialSurface?,
        reporter: @escaping @MainActor () -> SocialEventsV2Reporting = { SocialEventsV2Reporter.shared },
        clockMs: @escaping @MainActor () -> Int = { Int(CACurrentMediaTime() * 1_000) },
        wallClock: @escaping @MainActor () -> Date = { Date() },
        observesLifecycle: Bool = true
    ) {
        self.surface = surface
        self.reporter = reporter
        self.clockMs = clockMs
        self.wallClock = wallClock
        if observesLifecycle { subscribeToAppLifecycle() }
    }

    func begin(_ cell: ListedCell) {
        tracked[cell.eventId] = Tracked(cell: cell, meter: ViewabilityMeter(isVideo: cell.isVideo))
    }

    func note(fraction: Double, of eventId: String) {
        guard var entry = tracked[eventId] else { return }
        entry.fraction = fraction
        entry.meter.note(fraction: fraction, atMs: clockMs())
        tracked[eventId] = entry
    }

    func visibility(of eventId: String) -> SocialVisibility? {
        tracked[eventId]?.meter.measure(atMs: clockMs())
    }

    @discardableResult
    func end(_ eventId: String) -> SocialVisibility? {
        guard let entry = tracked.removeValue(forKey: eventId) else { return nil }
        let now = clockMs()
        reporter().emit(SocialEventV2(
            occurredAt: wallClock(),
            target: entry.cell.target,
            surface: surface,
            listing: entry.cell.listing,
            payload: .visibility(entry.meter.measure(atMs: now, impressionEventId: eventId))
        ))
        return entry.meter.measure(atMs: now)
    }

    /// L'app n'est plus au premier plan : plus rien n'est visible. Les cartes
    /// gardent leur dernière part pour la reprise.
    func suspend() {
        let now = clockMs()
        tracked = tracked.mapValues { entry in
            var paused = entry
            paused.meter.note(fraction: 0, atMs: now)
            return paused
        }
    }

    /// Retour au premier plan : chaque carte reprend la part qu'elle avait.
    func resume() {
        let now = clockMs()
        tracked = tracked.mapValues { entry in
            var resumed = entry
            resumed.meter.note(fraction: entry.fraction, atMs: now)
            return resumed
        }
    }

    private func subscribeToAppLifecycle() {
        #if canImport(UIKit)
        NotificationCenter.default.publisher(for: UIApplication.willResignActiveNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.suspend() } }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.resume() } }
            .store(in: &cancellables)
        #endif
    }
}

// MARK: - La carte

/// Ce qu'une carte retient entre son apparition et sa sortie — HORS du rendu :
/// l'écrire ne réévalue aucun `body`.
@MainActor
final class ListedCellProbe {
    nonisolated deinit {}

    var eventId: String?
    var fraction: Double?
}

/// La fenêtre dans laquelle une carte se mesure : celle de l'app, pas l'écran
/// (en Split View l'app n'en tient qu'une part). Le cadre de la carte est lu
/// dans l'espace global ; aucune marge de la fenêtre n'est lue.
enum ListingViewport {
    @MainActor static var screen: CGRect {
        #if canImport(UIKit)
        CGRect(origin: .zero, size: DeviceLayout.windowSize)
        #else
        .zero
        #endif
    }
}

/// Une carte de listing : son apparition est une impression située (rang,
/// page, source), ses changements de cadre nourrissent son compteur de
/// visibilité, sa sortie le clôt. La part visible est relayée par paliers de
/// 5 %, par une transformation non isolée : pendant le défilement, la carte ne
/// se redessine pas.
struct ListedImpressionModifier: ViewModifier {
    let postId: String
    let isVideo: Bool
    let impressions: ReachImpressionRecording
    let position: @MainActor () -> Int?

    @State private var probe = ListedCellProbe()
    /// La fenêtre qui PORTE la carte (Stage Manager, fenêtre détachée) ; `ListingViewport.screen` (la fenêtre clé)
    /// n'est que le repli, avant la première mesure.
    @Environment(\.sceneWindowSize) private var sceneWindowSize

    func body(content: Content) -> some View {
        let viewport = CGRect(origin: .zero, size: SceneWindowSize.resolve(sceneWindowSize, fallback: ListingViewport.screen.size))
        return content
            .onAppear {
                guard !postId.isEmpty else { return }
                probe.eventId = impressions.recordListed(postId, position: position(), isVideo: isVideo)
                guard let eventId = probe.eventId, let fraction = probe.fraction else { return }
                impressions.noteVisible(fraction: fraction, of: eventId)
            }
            .onGeometryChange(for: Double.self) {
                ViewabilityMeter.steppedFraction(of: $0.frame(in: .global), in: viewport)
            } action: { fraction in
                probe.fraction = fraction
                guard let eventId = probe.eventId else { return }
                impressions.noteVisible(fraction: fraction, of: eventId)
            }
            .onDisappear {
                guard let eventId = probe.eventId else { return }
                probe.eventId = nil
                impressions.noteGone(eventId)
            }
    }
}

extension View {
    /// Compte l'impression d'une carte de LISTING à chaque apparition, avec
    /// son rang rendu, et mesure sa visibilité jusqu'à sa sortie d'écran.
    func countsListedImpression(
        of postId: String,
        isVideo: Bool = false,
        in impressions: ReachImpressionRecording,
        position: @escaping @MainActor () -> Int?
    ) -> some View {
        modifier(ListedImpressionModifier(postId: postId, isVideo: isVideo, impressions: impressions, position: position))
    }
}
