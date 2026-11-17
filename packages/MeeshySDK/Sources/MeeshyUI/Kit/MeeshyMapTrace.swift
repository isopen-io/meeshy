import SwiftUI

/// **Le tracé de carte (K54)** : il relie des points d'écran déjà projetés par l'hôte,
/// à la teinte passée, sur un liseré sombre qui le garde lisible sur toute carte. Les
/// points défilent du premier vers le dernier (`route`, `link`) ; `history` va du plus
/// pâle au plein et suit une position de 0 à 1 avec sa tête de lecture.
///
/// Il ne calcule aucun itinéraire, aucune distance, ne parle à aucun fournisseur de
/// carte et ne dessine personne : l'épingle (K36) se pose dessus, par l'hôte.
public struct MeeshyMapTrace<MidLabel: View>: View {
    private let label: String
    private let points: [CGPoint]
    private let kind: MeeshyMapTraceKind
    private let weight: MeeshyMapTraceWeight
    private let tint: Color
    private let progress: Double?
    private let stops: [MeeshyMapTraceStop]
    private let isStale: Bool
    private let isAnimated: Bool
    private let smoothing: Bool
    private let onLightMap: Bool
    private let onStopPress: ((String) -> Void)?
    private let midLabel: MidLabel

    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    public init(label: String,
                points: [CGPoint],
                kind: MeeshyMapTraceKind = .route,
                weight: MeeshyMapTraceWeight = .regular,
                tint: Color = MeeshyColors.brandPrimary,
                progress: Double? = nil,
                stops: [MeeshyMapTraceStop] = [],
                isStale: Bool = false,
                isAnimated: Bool = true,
                smoothing: Bool = true,
                onLightMap: Bool = false,
                onStopPress: ((String) -> Void)? = nil,
                @ViewBuilder midLabel: () -> MidLabel) {
        assert(!label.isEmpty, "MeeshyMapTrace : label obligatoire")
        self.label = label
        self.points = points
        self.kind = kind
        self.weight = weight
        self.tint = tint
        self.progress = progress
        self.stops = stops
        self.isStale = isStale
        self.isAnimated = isAnimated
        self.smoothing = smoothing
        self.onLightMap = onLightMap
        self.onStopPress = onStopPress
        self.midLabel = midLabel()
    }

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    public var body: some View {
        if let path = MeeshyMapTracePath.resolve(points: points, kind: kind) {
            let recipe = MeeshyMapTraceRecipe.resolve(kind: kind, weight: weight, progress: progress, isStale: isStale,
                                                      onLightMap: onLightMap, isAnimated: isAnimated, reduceMotion: reduceMotion)
            ZStack {
                drawing(path: path, recipe: recipe)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(label)
                    .accessibilityAddTraits(.isImage)
                nodes(path: path, recipe: recipe)
                head(path: path, recipe: recipe)
                midLabel.position(midPosition(path: path))
                stopLabels(path: path)
            }
            .saturation(recipe.isDesaturated ? 0 : 1)
            .opacity(recipe.opacity)
        }
    }

    private func shape(path: MeeshyMapTracePath) -> Path {
        MeeshyMapTraceShape.curve(through: path.points, smoothing: smoothing && kind != .link)
    }

    @ViewBuilder
    private func drawing(path: MeeshyMapTracePath, recipe: MeeshyMapTraceRecipe) -> some View {
        let curve = shape(path: path)
        let drawn = recipe.progress ?? 1
        let ink = Color(red: 0.043, green: 0.043, blue: 0.071)
        ZStack {
            if recipe.kind == .history {
                curve.stroke(tint.opacity(MeeshyMapTraceRecipe.historyHaloOpacity),
                             style: StrokeStyle(lineWidth: CGFloat(recipe.casingWidth), lineCap: .round, lineJoin: .round))
                curve.trim(from: 0, to: CGFloat(drawn))
                    .stroke(historyGradient(path: path),
                            style: StrokeStyle(lineWidth: CGFloat(recipe.strokeWidth), lineCap: .round, lineJoin: .round))
            } else {
                curve.trim(from: 0, to: CGFloat(drawn))
                    .stroke(ink.opacity(recipe.casingOpacity),
                            style: StrokeStyle(lineWidth: CGFloat(recipe.casingWidth), lineCap: .round, lineJoin: .round))
                flowingDots(curve: curve, recipe: recipe, drawn: drawn)
            }
        }
        .animation(MeeshyMapTraceRecipe.drawAnimation(reduce: reduceMotion), value: drawn)
    }

    private func historyGradient(path: MeeshyMapTracePath) -> LinearGradient {
        let first = path.points.first ?? .zero
        let last = path.points.last ?? .zero
        let stops = MeeshyMapTraceRecipe.historyStops.map { Gradient.Stop(color: tint.opacity($0.opacity), location: CGFloat($0.location)) }
        return LinearGradient(stops: stops,
                              startPoint: UnitPoint(x: 0, y: 0), endPoint: UnitPoint(x: first.x <= last.x ? 1 : 0, y: 1))
    }

    @ViewBuilder
    private func flowingDots(curve: Path, recipe: MeeshyMapTraceRecipe, drawn: Double) -> some View {
        let dash = [CGFloat(0.01), CGFloat(recipe.dotGap)]
        if recipe.dotsFlow {
            TimelineView(.animation) { context in
                let seconds = context.date.timeIntervalSinceReferenceDate
                let phase = CGFloat(-(seconds / MeeshyMapTraceRecipe.flowSeconds).truncatingRemainder(dividingBy: 1) * MeeshyMapTraceRecipe.flowDistance)
                curve.trim(from: 0, to: CGFloat(drawn))
                    .stroke(tint, style: StrokeStyle(lineWidth: CGFloat(recipe.strokeWidth), lineCap: .round, dash: dash, dashPhase: phase))
            }
        } else {
            curve.trim(from: 0, to: CGFloat(drawn))
                .stroke(tint, style: StrokeStyle(lineWidth: CGFloat(recipe.strokeWidth), lineCap: .round, dash: dash))
        }
    }

