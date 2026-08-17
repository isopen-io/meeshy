import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le tracé des branches et des connecteurs — `Canvas` SEUL, posé DERRIÈRE le
/// contenu. Chaque bulle opaque interrompt le trait d'elle-même ; son
/// contour coloré, à la MÊME épaisseur (`RiverMetrics.Line.width`), reprend
/// la course (amendement R : « le bord de la bulle EST un segment de sa
/// ligne » — aucune découpe à calculer, c'est la superposition qui
/// contourne, exactement comme la maquette normative).
///
/// **Ne calcule AUCUNE géométrie de couloir/rang** (garde R15) : elle lit
/// `RiverGeometry` (la loi, `RiverLaneResolver.resolveRiverLanes`) et les
/// cadres MESURÉS des bulles (`frames`, publiés par `RiverBubbleView` via
/// `MessageFramePreferenceKey`) — jamais une hauteur de rang supposée
/// (§7ter A1, « la peau mesure le rendu réel »).
///
/// **Reduce motion** : cette vue ne s'anime JAMAIS elle-même (aucun
/// `.animation()`, aucune transition) — un tracé qui apparaît/disparaît le
/// fait donc déjà sans mouvement, satisfaisant §7bis (« aucun tracé animé »)
/// par construction plutôt que par une branche conditionnelle à maintenir.
///
/// Décorative — `accessibilityHidden`. L'ordre chronologique du contenu
/// (`geometry.bubbles`, celui du DOM/VoiceOver côté peau) est ce qui prime ;
/// les traits ne portent aucune information que le contenu ne porte déjà.
struct RiverLaneCanvas: View {
    let geometry: RiverLaneResolver.RiverGeometry
    /// `messageId → cadre mesuré`, dans le MÊME repère
    /// (`RiverCoordinateSpace.name`) que ce Canvas.
    let frames: [String: CGRect]
    let columns: RiverColumnLayout

