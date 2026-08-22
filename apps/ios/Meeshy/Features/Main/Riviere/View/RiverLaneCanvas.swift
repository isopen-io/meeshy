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
/// Où un rang se tient par rapport au champ VISIBLE — la seule question que
/// le canvas pose à un rang sans cadre. Pure, éprouvée sans Canvas
/// (`RiverBubbleLayoutTests`).
///
/// Une pile paresseuse ne pose que les rangs visibles : leurs cadres sont
/// connus, les autres n'existent pas. Un segment de branche qui commence
/// plus haut ou finit plus bas doit quand même se tracer sur sa part
/// visible — sans cela, AUCUN rail ni connecteur dès qu'on quitte le haut
/// de l'histoire (mesuré au simulateur le 2026-08-22). Un rang sans cadre
/// est AU-DESSUS s'il précède le premier rang connu, AU-DESSOUS s'il suit le
/// dernier ; entre deux rangs connus (ou sans aucun rang connu), rien n'est
/// supposé.
nonisolated enum RiverCanvasRankPlacement: Equatable {
    case known(CGRect)
    case above
    case below
    case unknown

    static func resolve(rank: Int, known: [Int: CGRect]) -> RiverCanvasRankPlacement {
        if let frame = known[rank] { return .known(frame) }
        guard let first = known.keys.min(), let last = known.keys.max() else { return .unknown }
        if rank < first { return .above }
        if rank > last { return .below }
        return .unknown
    }
}

struct RiverLaneCanvas: View {
    let geometry: RiverLaneResolver.RiverGeometry
    /// `messageId → cadre mesuré`, dans le repère FIXE du pane
    /// (`RiverCoordinateSpace.name`) — le MÊME que celui de ce Canvas, posé
    /// en fond du `ScrollView` et non de la grille : le fond de la grille
    /// vivait dans le repère du CONTENU (26 000 pt), et les cadres dans celui
    /// du pane — ils ne coïncidaient qu'à l'offset zéro (mesuré au
    /// simulateur le 2026-08-22 : tracé invisible une fois cadré au présent).
    let frames: [String: CGRect]
    let columns: RiverColumnLayout
    /// Décalage horizontal du pane — les cadres sont dans le repère du pane,
    /// les rails (`columns.railX`) dans celui du contenu : la différence est
    /// cet offset.
    var horizontalOffset: CGFloat = 0
    /// Bande haute (en-tête du fil + bande de couloirs) sous laquelle rien ne
    /// se trace : le canvas couvre tout le pane, inset compris.
    var topExclusion: CGFloat = 0