    @ViewBuilder
    private func nodes(path: MeeshyMapTracePath, recipe: MeeshyMapTraceRecipe) -> some View {
        ForEach(Array(stops.enumerated()), id: \.element.id) { order, stop in
            if let fraction = path.fraction(ofPointAt: stop.pointIndex) {
                let age = stops.count > 1 ? 0.55 + 0.45 * Double(order) / Double(stops.count - 1) : 1
                Circle()
                    .fill(Color(red: 0.043, green: 0.043, blue: 0.071))
                    .overlay(Circle().strokeBorder(tint, lineWidth: CGFloat(MeeshyMapTraceRecipe.nodeRing)))
                    .frame(width: CGFloat(MeeshyMapTraceRecipe.nodeDiameter), height: CGFloat(MeeshyMapTraceRecipe.nodeDiameter))
                    .opacity(age)
                    .position(path.point(atFraction: fraction))
                    .accessibilityHidden(true)
            }
        }
    }

    @ViewBuilder
    private func head(path: MeeshyMapTracePath, recipe: MeeshyMapTraceRecipe) -> some View {
        if recipe.showsHead, let progress = recipe.progress {
            let diameter = CGFloat(MeeshyMapTraceRecipe.headDiameter)
            Circle().fill(Color.white)
                .overlay(Circle().strokeBorder(tint, lineWidth: CGFloat(MeeshyMapTraceRecipe.headRing)))
                .background(Circle().fill(tint.opacity(MeeshyOpacity.light)).padding(-CGFloat(MeeshyMapTraceRecipe.headHalo)))
                .frame(width: diameter, height: diameter)
                .position(path.point(atFraction: progress))
                .animation(MeeshyMapTraceRecipe.drawAnimation(reduce: reduceMotion), value: progress)
                .accessibilityHidden(true)
        }
    }

    private func midPosition(path: MeeshyMapTracePath) -> CGPoint {
        let middle = path.point(atFraction: 0.5)
        return CGPoint(x: middle.x, y: middle.y - 12)
    }

    @ViewBuilder
    private func stopLabels(path: MeeshyMapTracePath) -> some View {
        ForEach(stops) { stop in
            if let fraction = path.fraction(ofPointAt: stop.pointIndex) {
                let text = HStack(spacing: MeeshySpacing.xs) {
                    Text(verbatim: stop.value).font(MeeshyFont.relative(11.5, weight: .semibold)).monospacedDigit().foregroundStyle(tint)
                    Text(verbatim: stop.title).meeshyScaledFont(MeeshyFont.smallSize, weight: .bold)
                }
                .padding(.horizontal, MeeshySpacing.smPlus)
                .frame(minHeight: 30)
                .background(Capsule().fill(.ultraThinMaterial))
                if let onStopPress {
                    Button { onStopPress(stop.id) } label: { text }
                        .buttonStyle(.plain)
                        .frame(minHeight: CGFloat(MeeshyControlSize.tapTarget))
                        .accessibilityLabel("\(stop.value), \(stop.title)")
                        .position(labelPosition(path: path, fraction: fraction))
                } else {
                    text.position(labelPosition(path: path, fraction: fraction))
                        .accessibilityLabel("\(stop.value), \(stop.title)")
                }
            }
        }
    }

    private func labelPosition(path: MeeshyMapTracePath, fraction: Double) -> CGPoint {
        let anchor = path.point(atFraction: fraction)
        return CGPoint(x: anchor.x, y: anchor.y - 28)
    }
}

extension MeeshyMapTrace where MidLabel == EmptyView {
    public init(label: String,
                points: [CGPoint],
                kind: MeeshyMapTraceKind = .route,
                weight: MeeshyMapTraceWeight = .regular,
                tint: Color = MeeshyColors.brandPrimary,
                progress: Double? = nil,
                stops: [MeeshyMapTraceStop] = [],
                isStale: Bool = false,
                isAnimated: Bool = true,
                smoothing: Bool = true,
                onLightMap: Bool = false,
                onStopPress: ((String) -> Void)? = nil) {
        self.init(label: label, points: points, kind: kind, weight: weight, tint: tint, progress: progress,
                  stops: stops, isStale: isStale, isAnimated: isAnimated, smoothing: smoothing,
                  onLightMap: onLightMap, onStopPress: onStopPress, midLabel: { EmptyView() })
    }
}

/// La courbe du tracé : une polyligne, ou une courbe lissée qui passe par chaque point (Catmull-Rom).
enum MeeshyMapTraceShape {
    static func curve(through points: [CGPoint], smoothing: Bool) -> Path {
        Path { path in
            guard let first = points.first else { return }
            path.move(to: first)
            guard smoothing, points.count > 2 else {
                points.dropFirst().forEach { path.addLine(to: $0) }
                return
            }
            for index in 1..<points.count {
                let p0 = points[max(index - 2, 0)]
                let p1 = points[index - 1]
                let p2 = points[index]
                let p3 = points[min(index + 1, points.count - 1)]
                let c1 = CGPoint(x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6)
                let c2 = CGPoint(x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6)
                path.addCurve(to: p2, control1: c1, control2: c2)
            }
        }
    }
}
