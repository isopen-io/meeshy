import SwiftUI
import UIKit
import MeeshyUI

// MARK: - Fermer d'un glissement vers le bas, sans disputer le balayage (#10568)

/// **Le glissement de fermeture ne s'arme QUE pour un geste vertical.**
///
/// Il était un `DragGesture` SwiftUI posé sur le pager : tout doigt posé armait
/// deux gestes, et le défilement horizontal attendait que le premier se
/// désiste — le balayage partait en retard. Depuis iOS 18, le geste est un
/// `UIPanGestureRecognizer` dont le délégué refuse de COMMENCER pour autre
/// chose qu'un glissement franc vers le bas : un balayage de page ne le
/// réveille pas, et le pager part à la première image.
///
/// Il cède aussi à la transcription : parti d'une zone qui défile et n'est pas
/// en haut de sa course, le doigt fait défiler le texte, pas l'écran.
///
/// iOS 16 et 17 gardent le geste SwiftUI d'origine.
struct AudioFullscreenDismissDrag: ViewModifier {
    @Binding var offset: CGFloat
    let onDismiss: () -> Void

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.gesture(AudioFullscreenDismissPan(
                onChanged: { offset = $0 * AudioFullscreenDismissRule.follow },
                onEnded: conclude
            ))
        } else {
            content.gesture(legacyGesture)
        }
    }

    private func conclude(translation: CGFloat, predicted: CGFloat) {
        guard offset > 0 else { return }
        if AudioFullscreenDismissRule.dismisses(translation: translation, predicted: predicted) {
            onDismiss()
        } else {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { offset = 0 }
        }
    }

    private var legacyGesture: some Gesture {
        DragGesture(minimumDistance: 40)
            .onChanged { value in
                let vertical = value.translation.height
                if vertical > 0, abs(vertical) > abs(value.translation.width) {
                    offset = vertical * AudioFullscreenDismissRule.follow
                }
            }
            .onEnded { value in
                conclude(translation: value.translation.height, predicted: value.predictedEndTranslation.height)
            }
    }
}

/// Ce qui décide du glissement de fermeture, sans vue.
nonisolated enum AudioFullscreenDismissRule {
    /// L'écran suit le doigt à 60 % : la résistance dit qu'on peut revenir.
    static let follow: CGFloat = 0.6
    static let distance: CGFloat = 120
    static let predictedDistance: CGFloat = 300

    static func dismisses(translation: CGFloat, predicted: CGFloat) -> Bool {
        translation > distance || predicted > predictedDistance
    }

    /// Un glissement arme la fermeture s'il descend, et nettement plus qu'il ne
    /// part de côté : un balayage de page en biais reste un balayage.
    static func arms(velocity: CGVector) -> Bool {
        velocity.dy > 0 && abs(velocity.dy) > abs(velocity.dx) * 1.5
    }
}

@available(iOS 18.0, *)
private struct AudioFullscreenDismissPan: UIGestureRecognizerRepresentable {
    let onChanged: (CGFloat) -> Void
    let onEnded: (_ translation: CGFloat, _ predicted: CGFloat) -> Void

    func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

    func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
        let pan = UIPanGestureRecognizer()
        pan.delegate = context.coordinator
        return pan
    }

    func handleUIGestureRecognizerAction(_ recognizer: UIPanGestureRecognizer, context: Context) {
        let translation = recognizer.translation(in: recognizer.view).y
        switch recognizer.state {
        case .changed:
            onChanged(max(0, translation))
        case .ended:
            // La course que le doigt aurait finie : sa vitesse sur un quart de seconde.
            onEnded(translation, translation + recognizer.velocity(in: recognizer.view).y * 0.25)
        case .cancelled, .failed:
            onEnded(0, 0)
        default:
            break
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let pan = gestureRecognizer as? UIPanGestureRecognizer, let host = pan.view else { return false }
            let velocity = pan.velocity(in: host)
            guard AudioFullscreenDismissRule.arms(velocity: CGVector(dx: velocity.x, dy: velocity.y)) else { return false }
            var node = host.hitTest(pan.location(in: host), with: nil)
            while let view = node, view !== host {
                if let scroll = view as? UIScrollView,
                   scroll.contentSize.height > scroll.bounds.height + 1,
                   scroll.contentOffset.y > 0 {
                    return false
                }
                node = view.superview
            }
            return true
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                               shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
            true
        }
    }
}
