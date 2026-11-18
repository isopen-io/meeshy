import SwiftUI

/// Le tracé des sept genres de `MeeshyChart` : une teinte par série, un seul point éclairé.
extension MeeshyChart {

    @ViewBuilder
    func shapes(in size: CGSize) -> some View {
        let values = points.map(\.servedValue)
        let marked = Set(markers.flatMap { MeeshyChartRecipe.markedIndexes($0, ids: points.map(\.id), values: values) })
        switch kind {
        case .bars: bars(values: values, marked: marked)
        case .line: line(values: values, marked: marked, size: size)
        case .donut: donut(values: values)
        case .funnel: funnel(values: values)
        case .breakdown: breakdown(values: values)
        case .strip: strip(values: values)
        case .bubbles: bubbles(values: values, size: size)
        }
    }

    private func color(of index: Int) -> Color {
        points[index].tint ?? accent
    }

    private func isLit(_ index: Int, marked: Set<Int>) -> Bool {
        if let chosen = selection?.wrappedValue { return points[index].id == chosen }
        return marked.contains(index) || marked.isEmpty
    }

    private func bars(values: [Double], marked: Set<Int>) -> some View {
        let scale = MeeshyChartScale.normalized(values)
        return HStack(alignment: .bottom, spacing: MeeshySpacing.xs) {
            ForEach(Array(scale.enumerated()), id: \.offset) { index, fraction in
                RoundedRectangle(cornerRadius: MeeshyRadius.xxs, style: .continuous)
                    .fill(color(of: index).opacity(isLit(index, marked: marked) ? 1 : 0.45))
                    .frame(maxWidth: .infinity)
                    .frame(height: max(CGFloat(fraction) * CGFloat(recipe.plotHeight), 2))
            }
        }
        .frame(maxHeight: .infinity, alignment: .bottom)
    }

    private func line(values: [Double], marked: Set<Int>, size: CGSize) -> some View {
        let scale = MeeshyChartScale.normalized(values)
        let step = scale.count > 1 ? size.width / CGFloat(scale.count - 1) : 0
        let height = size.height
        let positions = scale.enumerated().map { CGPoint(x: CGFloat($0.offset) * step, y: height - CGFloat($0.element) * height) }
        return ZStack(alignment: .topLeading) {
            Path { path in
                guard let first = positions.first else { return }
                path.move(to: first)
                positions.dropFirst().forEach { path.addLine(to: $0) }
            }
            .stroke(accent, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
            ForEach(Array(positions.enumerated()), id: \.offset) { index, point in
                if isLit(index, marked: marked) && (!marked.isEmpty || selection?.wrappedValue != nil) {
                    Circle().fill(accent).frame(width: 10, height: 10)
                        .overlay(Circle().strokeBorder(Color.white, lineWidth: 2))
                        .position(point)
                }
            }
        }
    }

    private func donut(values: [Double]) -> some View {
        let arcs = MeeshyChartScale.arcs(MeeshyChartScale.segments(values))
        let diameter = CGFloat(MeeshyChartRecipe.donutDiameter)
        return ZStack {
            ForEach(Array(arcs.enumerated()), id: \.offset) { index, arc in
                Circle()
                    .trim(from: CGFloat((arc.start + 90) / 360), to: CGFloat((arc.end + 90) / 360))
                    .stroke(color(of: index).opacity(index == 0 ? 1 : max(1 - Double(index) * 0.22, 0.3)),
                            style: StrokeStyle(lineWidth: 14, lineCap: .butt))
                    .rotationEffect(.degrees(-90))
            }
            center
        }
        .frame(width: diameter, height: diameter)
        .frame(maxWidth: .infinity)
    }

    private func funnel(values: [Double]) -> some View {
        let scale = MeeshyChartScale.normalized(values)
        let hops = MeeshyChartRecipe.shownHops(points.map(\.hop))
        return VStack(spacing: MeeshySpacing.xs) {
            ForEach(Array(scale.enumerated()), id: \.offset) { index, fraction in
                RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
                    .fill(color(of: index).opacity(max(1 - Double(index) * 0.2, 0.3)))
                    .frame(maxWidth: .infinity)
                    .frame(height: CGFloat(MeeshyChartRecipe.funnelStageHeight) - MeeshySpacing.xs)
                    .scaleEffect(x: max(CGFloat(fraction), 0.08), y: 1)
                    .overlay(Text(verbatim: points[index].label).meeshyScaledFont(MeeshyFont.smallSize, weight: .semibold).foregroundStyle(Color.white))
                if hops[index], let hop = points[index].hop {
                    funnelHop(hop)
                }
            }
        }
    }

    private func funnelHop(_ text: String) -> some View {
        HStack(spacing: MeeshySpacing.xs) {
            Image(systemName: "chevron.down").meeshyScaledFont(MeeshyFont.footnoteSize, weight: .bold)
            Text(verbatim: text).meeshyScaledFont(MeeshyFont.smallSize, weight: .semibold)
        }
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity)
        .frame(height: CGFloat(MeeshyChartRecipe.funnelHopHeight) - MeeshySpacing.xs)
    }