    var body: some View {
        Canvas { context, _ in
            // Sérialisée : AUCUN trait — le verdict de la loi a retiré l'axe
            // horizontal. En tracer quand même, même empilés dans l'unique
            // colonne, affirmerait un axe que la loi vient de nier (§7ter C).
            // Le contour de chaque bulle suffit à dire qui parle.
            guard geometry.layout == .lanes else { return }

            let bubbleByRank: [Int: RiverLaneResolver.RiverBubble] = Dictionary(
                uniqueKeysWithValues: geometry.bubbles.map { ($0.rank, $0) }
            )

            drawConnectors(bubbleByRank: bubbleByRank, in: &context)
            drawLanes(bubbleByRank: bubbleByRank, in: &context)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    // MARK: - Cadres par rang (jamais par couloir — un rang, une bulle)

    private func frame(forRank rank: Int, bubbleByRank: [Int: RiverLaneResolver.RiverBubble]) -> CGRect? {
        guard let messageId = bubbleByRank[rank]?.messageId else { return nil }
        return frames[messageId]
    }

    // MARK: - Connecteurs de réponse — DERRIÈRE les bulles, en pointillé

    private func drawConnectors(bubbleByRank: [Int: RiverLaneResolver.RiverBubble], in context: inout GraphicsContext) {
        for connector in geometry.connectors {
            guard
                let fromFrame = frame(forRank: connector.fromRank, bubbleByRank: bubbleByRank),
                let toFrame = frame(forRank: connector.toRank, bubbleByRank: bubbleByRank),
                let toBubble = bubbleByRank[connector.toRank]
            else { continue }

            let fx = columns.railX(connector.fromLaneIndex)
            let tx = columns.railX(connector.toLaneIndex)
            let fy = fromFrame.midY
            let ty = toFrame.midY
            let side: CGFloat = tx >= fx ? 1 : -1
            let bow = RiverMetrics.Connector.bow(laneDistancePoints: tx - fx)

            var path = Path()
            path.move(to: CGPoint(x: fx, y: fy))
            path.addCurve(
                to: CGPoint(x: tx, y: ty),
                control1: CGPoint(x: fx + side * bow, y: fy),
                control2: CGPoint(x: tx - side * bow, y: ty)
            )

            let color = laneColor(seed: toBubble.laneId)
            // Une réponse lointaine (> 4 rangs) s'estompe davantage — elle
            // remonte le fil, elle ne doit pas dominer le tracé des branches.
            let far = abs(connector.toRank - connector.fromRank) > 4
            context.stroke(
                path,
                with: .color(color.opacity(far ? 0.3 : 0.5)),
                style: StrokeStyle(lineWidth: RiverMetrics.Connector.strokeWidth, dash: [4, 3])
            )
        }
    }

    // MARK: - Branches

    private func drawLanes(bubbleByRank: [Int: RiverLaneResolver.RiverBubble], in context: inout GraphicsContext) {
        for lane in geometry.lanes {
            let cx = columns.railX(lane.laneIndex)
            let color = laneColor(seed: lane.colorSeed)
            for span in lane.spans {
                drawSpan(span, color: color, cx: cx, bubbleByRank: bubbleByRank, in: &context)
            }
        }
    }

    /// Un segment : un trait plein jusqu'à la dernière bulle VIVANTE, puis —
    /// si le segment court au-delà (règle §7bis « un segment survit à ses
    /// propres bulles ») — une queue en dégradé qui s'éteint (`isOpen ==
    /// false`) ou reste franche (`isOpen == true`, on ne sait pas encore).
    private func drawSpan(
        _ span: RiverLaneResolver.RiverLaneSpan,
        color: Color,
        cx: CGFloat,
        bubbleByRank: [Int: RiverLaneResolver.RiverBubble],
        in context: inout GraphicsContext
    ) {
        guard let topFrame = frame(forRank: span.startRank, bubbleByRank: bubbleByRank) else { return }
        guard let endFrame = frame(forRank: span.endRank, bubbleByRank: bubbleByRank) else { return }

        let top = topFrame.minY + 2
        let end = endFrame.maxY - 4

        let bubbleRanksInSpan = span.nodes.filter { $0.kind == .bubble }.map(\.rank)
        let liveTo: CGFloat
        if let lastBubbleRank = bubbleRanksInSpan.max(), let lastFrame = frame(forRank: lastBubbleRank, bubbleByRank: bubbleByRank) {
            liveTo = lastFrame.maxY
        } else if let lastNode = span.nodes.last, let anchorFrame = frame(forRank: lastNode.rank, bubbleByRank: bubbleByRank) {
            // Segment SANS bulle propre (branche reparue pour recevoir une
            // réponse, `.addressed` seul) — amorce courte sous son nœud.
            liveTo = anchorFrame.midY + 9
        } else {
            return
        }

        if liveTo > top {
            var linePath = Path()
            linePath.move(to: CGPoint(x: cx, y: top))
            linePath.addLine(to: CGPoint(x: cx, y: liveTo))
            context.stroke(
                linePath,
                with: .color(color.opacity(0.85)),
                style: StrokeStyle(lineWidth: RiverMetrics.Line.width, lineCap: .round)
            )
        }

        if end > liveTo {
            var tailPath = Path()
            tailPath.move(to: CGPoint(x: cx, y: liveTo))
            tailPath.addLine(to: CGPoint(x: cx, y: end))
            let shading = GraphicsContext.Shading.linearGradient(
                Gradient(colors: [color.opacity(0.85), color.opacity(span.isOpen ? 0.6 : 0)]),
                startPoint: CGPoint(x: cx, y: liveTo),
                endPoint: CGPoint(x: cx, y: end)
            )
            context.stroke(tailPath, with: shading, style: StrokeStyle(lineWidth: RiverMetrics.Line.width))
        }

        // Naissance — une amorce pleine, pour qu'on voie la branche APPARAÎTRE.
        let birthRadius: CGFloat = 2.6
        context.fill(
            Path(ellipseIn: CGRect(x: cx - birthRadius, y: top - birthRadius, width: birthRadius * 2, height: birthRadius * 2)),
            with: .color(color)
        )

        // Nœuds `.addressed` — reparue pour recevoir une réponse : anneau
        // creux en pointillé, AUCUNE bulle.
        for node in span.nodes where node.kind == .addressed {
            guard let nodeFrame = frame(forRank: node.rank, bubbleByRank: bubbleByRank) else { continue }
            let ringRadius: CGFloat = 6.5
            let ringRect = CGRect(
                x: cx - ringRadius, y: nodeFrame.midY - ringRadius,
                width: ringRadius * 2, height: ringRadius * 2
            )
            context.stroke(
                Path(ellipseIn: ringRect),
                with: .color(color),
                style: StrokeStyle(lineWidth: 2, dash: [3, 2.5])
            )
        }
    }

    private func laneColor(seed: String) -> Color {
        Color(hex: DynamicColorGenerator.colorForName(seed))
    }
}
