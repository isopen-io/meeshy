import SwiftUI
import MeeshyUI

// #8441 — le zoom dans les commandes de MA caméra, à côté du pincement :
// les pastilles « 0,5× · 1× · 2× · 3× » quand mon image est en plein écran,
// un seul bouton de 44 pt qui passe au facteur suivant dans ma vignette.
// Seules ces vues observent le contrôleur de zoom : l'écran d'appel ne se
// redessine pas à chaque cran.

struct CallZoomLensChips: View {
    let stops: [CGFloat]
    @ObservedObject var zoom: CameraZoomController = .shared

    @Environment(\.locale) private var locale

    var body: some View {
        HStack(spacing: 0) {
            ForEach(stops, id: \.self) { stop in
                chip(stop)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "call.zoom.label", defaultValue: "Zoom de ma caméra", bundle: .main))
    }

    private func isActive(_ stop: CGFloat) -> Bool {
        abs(zoom.displayFactor - stop) / stop <= CameraZoomPolicy.snapTolerance
    }

    private func chip(_ stop: CGFloat) -> some View {
        let active = isActive(stop)
        let label = CameraZoomPolicy.label(forDisplay: active ? zoom.displayFactor : stop, locale: locale)
        return Button {
            zoom.select(stop)
            HapticFeedback.light()
        } label: {
            Text(label)
                .font(.caption.weight(.semibold).monospacedDigit())
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(active ? MeeshyColors.warning : Color.white)
                .frame(width: CallCameraRail.targetSide, height: CallCameraRail.targetSide)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "call.zoom.lens", defaultValue: "Zoom \(CameraZoomPolicy.label(forDisplay: stop, locale: locale))", bundle: .main))
        .accessibilityAddTraits(active ? .isSelected : [])
    }
}

struct CallZoomCycleButton: View {
    @ObservedObject var zoom: CameraZoomController = .shared

    @Environment(\.locale) private var locale

    var body: some View {
        let label = CameraZoomPolicy.label(forDisplay: zoom.displayFactor, locale: locale)
        Button {
            zoom.cycleQuickStop()
            HapticFeedback.light()
        } label: {
            Text(label)
                .font(.caption.weight(.semibold).monospacedDigit())
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .foregroundStyle(.white)
                .frame(width: CallCameraRail.targetSide, height: CallCameraRail.targetSide)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .callChromeGlass(in: Circle())
        .accessibilityLabel(String(localized: "call.zoom.label", defaultValue: "Zoom de ma caméra", bundle: .main))
        .accessibilityValue(label)
        .accessibilityHint(String(localized: "call.zoom.cycle.hint", defaultValue: "Touchez pour passer au facteur de zoom suivant", bundle: .main))
    }
}

/// La place du zoom dans les commandes de ma caméra, décidée par
/// `CallCameraRail.zoomControl` : rien tant que la caméra n'est pas zoomable.
struct CallZoomRailSlot: View {
    let placement: CallCameraControlsPlacement
    var tileSize: CGSize? = nil
    let actionCount: Int
    @ObservedObject var zoom: CameraZoomController = .shared

    var body: some View {
        switch CallCameraRail.zoomControl(profile: zoom.profile, placement: placement, tileSize: tileSize, actionCount: actionCount) {
        case .lensChips(let stops)?:
            CallZoomLensChips(stops: stops, zoom: zoom)
        case .cycleButton?:
            CallZoomCycleButton(zoom: zoom)
                .padding(CallCameraRail.tileInset)
        case nil:
            EmptyView()
        }
    }
}
