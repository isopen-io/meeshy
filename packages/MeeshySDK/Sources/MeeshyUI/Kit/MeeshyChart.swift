import SwiftUI

/// **Le graphique (K50)** : une série de points opaques tracée dans l'un de sept
/// genres (barres, courbe, anneau, entonnoir, répartition, bande, bulles). Il nomme
/// ce qui compte (le pic, aujourd'hui, une période) et se tait sur le reste : une
/// teinte par série, un seul point éclairé, pas de valeur sur chaque barre.
///
/// Il ne calcule rien d'autre que la géométrie de ce qu'on lui donne : ni charge, ni
/// agrégation, ni format de date. Chaque valeur est dite à l'accessibilité
/// (`point.spoken`), et le graphique entier par `summary`. Sans `selection`, il est en
/// lecture seule : aucune cible, aucun geste.
public struct MeeshyChart<Center: View>: View {
    let kind: MeeshyChartKind
    let points: [MeeshyChartPoint]
    let summary: String
    let tint: Color?
    let size: MeeshyChartSize
    let markers: [MeeshyChartMarker]
    let axisLabels: [String]
    let selection: Binding<String?>?
    let callout: ((String) -> MeeshyChartCallout?)?
    let layout: MeeshyChartLayout
    let isLoading: Bool
    let emptyText: String?
    let animatesEntry: Bool
    let center: Center

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @State private var hasAppeared = false

    public init(kind: MeeshyChartKind,
                points: [MeeshyChartPoint],
                summary: String,
                tint: Color? = nil,
                size: MeeshyChartSize = .regular,
                markers: [MeeshyChartMarker] = [.peak],
                axisLabels: [String] = [],
                selection: Binding<String?>? = nil,
                callout: ((String) -> MeeshyChartCallout?)? = nil,
                layout: MeeshyChartLayout = .stacked,
                isLoading: Bool = false,
                emptyText: String? = nil,
                animatesEntry: Bool = true,
                @ViewBuilder center: () -> Center) {
        self.kind = kind
        self.points = points
        self.summary = summary
        self.tint = tint
        self.size = size
        self.markers = markers
        self.axisLabels = Array(axisLabels.prefix(MeeshyChartRecipe.maxAxisLabels))
        self.selection = selection
        self.callout = callout
        self.layout = layout
        self.isLoading = isLoading
        self.emptyText = emptyText
        self.animatesEntry = animatesEntry
        self.center = center()
    }

    var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    var recipe: MeeshyChartRecipe {
        MeeshyChartRecipe.resolve(kind: kind, size: size, pointCount: points.count)
    }

    var accent: Color { tint ?? MeeshyColors.brandPrimary }

    public var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if isLoading {
                MeeshySkeleton(shape: .card(aspect: 2.4, radius: MeeshyRadius.lg))
            } else if recipe.isEmpty {
                emptyView
            } else {
                calloutView
                plot
                axis
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(summary)
        .accessibilityChildren {
            ForEach(points) { point in
                Text(MeeshyChartScale.accessibilityValues([point]).first ?? point.label)
            }
        }
        .onAppear { hasAppeared = true }
    }

    private var emptyView: some View {
        Text(verbatim: emptyText ?? summary)
            .meeshyScaledFont(MeeshyFont.subheadSize)
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, minHeight: CGFloat(recipe.plotHeight), alignment: .center)
    }

    private var calloutText: MeeshyChartCallout? {
        if let chosen = selection?.wrappedValue { return callout?(chosen) }
        guard markers.contains(.peak), let index = MeeshyChartScale.peak(points.map(\.servedValue)) else { return nil }
        return callout?(points[index].id)
    }

    @ViewBuilder
    private var calloutView: some View {
        if let text = calloutText {
            HStack(spacing: MeeshySpacing.sm) {
                Text(verbatim: text.title).meeshyScaledFont(MeeshyFont.smallSize).foregroundStyle(.secondary)
                Text(verbatim: text.value).meeshyScaledFont(MeeshyFont.subheadSize, weight: .bold).monospacedDigit()
                if let note = text.note {
                    Text(verbatim: note).meeshyScaledFont(MeeshyFont.smallSize).foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder
    private var axis: some View {
        if axisLabels.count >= 2 {
            HStack {
                ForEach(Array(axisLabels.enumerated()), id: \.offset) { index, text in
                    Text(verbatim: text).meeshyScaledFont(MeeshyFont.footnoteSize).foregroundStyle(.secondary)
                    if index < axisLabels.count - 1 { Spacer(minLength: 0) }
                }
            }
        }
    }

    private var plot: some View {
        let shown = hasAppeared || !animatesEntry || reduceMotion ? 1.0 : 0.0
        return GeometryReader { proxy in
            shapes(in: proxy.size)
                .opacity(shown == 1 ? 1 : 0.4)
                .animation(MeeshyChartRecipe.entryAnimation(reduce: reduceMotion), value: shown)
                .contentShape(Rectangle())
                .gesture(selectionGesture(width: Double(proxy.size.width)),
                         including: MeeshyChartRecipe.armsSelectionGesture(hasSelection: selection != nil) ? .all : .subviews)
        }
        .frame(minHeight: CGFloat(recipe.plotHeight),
               maxHeight: MeeshyChartRecipe.fillsHostHeight(kind) ? .infinity : CGFloat(recipe.plotHeight))
    }

    private func selectionGesture(width: Double) -> some Gesture {
        DragGesture(minimumDistance: 0).onChanged { value in
            guard let selection,
                  let index = MeeshyChartRecipe.index(forX: Double(value.location.x), width: width, count: points.count) else { return }
            let id = points[index].id
            guard selection.wrappedValue != id else { return }
            HapticFeedback.light()
            selection.wrappedValue = id
        }
    }
}

extension MeeshyChart where Center == EmptyView {
    public init(kind: MeeshyChartKind,
                points: [MeeshyChartPoint],
                summary: String,
                tint: Color? = nil,
                size: MeeshyChartSize = .regular,
                markers: [MeeshyChartMarker] = [.peak],
                axisLabels: [String] = [],
                selection: Binding<String?>? = nil,
                callout: ((String) -> MeeshyChartCallout?)? = nil,
                layout: MeeshyChartLayout = .stacked,
                isLoading: Bool = false,
                emptyText: String? = nil,
                animatesEntry: Bool = true) {
        self.init(kind: kind, points: points, summary: summary, tint: tint, size: size, markers: markers,
                  axisLabels: axisLabels, selection: selection, callout: callout, layout: layout, isLoading: isLoading,
                  emptyText: emptyText, animatesEntry: animatesEntry, center: { EmptyView() })
    }
}