    private func breakdown(values: [Double]) -> some View {
        let parts = MeeshyChartScale.segments(values)
        return VStack(spacing: MeeshySpacing.smPlus) {
            ForEach(Array(points.enumerated()), id: \.element.id) { index, point in
                let bar = MeeshyMeter(value: parts[index], total: 1, label: point.spoken.isEmpty ? point.label : point.spoken,
                                      tint: color(of: index), size: .s8, animatesOnAppear: false)
                if layout == .inline {
                    HStack(spacing: MeeshySpacing.sm) {
                        Text(verbatim: point.label).meeshyScaledFont(MeeshyFont.subheadSize).frame(minWidth: 72, alignment: .leading)
                        bar
                    }
                } else {
                    VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                        Text(verbatim: point.label).meeshyScaledFont(MeeshyFont.subheadSize)
                        bar
                    }
                }
            }
        }
    }

    private func strip(values: [Double]) -> some View {
        let parts = MeeshyChartScale.segments(values)
        return GeometryReader { proxy in
            HStack(spacing: 2) {
                ForEach(Array(parts.enumerated()), id: \.offset) { index, part in
                    Capsule().fill(color(of: index).opacity(max(1 - Double(index) * 0.2, 0.3)))
                        .frame(width: max(part * Double(proxy.size.width) - 2, 0))
                }
            }
        }
        .frame(height: CGFloat(MeeshyChartRecipe.stripHeight))
    }

    /// Les bulles : un disque chiffré par point, son aire suivant la valeur, posé où l'hôte le dit (le fond est à lui).
    private func bubbles(values: [Double], size: CGSize) -> some View {
        let scale = MeeshyChartScale.normalized(values)
        return ZStack(alignment: .topLeading) {
            ForEach(Array(scale.enumerated()), id: \.offset) { index, fraction in
                let diameter = MeeshyChartRecipe.bubbleDiameter(fraction: fraction)
                let position = points[index].position ?? (scale.count > 1 ? Double(index) / Double(scale.count - 1) : 0.5)
                let center = MeeshyChartRecipe.bubbleCenter(position: position, elevation: points[index].elevation,
                                                            diameter: diameter, width: Double(size.width),
                                                            height: Double(size.height))
                bubble(index: index, diameter: diameter)
                    .position(center)
            }
        }
    }

    private func bubble(index: Int, diameter: Double) -> some View {
        Circle().fill(color(of: index).opacity(0.46))
            .overlay(Circle().strokeBorder(color(of: index).opacity(0.75), lineWidth: 1.5))
            .overlay(
                Text(verbatim: points[index].label)
                    .meeshyScaledFont(CGFloat(MeeshyChartRecipe.bubbleFontSize(diameter: diameter)),
                                      weight: .black, design: .rounded)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .foregroundStyle(.primary)
                    .padding(MeeshySpacing.xs)
            )
            .frame(width: CGFloat(diameter), height: CGFloat(diameter))
    }
}
