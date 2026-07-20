import UIKit

// MARK: - ThreeFingerPinchGestureRecognizer

/// Custom recognizer qui détecte un pinch à exactement 3 doigts. Utilisé
/// par `StoryCanvasUIView` pour le zoom du viewport — l'API standard
/// `UIPinchGestureRecognizer` est verrouillée à 2 doigts, ce qui entrait
/// en collision avec le pinch d'élément (mêmes 2 doigts, deux gestures
/// firent en parallèle → l'élément ET le canvas scalent).
///
/// Géométrie : `scale` est calculé comme le ratio entre la distance moyenne
/// actuelle des touches au centroïde et la distance moyenne à l'instant de
/// `.began`. Comportement équivalent à `UIPinchGestureRecognizer.scale`
/// mais sur N touches.
///
/// État :
/// - `.possible` → tant que moins de 3 doigts ne sont pas posés
/// - `.began` → 3ᵉ doigt posé, distance initiale capturée
/// - `.changed` → mouvement d'un des 3 doigts (recalcule `scale`)
/// - `.ended` → un doigt levé (passe à <3) après `.began/.changed`
/// - `.failed` → 4ᵉ doigt posé avant `.began` (on n'accepte que 3 doigts)
/// - `.cancelled` → touchesCancelled (interruption système)
final class ThreeFingerPinchGestureRecognizer: UIGestureRecognizer {
    /// Échelle cumulée depuis `.began`. Reset à 1.0 dans `reset()`.
    /// Calculée uniquement en interne (touchesMoved / reset), lue par les
    /// consommateurs (`recognizer.scale`) → `private(set)`.
    private(set) var scale: CGFloat = 1.0
    var initialAverageDistance: CGFloat = 0

    static let requiredTouches: Int = 3

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        let count = numberOfTouches
        if count < Self.requiredTouches {
            // Pas encore assez de doigts — on reste `.possible`.
            return
        }
        if count > Self.requiredTouches {
            // Trop de doigts : ce recognizer cible exactement 3.
            state = .failed
            return
        }
        // count == 3 → capture la distance initiale et lance `.began`.
        initialAverageDistance = Self.averageDistanceFromCentroid(of: self)
        if state == .possible {
            state = .began
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)
        guard numberOfTouches == Self.requiredTouches,
              initialAverageDistance > 0 else { return }
        let current = Self.averageDistanceFromCentroid(of: self)
        scale = current / initialAverageDistance
        if state == .began || state == .changed {
            state = .changed
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesEnded(touches, with: event)
        guard numberOfTouches < Self.requiredTouches else { return }
        if state == .began || state == .changed {
            state = .ended
        } else {
            state = .failed
        }
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesCancelled(touches, with: event)
        state = .cancelled
    }

    override func reset() {
        super.reset()
        scale = 1.0
        initialAverageDistance = 0
    }

    /// Pure helper — extrait `static` pour permettre les tests sans monter
    /// un environnement UITouch (testé via `Self.averageDistance(...)`).
    /// Retourne 0 si moins d'une touche ou pas de view attachée.
    static func averageDistanceFromCentroid(of recognizer: UIGestureRecognizer) -> CGFloat {
        guard let view = recognizer.view, recognizer.numberOfTouches > 0 else { return 0 }
        let count = recognizer.numberOfTouches
        let points = (0..<count).map { recognizer.location(ofTouch: $0, in: view) }
        return Self.averageDistance(points: points)
    }

    /// Version pure pour les tests — calcule la distance moyenne d'un set
    /// de points au centroïde. Retourne 0 si moins d'un point.
    static func averageDistance(points: [CGPoint]) -> CGFloat {
        guard !points.isEmpty else { return 0 }
        let cx = points.reduce(0) { $0 + $1.x } / CGFloat(points.count)
        let cy = points.reduce(0) { $0 + $1.y } / CGFloat(points.count)
        let centroid = CGPoint(x: cx, y: cy)
        let totalDist = points.reduce(CGFloat(0)) { acc, p in
            let dx = p.x - centroid.x
            let dy = p.y - centroid.y
            return acc + sqrt(dx * dx + dy * dy)
        }
        return totalDist / CGFloat(points.count)
    }
}
