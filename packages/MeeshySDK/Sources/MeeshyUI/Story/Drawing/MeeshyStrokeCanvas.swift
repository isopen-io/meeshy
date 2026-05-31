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
        let path = Path(StrokePathBuilder.path(for: stroke))
        let isMarker = stroke.tool == .marker
        let lineWidth = max(1, CGFloat(stroke.width) * (isMarker ? 2 : 1))
        let style = StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round)

        if stroke.id == selectedId {
            let haloStyle = StrokeStyle(lineWidth: lineWidth + 14, lineCap: .round, lineJoin: .round)
            context.stroke(path, with: .color(MeeshyColors.indigo400.opacity(0.55)), style: haloStyle)
        }

        let color = Color(hex: stroke.colorHex).opacity(isMarker ? 0.45 : 1.0)
        context.stroke(path, with: .color(color), style: style)
    }
}
