import SwiftUI
import MeeshySDK

// MARK: - MeeshyStrokeCanvas

/// Rendu live des traits éditables du composer, au-dessus du canvas. Atome pur :
/// prend des traits opaques (`[StoryDrawingStroke]`) + un id sélectionné, et les
/// peint via SwiftUI `Canvas` + `StrokePathBuilder`. Le trait sélectionné reçoit un
/// halo indigo pour signaler l'édition par-trait. Aucune capture d'input ici
/// (`allowsHitTesting(false)`) — la capture passe par `StrokeCaptureLayer`.
///
/// `Equatable` + `.equatable()` permet à SwiftUI de sauter le re-render quand ni les
/// traits ni la sélection ne changent (Risque #3 du plan : >60fps sur dessins denses).
struct MeeshyStrokeCanvas: View, Equatable {
    let strokes: [StoryDrawingStroke]
    var selectedId: String?
    var designSize: CGSize = CanvasGeometry.designSize

    /// Tesselle les rubans largeur-variable + cache les traits figés. Tenu sur la vue
    /// pour que les re-évaluations de `body` (au sein de la même instance struct)
    /// réutilisent la géométrie déjà calculée. Non comparé par `==` (référence opaque).
    private let widthBuilder = VariableWidthStrokeBuilder()

    static func == (lhs: MeeshyStrokeCanvas, rhs: MeeshyStrokeCanvas) -> Bool {
        lhs.selectedId == rhs.selectedId
            && lhs.designSize == rhs.designSize
            && lhs.strokes == rhs.strokes
    }

    var body: some View {
        Canvas { context, size in
            guard designSize.width > 0, designSize.height > 0 else { return }
            // Stretch non-uniforme design→bounds, identique à `StoryRenderer`
            // (CALayer resize) et à la projection de capture (`StrokeCaptureLayer`).
            // Garantit que le trait figé s'affiche exactement là où l'utilisateur a
            // dessiné, et à l'identique entre aperçu live, bake et reader.
            context.scaleBy(x: size.width / designSize.width,
                            y: size.height / designSize.height)

            for stroke in strokes where stroke.tool != .eraser && !stroke.points.isEmpty {
                paint(stroke, in: &context)
            }
        }
        .allowsHitTesting(false)
    }

    private func paint(_ stroke: StoryDrawingStroke, in context: inout GraphicsContext) {
        let widthPoints = StrokePathBuilder.renderWidthPoints(for: stroke)
        guard !widthPoints.isEmpty else { return }
        let isMarker = stroke.tool == .marker

        if stroke.id == selectedId {
            // Halo d'édition : on épaissit le centerline classique de 14pt (la largeur-
            // variable n'a pas besoin d'un halo variable — c'est un simple repère visuel).
            let centerline = Path(StrokePathBuilder.path(for: stroke))
            let haloWidth = max(1, CGFloat(stroke.width) * (isMarker ? 2 : 1)) + 14
            let haloStyle = StrokeStyle(lineWidth: haloWidth, lineCap: .round, lineJoin: .round)
            context.stroke(centerline, with: .color(MeeshyColors.indigo400.opacity(0.55)), style: haloStyle)
        }

        let color = Color(hex: stroke.colorHex).opacity(isMarker ? 0.45 : 1.0)
        let ribbon = Self.ribbonPath(from: widthBuilder.geometry(for: stroke).vertices,
                                     widthPoints: widthPoints)
        context.fill(ribbon, with: .color(color))
    }

    /// Construit le ruban fermé largeur-variable depuis les sommets décalés du builder :
    /// sommets gauche en avant (indices 0,2,4,…) puis sommets droite en arrière (…,5,3,1),
    /// plus des bouchons ronds (disques de rayon `firstWidth/2`, `lastWidth/2`) pour des
    /// extrémités rondes identiques au legacy `lineCap = .round`.
    private static func ribbonPath(from vertices: [CGPoint],
                                   widthPoints: [StrokePathBuilder.StrokeWidthPoint]) -> Path {
        var path = Path()
        guard !vertices.isEmpty else { return path }

        path.move(to: vertices[0])
        for i in stride(from: 2, to: vertices.count, by: 2) { path.addLine(to: vertices[i]) }
        for i in stride(from: vertices.count - 1, through: 1, by: -2) { path.addLine(to: vertices[i]) }
        path.closeSubpath()

        // Bouchons ronds aux extrémités.
        if let first = widthPoints.first {
            let r = max(0.5, first.width / 2)
            path.addEllipse(in: CGRect(x: first.point.x - r, y: first.point.y - r, width: r * 2, height: r * 2))
        }
        if let last = widthPoints.last, widthPoints.count > 1 {
            let r = max(0.5, last.width / 2)
            path.addEllipse(in: CGRect(x: last.point.x - r, y: last.point.y - r, width: r * 2, height: r * 2))
        }
        return path
    }
}
