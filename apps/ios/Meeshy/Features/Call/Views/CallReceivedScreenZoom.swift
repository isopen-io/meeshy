import SwiftUI

/// P15.11 — l'écran que l'autre partage en duo se pince jusqu'à 4× et revient à 1× en deux
/// touchers : la loi (`GroupCallSpotlight.clampedZoom`, plafond 4×) est celle de la vignette à la
/// une d'un groupe. Les deux gestes sont simultanés : ils ne retardent jamais le toucher simple
/// qui range ou rend le chrome (celui du parent), et hors partage reçu ils ne sont pas posés.
/// « Réduire les animations » remplace le retour animé par un fondu court.
struct CallReceivedScreenZoom: ViewModifier {
    let isReceivingScreen: Bool

    @State private var zoom: CGFloat = 1
    @GestureState private var pinch: CGFloat = 1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .scaleEffect(GroupCallSpotlight.receivedScreenZoom(committed: zoom, pinch: pinch, isReceivingScreen: isReceivingScreen))
            .clipped()
            .simultaneousGesture(zoomGesture, including: isReceivingScreen ? .all : .subviews)
            .simultaneousGesture(resetTap, including: isReceivingScreen ? .all : .subviews)
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
