import SwiftUI
import PencilKit
import MeeshySDK

// MARK: - StrokeCaptureLayer

/// Capture WYSIWYG d'un trait à la fois via une `UIView` custom (et NON `PKCanvasView`) :
/// les touches brutes (single-finger + Apple Pencil) sont captées par nous, projetées en
/// espace design 1080×1920, et rendues live par NOTRE moteur largeur-variable
/// (`MeeshyStrokeCanvas` côté parent) au lieu du modèle d'encre PencilKit. Ainsi le trait
/// que l'utilisateur voit PENDANT le tracé (lent = largeur choisie, rapide = plus fin)
/// est EXACTEMENT celui qui est commité au lift-up (C4, 2026-06-03).
///
/// Le trait en cours est émis à chaque déplacement via `onStrokeInProgress` (puis `nil` au
/// commit/annulation pour effacer l'aperçu) ; le trait final est émis via `onStrokeCommitted`
/// au lift-up. En mode gomme, aucun trait n'est commité ni prévisualisé : les points du geste
/// sont émis via `onEraseGesture` pour que le parent supprime les traits qu'ils croisent.
///
/// Les statiques pures `extract` / `projectionScale` / `fingerPressures` restent disponibles
/// (testées par `StrokeCaptureLayerTests` + partage de la logique driver largeur).
struct StrokeCaptureLayer: UIViewRepresentable {
    var activeTool: StrokeTool
    var activeColorHex: String
    var activeWidth: Double
    var activeSmoothing: StrokeSmoothing
    var onStrokeInProgress: (StoryDrawingStroke?) -> Void
    var onStrokeCommitted: (StoryDrawingStroke) -> Void
    var onEraseGesture: ([CGPoint]) -> Void

    // MARK: - Capture event (pure, testable)

    enum CaptureEvent: Equatable {
        case stroke(StoryDrawingStroke)
        case erase([CGPoint])
        case none
    }

    /// Extrait un évènement de capture du `drawing` PencilKit (espace bounds) projeté
    /// en espace design. Pure-function : aucune dépendance UIKit live, testable en
    /// isolant la projection et la construction du trait. Conservée pour les tests et
    /// pour documenter la transformation force→pression partagée avec la capture live.
    static func extract(from drawing: PKDrawing,
                        bounds: CGRect,
                        tool: StrokeTool,
                        colorHex: String,
                        width: Double,
                        smoothing: StrokeSmoothing,
                        designSize: CGSize = CanvasGeometry.designSize) -> CaptureEvent {
        guard let pkStroke = drawing.strokes.last else { return .none }

        let (scaleX, scaleY) = projectionScale(bounds: bounds, designSize: designSize)
        let pkPoints = Array(pkStroke.path)
        let designPoints: [CGPoint] = pkPoints.map { point in
            CGPoint(x: point.location.x * scaleX, y: point.location.y * scaleY)
        }
        guard !designPoints.isEmpty else { return .none }

        if tool == .eraser {
            return .erase(designPoints)
        }

        // Per-point width driver (C1). Pencil force VARIES across points; finger force is ~constant.
        let forces = pkPoints.map { CGFloat($0.force) }
        let maxForce = forces.max() ?? 0
        let forceSpread = maxForce - (forces.min() ?? 0)
        let usesPencilForce = forceSpread > 0.05

        let pressures: [CGFloat]
        if usesPencilForce {
            pressures = forces.map { StrokeWidthDriver.pencilDriver(force: $0, maxForce: maxForce) }
        } else {
            let dts = (1..<pkPoints.count).map {
                CGFloat(pkPoints[$0].timeOffset - pkPoints[$0 - 1].timeOffset)
            }
            pressures = Self.fingerPressures(designPoints: designPoints, dts: dts)
        }

        let strokePoints = zip(designPoints, pressures).map { pt, p in
            StoryDrawingStrokePoint(x: pt.x, y: pt.y, pressure: Double(p))
        }
        let stroke = StoryDrawingStroke(
            points: strokePoints,
            colorHex: colorHex,
            width: width,
            tool: tool,
            smoothing: smoothing,
            captureVersion: 1
        )
        return .stroke(stroke)
    }

