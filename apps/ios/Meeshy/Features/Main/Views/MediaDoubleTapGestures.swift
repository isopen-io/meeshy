import SwiftUI
import UIKit

/// Overlay de gestes pour bulles média : single tap (ouvre le plein écran)
/// et double tap (réagir), reliés par `require(toFail:)` pour que le single
/// reste net (pattern app Photos). Capture les taps du média sous-jacent —
/// la vue média NE doit PLUS porter son propre `.onTapGesture` d'ouverture ;
/// elle route son ouverture via `onSingleTap`.
struct MediaTapGestures: UIViewRepresentable {
    let onSingleTap: () -> Void
    let onDoubleTap: () -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = true

        let single = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleSingle))
        single.numberOfTapsRequired = 1
        let double = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleDouble))
        double.numberOfTapsRequired = 2
        single.require(toFail: double)

        view.addGestureRecognizer(single)
        view.addGestureRecognizer(double)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.onSingleTap = onSingleTap
        context.coordinator.onDoubleTap = onDoubleTap
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onSingleTap: onSingleTap, onDoubleTap: onDoubleTap)
    }

    final class Coordinator: NSObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
        var onSingleTap: () -> Void
        var onDoubleTap: () -> Void
        init(onSingleTap: @escaping () -> Void, onDoubleTap: @escaping () -> Void) {
            self.onSingleTap = onSingleTap
            self.onDoubleTap = onDoubleTap
        }
        @objc func handleSingle() { onSingleTap() }
        @objc func handleDouble() { onDoubleTap() }
    }
}
