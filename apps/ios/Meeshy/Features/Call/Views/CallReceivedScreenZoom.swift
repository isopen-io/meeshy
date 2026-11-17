import SwiftUI
import MeeshyUI

/// P15.11 — l'écran que l'autre partage en duo se pince jusqu'à 4× et revient à 1× en deux
/// touchers : la loi (`GroupCallSpotlight.clampedZoom`, plafond 4×) est celle de la vignette à la
/// une d'un groupe. Le pincement est simultané : il ne retarde jamais le toucher simple qui range
/// ou rend le chrome (celui du parent). Le double toucher n'existe qu'une fois l'écran zoomé, comme
/// celui de ma caméra (`callCameraZoom`) : il l'emporte alors sur le toucher du parent, donc deux
/// touchers rendent 1× et recentrent sans ranger puis rendre le chrome ; à 1×, rien n'attend un
/// second toucher. Zoomé, un doigt déplace l'image, bornée à son cadre (#17753, la loi de la une) ;
/// l'écran garde alors le doigt (`CallReceivedScreenZoomedKey`) : le balayage vers le bas qui réduit
/// l'appel n'en part pas. Hors partage reçu, aucun geste n'est posé. « Réduire les animations »
/// raccourcit le retour.
struct CallReceivedScreenZoom: ViewModifier {
    let isReceivingScreen: Bool

    @State private var zoom: CGFloat = 1
    @GestureState private var pinch: CGFloat = 1
    @State private var pan: GroupCallScreenPan = .zero
    @GestureState private var drag: CGSize = .zero
    @State private var frameSize: CGSize = .zero
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isZoomed: Bool { zoom > 1 }

    private var liveZoom: CGFloat {
        GroupCallSpotlight.receivedScreenZoom(committed: zoom, pinch: pinch, isReceivingScreen: isReceivingScreen)
    }

    func body(content: Content) -> some View {
        content
            .scaleEffect(liveZoom)
            .offset(shownOffset)
            .clipped()
            .onGeometryChange(for: CGSize.self) { $0.size } action: { frameSize = $0 }
            .simultaneousGesture(zoomGesture, including: isReceivingScreen ? .all : .subviews)
            .simultaneousGesture(panGesture, including: isReceivingScreen && isZoomed ? .all : .subviews)
            .highPriorityGesture(resetTap, including: isZoomed ? .all : .subviews)
            .preference(key: CallReceivedScreenZoomedKey.self, value: isReceivingScreen && isZoomed)
            .adaptiveOnChange(of: isReceivingScreen) { _, _ in
                zoom = 1
                pan = .zero
            }
    }

    private var shownOffset: CGSize {
        guard isReceivingScreen else { return .zero }
        let shown = GroupCallSpotlight.screenPan(acquired: pan, drag: drag, zoom: liveZoom, in: frameSize)
        return CGSize(width: shown.x, height: shown.y)
    }

    private var zoomGesture: some Gesture {
        MagnificationGesture()
            .updating($pinch) { value, state, _ in state = value }
            .onEnded { value in zoom = GroupCallSpotlight.clampedZoom(zoom * value) }
    }

    /// Le glissé part de la position affichée, jamais d'au-delà de la borne, et s'acquiert au relâché.
    private var panGesture: some Gesture {
        DragGesture(minimumDistance: GroupCallSpotlight.panSlop)
            .updating($drag) { value, state, _ in state = value.translation }
            .onEnded { value in
                pan = GroupCallSpotlight.screenPan(acquired: pan, drag: value.translation, zoom: GroupCallSpotlight.clampedZoom(zoom), in: frameSize)
            }
    }

    private var resetTap: some Gesture {
        TapGesture(count: 2).onEnded {
            withAnimation(.easeOut(duration: reduceMotion ? CallChromeStow.reducedFadeDuration : 0.2)) {
                zoom = 1
                pan = .zero
            }
        }
    }
}

/// #17753 — le balayage vers le bas qui réduit l'appel, retenu tant que l'écran reçu est zoomé :
/// zoomé, l'écran garde le doigt pour se déplacer. Hors zoom, le balayage part comme avant.
struct CallSwipeDownGate<Swipe: Gesture>: ViewModifier {
    let gesture: Swipe

    @State private var isScreenZoomed = false

    func body(content: Content) -> some View {
        content
            .simultaneousGesture(gesture, including: isScreenZoomed ? .subviews : .all)
            .onPreferenceChange(CallReceivedScreenZoomedKey.self) { isScreenZoomed = $0 }
    }
}

/// #17753 — l'écran reçu du duo est zoomé : la racine retient alors son balayage vers le bas.
nonisolated struct CallReceivedScreenZoomedKey: PreferenceKey {
    static let defaultValue = false

    static func reduce(value: inout Bool, nextValue: () -> Bool) {
        value = value || nextValue()
    }
}
