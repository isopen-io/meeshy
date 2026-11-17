import SwiftUI
#if canImport(UIKit)
import UIKit

/// La luminosité poussée au maximum tant que le code est à l'écran, rendue à sa
/// valeur d'avant en partant (et en passant en arrière-plan). L'écran se lit sur
/// la fenêtre de la vue : aucun singleton d'écran.
struct MeeshyCodeScreenBrightness: UIViewRepresentable {
    let isActive: Bool

    func makeUIView(context: Context) -> BrightnessProbe {
        let probe = BrightnessProbe()
        probe.isActive = isActive
        return probe
    }

    func updateUIView(_ uiView: BrightnessProbe, context: Context) {
        uiView.isActive = isActive
        uiView.applyIfNeeded()
    }

    final class BrightnessProbe: UIView {
        var isActive = false
        private var previous: CGFloat?
        private var screen: UIScreen?
        private var observer: NSObjectProtocol?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            if window == nil { restore() } else { applyIfNeeded() }
        }

        func applyIfNeeded() {
            guard isActive else { restore(); return }
            guard let target = window?.windowScene?.screen else { return }
            if previous == nil {
                previous = target.brightness
                screen = target
            }
            target.brightness = 1
            if observer == nil {
                observer = NotificationCenter.default.addObserver(
                    forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
                ) { [weak self] _ in self?.restore() }
            }
        }

        private func restore() {
            if let previous, let screen { screen.brightness = previous }
            previous = nil
            screen = nil
            if let observer { NotificationCenter.default.removeObserver(observer) }
            observer = nil
        }

        deinit {
            if let observer { NotificationCenter.default.removeObserver(observer) }
        }
    }
}
#else
struct MeeshyCodeScreenBrightness: View {
    let isActive: Bool
    var body: some View { EmptyView() }
}
#endif
