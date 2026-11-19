import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La carte des visiteurs et « Modifier » (planche `Lien-Detail`, #19499)

extension TrackingLinkDetailView {

    static let mapHeight: CGFloat = 240

    /// La carte des visiteurs : un fond de carte, une bulle K50 chiffrée par zone, « N pays · 30 j » et « Agrandir ».
    /// Le serveur qui ne la sert pas encore (antérieur à #19412) la laisse absente : la section ne s'affiche pas.
    @ViewBuilder
    var visitorMapSection: some View {
        if let map = viewModel.visitorMap {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: TrackingDetailCopy.mapTitle, size: .sheet)
                if map.isLocating {
                    MeeshySkeleton(shape: .card(aspect: 1.6, radius: Double(MeeshyRadius.xxl)))
                } else if map.zones.isEmpty {
                    emptyBlock
                } else {
                    inlineMap(map)
                }
            }
            .accessibilityIdentifier("tracking.detail.map")
        }
    }

    private func inlineMap(_ map: TrackingVisitorMapState) -> some View {
        TrackingVisitorMapView(zones: map.zones, isInteractive: false)
            .frame(height: Self.mapHeight)
            .clipShape(MeeshyRadius.card(MeeshyRadius.xxl))
            .overlay(alignment: .bottomLeading) { countriesBadge(map).padding(MeeshySpacing.md) }
            .overlay(alignment: .bottomTrailing) {
                MeeshyButton(TrackingDetailCopy.enlargeMap, systemImage: "arrow.up.left.and.arrow.down.right",
                             kind: .glass, size: .s44, action: { isMapEnlarged = true })
                    .padding(MeeshySpacing.md)
                    .accessibilityIdentifier("tracking.detail.map.enlarge")
            }
    }

    func countriesBadge(_ map: TrackingVisitorMapState) -> some View {
        MeeshyBadge(.label(TrackingDetailCopy.mapWindow(countries: map.countryCount,
                                                         days: TrackingVisitorMapLayout.windowDays)),
                    leading: .systemImage("flag"), surface: .glass, size: .s28)
    }

    /// La carte plein écran : la même, que l'on peut déplacer et zoomer ; les bulles suivent la carte.
    var enlargedMap: some View {
        let map = viewModel.visitorMap ?? TrackingVisitorMapState(countryCount: 0, zones: [], isLocating: false)
        return TrackingVisitorMapView(zones: map.zones, isInteractive: true)
            .ignoresSafeArea()
            .overlay(alignment: .topLeading) {
                MeeshyGlassButton(systemImage: "xmark", label: ProfileLinksCopy.close, size: .s44,
                                  action: { isMapEnlarged = false })
                    .padding(MeeshySpacing.lg)
            }
            .overlay(alignment: .bottomLeading) { countriesBadge(map).padding(MeeshySpacing.lg) }
    }

    // MARK: - Modifier

    /// La feuille se ferme dès « Enregistrer » : l'écran montre déjà les changements, le serveur confirme ensuite,
    /// et l'écran revient s'il refuse.
    var editSheet: some View {
        let snapshot = current
        return TrackingLinkEditSheet(link: snapshot, onSave: { changes in
            isEditing = false
            Task { Self.announce(await viewModel.save(changes, from: snapshot)) }
        }, onClose: { isEditing = false })
    }

    static func announce(_ outcome: TrackingLinkSaveOutcome) {
        switch outcome {
        case .saved:
            HapticFeedback.success()
            FeedbackToastManager.shared.showSuccess(ShareLinkDetailCopy.saved)
        case .partlyRetained:
            FeedbackToastManager.shared.showNotice(TrackingDetailCopy.notRetained)
        case .refused:
            HapticFeedback.error()
            FeedbackToastManager.shared.showError(ShareLinkDetailCopy.saveFailed)
        }
    }
}

/// Le fond de carte nu (`LocationMapCanvas`) et, au-dessus, les bulles K50 posées par sa projection. Lecture seule
/// dans la page ; déplaçable en plein écran.
struct TrackingVisitorMapView: View {
    let zones: [TrackingVisitorZone]
    let isInteractive: Bool

    @State private var viewport: LocationMapViewport?
    @State private var focus: LocationMapFocus?

    var body: some View {
        ZStack {
            LocationMapCanvas(focus: focus, onViewport: { viewport = $0 })
                .allowsHitTesting(isInteractive)
                .accessibilityHidden(true)
            if let viewport {
                MeeshyChart(kind: .bubbles, points: TrackingVisitorMapLayout.points(zones, in: viewport),
                            summary: TrackingDetailCopy.mapSummary(zones.count), tint: MeeshyColors.trackingAccent,
                            size: .large, markers: [], animatesEntry: false)
                    .allowsHitTesting(false)
            }
        }
        .onAppear { refocus() }
        .adaptiveOnChange(of: zones) { _, _ in refocus() }
    }

    private func refocus() {
        guard let region = TrackingVisitorMapLayout.region(zones) else { return }
        focus = LocationMapFocus(region: region, token: (focus?.token ?? 0) + 1, animated: false)
    }
}
