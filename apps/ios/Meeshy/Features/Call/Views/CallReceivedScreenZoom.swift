import SwiftUI
import MeeshyUI

/// P15.11 — l'écran que l'autre partage en duo se pince jusqu'à 4× et revient à 1× en deux
/// touchers : la loi (`GroupCallSpotlight.clampedZoom`, plafond 4×) est celle de la vignette à la
/// une d'un groupe. Le pincement est simultané : il ne retarde jamais le toucher simple qui range
/// ou rend le chrome (celui du parent). Le double toucher n'existe qu'une fois l'écran zoomé, comme
/// celui de ma caméra (`callCameraZoom`) : il l'emporte alors sur le toucher du parent, donc deux
/// touchers rendent 1× sans ranger puis rendre le chrome ; à 1×, rien n'attend un second toucher.
/// Hors partage reçu, aucun geste n'est posé. « Réduire les animations » raccourcit le retour.
struct CallReceivedScreenZoom: ViewModifier {
    let isReceivingScreen: Bool

    @State private var zoom: CGFloat = 1
    @GestureState private var pinch: CGFloat = 1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isZoomed: Bool { zoom > 1 }

    func body(content: Content) -> some View {
        content
            .scaleEffect(GroupCallSpotlight.receivedScreenZoom(committed: zoom, pinch: pinch, isReceivingScreen: isReceivingScreen))
            .clipped()
            .simultaneousGesture(zoomGesture, including: isReceivingScreen ? .all : .subviews)
            .highPriorityGesture(resetTap, including: isZoomed ? .all : .subviews)
            .adaptiveOnChange(of: isReceivingScreen) { _, _ in zoom = 1 }
    }

    private var zoomGesture: some Gesture {
        MagnificationGesture()
            .updating($pinch) { value, state, _ in state = value }
            .onEnded { value in zoom = GroupCallSpotlight.clampedZoom(zoom * value) }
    }

    private var resetTap: some Gesture {
        TapGesture(count: 2).onEnded {
            withAnimation(.easeOut(duration: reduceMotion ? CallChromeStow.reducedFadeDuration : 0.2)) { zoom = 1 }
        }
    }
}