    /// Finger driver: vitesse locale (design-space) lissée → `1 - vitesse normalisée`
    /// (lent = épais). 1er point = neutre (pas de prédécesseur). `dts[i]` = Δt entre les
    /// points `i` et `i+1` (donc `designPoints.count - 1` deltas).
    static func fingerPressures(designPoints: [CGPoint], dts: [CGFloat]) -> [CGFloat] {
        let n = designPoints.count
        guard n > 1, dts.count == n - 1 else {
            return Array(repeating: StrokeWidthDriver.neutral, count: n)
        }
        var rawVel: [CGFloat] = [0]
        for i in 1..<n {
            rawVel.append(StrokeWidthDriver.velocity(from: designPoints[i - 1], to: designPoints[i], dt: dts[i - 1]) ?? 0)
        }
        let smoothed = StrokeWidthDriver.movingAverage(rawVel, window: 5)
        return smoothed.enumerated().map { idx, v in
            guard idx > 0 else { return StrokeWidthDriver.neutral }
            return StrokeWidthDriver.fingerDriver(
                normalizedSmoothedVelocity: StrokeWidthDriver.normalize(v, vMax: StrokeWidthDriver.designVMax)
            )
        }
    }

    /// Échelle bounds→design **non-uniforme** (axes X/Y séparés). Doit matcher le
    /// rendu : `StoryRenderer` étire l'image design 1080×1920 sur la `renderSize` du
    /// canvas via `CALayer` resize (stretch non-uniforme), et `MeeshyStrokeCanvas`
    /// applique la même mise à l'échelle. Une projection uniforme (`min`) ici
    /// désaligne le trait figé par rapport au doigt quand le canvas n'est pas 9:16.
    static func projectionScale(bounds: CGRect, designSize: CGSize) -> (x: CGFloat, y: CGFloat) {
        guard bounds.width > 0, bounds.height > 0 else { return (1, 1) }
        return (designSize.width / bounds.width, designSize.height / bounds.height)
    }

    // MARK: - UIViewRepresentable

    func makeUIView(context: Context) -> StrokeCaptureView {
        let view = StrokeCaptureView()
        view.apply(self)
        return view
    }

    func updateUIView(_ uiView: StrokeCaptureView, context: Context) {
        uiView.apply(self)
    }

    // MARK: - Capture view (custom touch handling, no PencilKit)

    /// `UIView` qui capte les touches single-finger et reconstruit le trait avec notre
    /// moteur largeur-variable. Aucun `UIGestureRecognizer` n'est ajouté pour ne pas
    /// entrer en conflit avec le composer (le pan/zoom du canvas est déjà désactivé via
    /// `allowsHitTesting(!isDrawingActive)` côté parent).
    final class StrokeCaptureView: UIView {
        private var points: [(location: CGPoint, t: TimeInterval, force: CGFloat)] = []
        private var currentStrokeId = UUID().uuidString

        private var activeTool: StrokeTool = .pen
        private var activeColorHex: String = "FFFFFF"
        private var activeWidth: Double = 5
        private var activeSmoothing: StrokeSmoothing = .raw
        private var onStrokeInProgress: (StoryDrawingStroke?) -> Void = { _ in }
        private var onStrokeCommitted: (StoryDrawingStroke) -> Void = { _ in }
        private var onEraseGesture: ([CGPoint]) -> Void = { _ in }

