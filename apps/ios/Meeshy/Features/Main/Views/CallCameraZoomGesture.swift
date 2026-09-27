import SwiftUI
import MeeshyUI

// #8441 — pincer SA propre image zoome la caméra envoyée ; double-tap = retour
// à 1×. Les gestes restent montés en permanence et se désactivent par leur
// masque : une branche `if` changerait l'identité de la vidéo et recréerait
// son rendu à chaque changement de caméra.

extension View {
    func callCameraZoom(isEnabled: Bool, zoom: CameraZoomController = .shared) -> some View {
        modifier(CallCameraZoomModifier(zoom: zoom, isEnabled: isEnabled))
    }
}

private struct CallCameraZoomModifier: ViewModifier {
    @ObservedObject var zoom: CameraZoomController
    let isEnabled: Bool

    @Environment(\.locale) private var locale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isIndicatorVisible = false
    @State private var hideTask: Task<Void, Never>?

    private static let indicatorLinger: UInt64 = 1_000_000_000

    private var isZoomable: Bool { isEnabled && zoom.profile != nil }

    private var isZoomed: Bool {
        guard isZoomable, let profile = zoom.profile else { return false }
        return abs(zoom.displayFactor - profile.baselineDisplay) > 0.01
    }

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                CallZoomIndicator(label: CameraZoomPolicy.label(forDisplay: zoom.displayFactor, locale: locale))
                    .padding(.bottom, 8)
                    .opacity(isIndicatorVisible && isZoomable ? 1 : 0)
                    .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: isIndicatorVisible)
            }
            .simultaneousGesture(pinch, including: isZoomable ? .all : .subviews)
            .highPriorityGesture(resetTap, including: isZoomed ? .all : .subviews)
            .adaptiveOnChange(of: zoom.displayFactor) { _, _ in
                guard isZoomable else { return }
                reveal()
            }
            .adaptiveOnChange(of: zoom.isPinching) { _, isPinching in
                guard !isPinching else { return }
                scheduleHide()
            }
            .onDisappear { hideTask?.cancel() }
    }

    private var pinch: some Gesture {
        MagnificationGesture()
            .onChanged { scale in zoom.updatePinch(scale: scale) }
            .onEnded { _ in zoom.endPinch() }
    }

    private var resetTap: some Gesture {
        TapGesture(count: 2).onEnded {
            zoom.resetToBaseline()
            HapticFeedback.light()
        }
    }

    private func reveal() {
        isIndicatorVisible = true
        scheduleHide()
    }

    private func scheduleHide() {
        hideTask?.cancel()
        hideTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: Self.indicatorLinger)
            guard !Task.isCancelled, !zoom.isPinching else { return }
            isIndicatorVisible = false
        }
    }
}

/// L'élément VoiceOver du zoom : balayer vers le haut / le bas passe au cran
/// suivant (0,5× · 1× · 2× · 3× …). Posé À CÔTÉ de la vignette et non dessus,
/// pour que le libellé « Permuter les vidéos » de la vignette ne le recouvre pas.
struct CallCameraZoomAccessibilityElement: View {
    @ObservedObject var zoom: CameraZoomController = .shared
    @Environment(\.locale) private var locale

    var body: some View {
        Color.clear
            .contentShape(Rectangle())
            .allowsHitTesting(false)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(localized: "call.zoom.label", defaultValue: "Zoom de ma caméra", bundle: .main))
            .accessibilityValue(CameraZoomPolicy.label(forDisplay: zoom.displayFactor, locale: locale))
            .accessibilityHint(String(localized: "call.zoom.hint", defaultValue: "Balayez vers le haut ou le bas pour zoomer. Sur l'écran, pincez votre image ; touchez deux fois pour revenir à 1×", bundle: .main))
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: zoom.step(.increment)
                case .decrement: zoom.step(.decrement)
                @unknown default: return
                }
                HapticFeedback.light()
            }
            .accessibilityHidden(zoom.profile == nil)
    }
}
