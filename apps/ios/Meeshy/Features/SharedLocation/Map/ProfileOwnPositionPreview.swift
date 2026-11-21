import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce que « Ma position » montre avant tout toucher (#20199) : la carte de ma position quand elle PART et que l'appareil
/// la connaît déjà, jamais une carte vide. La position se lit dans le dernier relevé de l'appareil (aucune attente,
/// aucune demande de permission) ; sinon la rangée dit l'état, comme avant.
enum ProfileOwnPositionPreview: Equatable {
    case map(SharedLocationFix)
    case note

    static func resolve(recipients: Int, isGhost: Bool, fix: SharedLocationFix?) -> ProfileOwnPositionPreview {
        guard recipients > 0, !isGhost, let fix else { return .note }
        return .map(fix)
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