        override init(frame: CGRect) {
            super.init(frame: frame)
            isMultipleTouchEnabled = false
            backgroundColor = .clear
            isOpaque = false
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

        func apply(_ layer: StrokeCaptureLayer) {
            activeTool = layer.activeTool
            activeColorHex = layer.activeColorHex
            activeWidth = layer.activeWidth
            activeSmoothing = layer.activeSmoothing
            onStrokeInProgress = layer.onStrokeInProgress
            onStrokeCommitted = layer.onStrokeCommitted
            onEraseGesture = layer.onEraseGesture
        }

        // MARK: Touch lifecycle

        override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
            guard let touch = touches.first else { return }
            points = []
            currentStrokeId = UUID().uuidString
            append(touch.location(in: self), touch.timestamp, touch.force)
            emitInProgress()
        }

        override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
            guard let touch = touches.first else { return }
            let coalesced = event?.coalescedTouches(for: touch) ?? [touch]
            for c in coalesced {
                append(c.preciseLocation(in: self), c.timestamp, c.force)
            }
            emitInProgress()
        }

        override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
            if let touch = touches.first {
                append(touch.preciseLocation(in: self), touch.timestamp, touch.force)
            }
            commit()
            onStrokeInProgress(nil)
            points = []
        }

        override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
            onStrokeInProgress(nil)
            points = []
        }

        // MARK: Capture helpers

        private func append(_ location: CGPoint, _ t: TimeInterval, _ force: CGFloat) {
            points.append((location, t, force))
        }

        private func emitInProgress() {
            guard activeTool != .eraser else {
                onStrokeInProgress(nil)
                return
            }
            onStrokeInProgress(makeStroke())
        }

        private func commit() {
            let projected = projectedDesignPoints()
            if activeTool == .eraser {
                onEraseGesture(projected)
                return
            }
            guard let stroke = makeStroke() else { return }
            onStrokeCommitted(stroke)
        }

        /// Projette chaque point capté (espace bounds) en espace design 1080×1920 via
        /// `projectionScale` (axes séparés — voir le commentaire de la statique).
        private func projectedDesignPoints() -> [CGPoint] {
            let (scaleX, scaleY) = StrokeCaptureLayer.projectionScale(
                bounds: bounds, designSize: CanvasGeometry.designSize)
            return points.map { CGPoint(x: $0.location.x * scaleX, y: $0.location.y * scaleY) }
        }

        /// Reconstruit le `StoryDrawingStroke` partiel/final à partir des points captés.
        /// Logique IDENTIQUE pour l'aperçu et le commit — le seul invariant est l'id stable
        /// (`currentStrokeId`, fixé au `touchesBegan`) pour que le diffing SwiftUI reste
        /// stable d'un move au commit (pas de re-création de vue par-frame).
        private func makeStroke() -> StoryDrawingStroke? {
            guard !points.isEmpty else { return nil }
            let designPts = projectedDesignPoints()

            // Pencil vs finger : force qui VARIE sur le trait ⇒ pencil ; sinon finger (vitesse).
            let forces = points.map { $0.force }
            let maxForce = forces.max() ?? 0
            let forceSpread = maxForce - (forces.min() ?? 0)
            let usesPencilForce = maxForce > 0 && forceSpread > 0.05

            let pressures: [CGFloat]
            if usesPencilForce {
                pressures = forces.map { StrokeWidthDriver.pencilDriver(force: $0, maxForce: maxForce) }
            } else {
                let dts = (1..<points.count).map { CGFloat(points[$0].t - points[$0 - 1].t) }
                pressures = StrokeCaptureLayer.fingerPressures(designPoints: designPts, dts: dts)
            }

            let strokePoints = zip(designPts, pressures).map { pt, p in
                StoryDrawingStrokePoint(x: pt.x, y: pt.y, pressure: Double(p))
            }
            return StoryDrawingStroke(
                id: currentStrokeId,
                points: strokePoints,
                colorHex: activeColorHex,
                width: activeWidth,
                tool: activeTool,
                smoothing: activeSmoothing,
                captureVersion: 1
            )
        }
    }
}
