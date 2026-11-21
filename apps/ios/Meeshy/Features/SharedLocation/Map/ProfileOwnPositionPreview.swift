import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que « Ma position » montre avant tout toucher (#20199, #20242) : la carte de ma position quand elle PART et que
/// l'appareil en connaît une, jamais une carte vide. La position est la DERNIÈRE que l'appareil connaît, quel que soit
/// son âge, avec son heure (aucune attente, aucune demande de permission) ; un relevé silencieux la rafraîchit ensuite.
/// Sinon la rangée dit l'état, comme avant.
enum ProfileOwnPositionPreview: Equatable {
    case map(SharedLocationFix, at: Date?)
    case note

    static func resolve(recipients: Int, isGhost: Bool, fix: SharedLocationFix?, at instant: Date?) -> ProfileOwnPositionPreview {
        guard recipients > 0, !isGhost, let fix else { return .note }
        return .map(fix, at: instant)
    }
}

/// Ma dernière position connue et son instant : le cache de l'appareil tout de suite, puis — quand ma position part et
/// que la permission est DÉJÀ accordée — un relevé silencieux si le cache manque ou date de plus de dix minutes.
@MainActor
final class OwnLastPositionReader: ObservableObject {
    @Published private(set) var known: (fix: SharedLocationFix, at: Date)?

    private static let refreshAfter: TimeInterval = 10 * 60

    nonisolated deinit {}

    init() {
        known = LocationMapOwnPosition.lastKnownAnyAge()
    }

    func refresh(sharing: Bool, now: Date = Date()) async {
        known = LocationMapOwnPosition.lastKnownAnyAge() ?? known
        guard sharing, LocationMapOwnPosition.isAuthorized else { return }
        if let known, now.timeIntervalSince(known.at) < Self.refreshAfter { return }
        let source = SharedLocationFixSource()
        guard let fix = await source.silentFix() else { return }
        known = (fix, Date())
    }
}

/// L'aperçu de carte de ma position : le fond de carte nu et mon épingle, sans geste sur la carte elle-même — le toucher
/// ouvre la carte de mes proches.
struct ProfileOwnPositionMiniature: View {
    let fix: SharedLocationFix
    let share: LocationMapOwnShare
    var height: CGFloat = 132
    let onTap: () -> Void

    @State private var viewport: LocationMapViewport?

    var body: some View {
        let spot: LocationMapSpot = (latitude: fix.latitude, longitude: fix.longitude, radiusMeters: max(fix.accuracy ?? 0, 150))
        let focus = LocationMapRegion.fitting([spot], margin: 2.6).map {
            LocationMapFocus(region: $0, token: Self.token(of: fix), animated: false)
        }
        return ZStack {
            LocationMapCanvas(focus: focus, onViewport: { viewport = $0 })
            LocationMapPinsLayer(viewport: viewport, pins: [], me: fix, meShare: share)
        }
        .allowsHitTesting(false)
        .frame(height: height)
        .clipped()
        .overlay { Color.clear.contentShape(Rectangle()).onTapGesture(perform: onTap) }
        .accessibilityHidden(true)
    }

    static func token(of fix: SharedLocationFix) -> Int {
        var hasher = Hasher()
        hasher.combine((fix.latitude * 10_000).rounded())
        hasher.combine((fix.longitude * 10_000).rounded())
        return hasher.finalize()
    }
}