    var body: some View {
        Canvas { context, size in
            // Sérialisée : AUCUN trait — le verdict de la loi a retiré l'axe
            // horizontal. En tracer quand même, même empilés dans l'unique
            // colonne, affirmerait un axe que la loi vient de nier (§7ter C).
            // Le contour de chaque bulle suffit à dire qui parle.
            guard geometry.layout == .lanes else { return }

            context.clip(to: Path(CGRect(x: 0, y: topExclusion, width: size.width, height: max(0, size.height - topExclusion))))

            let bubbleByRank: [Int: RiverLaneResolver.RiverBubble] = Dictionary(
                uniqueKeysWithValues: geometry.bubbles.map { ($0.rank, $0) }
            )
            let known: [Int: CGRect] = Dictionary(
                uniqueKeysWithValues: geometry.bubbles.compactMap { bubble in
                    frames[bubble.messageId].map { (bubble.rank, $0) }
                }
            )
            let extent = RankExtent(known: known, viewportHeight: size.height)

            drawConnectors(bubbleByRank: bubbleByRank, extent: extent, in: &context)
            drawLanes(bubbleByRank: bubbleByRank, extent: extent, in: &context)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    // MARK: - Cadres par rang (jamais par couloir — un rang, une bulle)

    /// Les cotes verticales d'un rang, connu ou hors champ : un rang au-dessus
    /// du champ est placé juste au-dessus du pane, un rang au-dessous juste
    /// en dessous — assez loin pour qu'un trait qui y mène sorte du champ
    /// franchement, jamais à l'intérieur.
    private struct RankExtent {
        let known: [Int: CGRect]
        let viewportHeight: CGFloat
        private var margin: CGFloat { 48 }

        func rect(_ rank: Int) -> CGRect? {
            switch RiverCanvasRankPlacement.resolve(rank: rank, known: known) {
            case .known(let frame): return frame
            case .above: return CGRect(x: 0, y: -margin, width: 0, height: 0)
            case .below: return CGRect(x: 0, y: viewportHeight + margin, width: 0, height: 0)
            case .unknown: return nil
            }
        }

        func isOnScreen(_ rank: Int) -> Bool {
            if case .known = RiverCanvasRankPlacement.resolve(rank: rank, known: known) { return true }
            return false
        }
    }

    private func railX(_ laneIndex: Int) -> CGFloat {
        columns.railX(laneIndex) - horizontalOffset
    }

    // MARK: - Connecteurs de réponse — DERRIÈRE les bulles, en pointillé

    private func drawConnectors(bubbleByRank: [Int: RiverLaneResolver.RiverBubble], extent: RankExtent, in context: inout GraphicsContext) {
        for connector in geometry.connectors {
            // Au moins un des deux bouts doit être à l'écran — un connecteur
            // entre deux rangs hors champ n'a rien à montrer.
            guard
                extent.isOnScreen(connector.fromRank) || extent.isOnScreen(connector.toRank),
                let fromFrame = extent.rect(connector.fromRank),
                let toFrame = extent.rect(connector.toRank),
                let toBubble = bubbleByRank[connector.toRank]
            else { continue }

            let fx = railX(connector.fromLaneIndex)
            let tx = railX(connector.toLaneIndex)
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

    private func drawLanes(bubbleByRank: [Int: RiverLaneResolver.RiverBubble], extent: RankExtent, in context: inout GraphicsContext) {
        for lane in geometry.lanes {
            let cx = railX(lane.laneIndex)
            let color = laneColor(seed: lane.colorSeed)
            for span in lane.spans {
                drawSpan(span, color: color, cx: cx, extent: extent, in: &context)
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
        extent: RankExtent,
        in context: inout GraphicsContext
    ) {
        // Un segment entièrement hors champ n'a rien à tracer ; un segment qui
        // commence plus haut ou finit plus bas se trace sur sa part visible.
        guard span.nodes.contains(where: { extent.isOnScreen($0.rank) }) || spanCrossesViewport(span, extent: extent) else { return }
        guard let topFrame = extent.rect(span.startRank) else { return }
        guard let endFrame = extent.rect(span.endRank) else { return }

        let top = extent.isOnScreen(span.startRank) ? topFrame.minY + 2 : topFrame.minY
        let end = extent.isOnScreen(span.endRank) ? endFrame.maxY - 4 : endFrame.maxY

        let bubbleRanksInSpan = span.nodes.filter { $0.kind == .bubble }.map(\.rank)
        let liveTo: CGFloat
        if let lastBubbleRank = bubbleRanksInSpan.max(), let lastFrame = extent.rect(lastBubbleRank) {
            liveTo = lastFrame.maxY
        } else if let lastNode = span.nodes.last, let anchorFrame = extent.rect(lastNode.rank) {
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

        // Naissance — une amorce pleine, pour qu'on voie la branche APPARAÎTRE
        // (seulement si sa naissance est dans le champ).
        if extent.isOnScreen(span.startRank) {
            let birthRadius: CGFloat = 2.6
            context.fill(
                Path(ellipseIn: CGRect(x: cx - birthRadius, y: top - birthRadius, width: birthRadius * 2, height: birthRadius * 2)),
                with: .color(color)
            )
        }

        // Nœuds `.addressed` — reparue pour recevoir une réponse : anneau
        // creux en pointillé, AUCUNE bulle.
        for node in span.nodes where node.kind == .addressed {
            guard extent.isOnScreen(node.rank), let nodeFrame = extent.rect(node.rank) else { continue }
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

    /// Un segment sans aucun nœud à l'écran TRAVERSE pourtant le champ s'il
    /// commence au-dessus et finit au-dessous : sa ligne passe devant le
    /// lecteur, elle se trace.
    private func spanCrossesViewport(_ span: RiverLaneResolver.RiverLaneSpan, extent: RankExtent) -> Bool {
        RiverCanvasRankPlacement.resolve(rank: span.startRank, known: extent.known) == .above
            && RiverCanvasRankPlacement.resolve(rank: span.endRank, known: extent.known) == .below
    }

    private func laneColor(seed: String) -> Color {
        Color(hex: DynamicColorGenerator.colorForName(seed))
    }
}
