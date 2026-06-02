import SwiftUI
import PencilKit
import MeeshySDK

// MARK: - StrokeCaptureLayer

/// Capture d'un trait à la fois via `PKCanvasView` (Apple Pencil + palm rejection
/// natifs préservés), puis extraction immédiate en `StoryDrawingStroke` à chaque
/// lift-up et clear du canvas. C'est l'Option A "hybride" du plan : PencilKit gère
/// l'entrée bas-niveau, le modèle éditable `[StoryDrawingStroke]` reste la vérité.
///
/// Les points capturés (espace bounds du canvas visible) sont projetés en espace
/// design 1080×1920 — portable cross-device, aligné sur le rendu (`StrokePathBuilder`,
/// `StoryStrokeRasterizer`). En mode gomme, aucun trait n'est commité : les points du
/// geste sont émis pour que le parent supprime les traits qu'il croise.
struct StrokeCaptureLayer: UIViewRepresentable {
    var activeTool: StrokeTool
    var activeColorHex: String
    var activeWidth: Double
    var activeSmoothing: StrokeSmoothing
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
    /// isolant la projection et la construction du trait.
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
            pressures = Self.fingerPressures(designPoints: designPoints, pkPoints: pkPoints)
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
    /// (lent = épais). 1er point = neutre (pas de prédécesseur).
    private static func fingerPressures(designPoints: [CGPoint], pkPoints: [PKStrokePoint]) -> [CGFloat] {
        let n = designPoints.count
        guard n == pkPoints.count, n > 1 else {
            return Array(repeating: StrokeWidthDriver.neutral, count: n)
        }
        var rawVel: [CGFloat] = [0]
        for i in 1..<n {
            let dt = CGFloat(pkPoints[i].timeOffset - pkPoints[i - 1].timeOffset)
            rawVel.append(StrokeWidthDriver.velocity(from: designPoints[i - 1], to: designPoints[i], dt: dt) ?? 0)
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

    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.drawingPolicy = .anyInput
        // PencilKit adapte sinon l'encre noir↔blanc selon le mode clair/sombre :
        // un trait noir choisi vire au blanc en dark mode (et inversement). On épingle
        // le canvas en mode clair pour que l'encre live rende la couleur EXACTE choisie
        // dès l'instant du tracé, y compris pour le blanc et le noir purs (user 2026-06-02).
        canvas.overrideUserInterfaceStyle = .light
        canvas.delegate = context.coordinator
        applyTool(to: canvas)
        context.coordinator.lastToolKey = toolKey
        return canvas
    }

    func updateUIView(_ uiView: PKCanvasView, context: Context) {
        context.coordinator.parent = self
        if context.coordinator.lastToolKey != toolKey {
            applyTool(to: uiView)
            context.coordinator.lastToolKey = toolKey
        }
    }

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    /// Le tool PencilKit ne sert qu'au rendu transitoire pendant le geste ; on
    /// extrait toujours les points bruts à la fin. La gomme dessine quand même un
    /// trait (effacé au commit) pour donner un retour visuel pendant le geste.
    private func applyTool(to canvas: PKCanvasView) {
        let inkColor = UIColor(Color(hex: activeColorHex))
        switch activeTool {
        case .pen:
            canvas.tool = PKInkingTool(.pen, color: inkColor, width: CGFloat(activeWidth))
        case .marker:
            canvas.tool = PKInkingTool(.marker, color: inkColor, width: CGFloat(activeWidth) * 2)
        case .eraser:
            canvas.tool = PKInkingTool(.pen, color: UIColor.systemGray.withAlphaComponent(0.4),
                                       width: CGFloat(activeWidth) * 2)
        }
    }

    private var toolKey: String {
        "\(activeTool.rawValue)|\(activeColorHex)|\(activeWidth)"
    }

    // MARK: - Coordinator

    final class Coordinator: NSObject, PKCanvasViewDelegate {
        var parent: StrokeCaptureLayer
        var lastToolKey: String = ""
        private var isClearing = false

        init(parent: StrokeCaptureLayer) {
            self.parent = parent
        }

        func canvasViewDrawingDidChange(_ canvasView: PKCanvasView) {
            guard !isClearing else { return }
            guard !canvasView.drawing.strokes.isEmpty else { return }

            let event = StrokeCaptureLayer.extract(
                from: canvasView.drawing,
                bounds: canvasView.bounds,
                tool: parent.activeTool,
                colorHex: parent.activeColorHex,
                width: parent.activeWidth,
                smoothing: parent.activeSmoothing
            )

            switch event {
            case .stroke(let stroke): parent.onStrokeCommitted(stroke)
            case .erase(let points):  parent.onEraseGesture(points)
            case .none:               break
            }

            isClearing = true
            canvasView.drawing = PKDrawing()
            isClearing = false
        }
    }
}
