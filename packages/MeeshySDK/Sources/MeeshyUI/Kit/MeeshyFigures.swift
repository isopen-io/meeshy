import SwiftUI

/// **Un chiffre (K34)** : la valeur en grand, son unité dessous, au besoin une
/// tendance et un accessoire (la mini-courbe). « 1 284 clics » se lit d'un bloc.
///
/// Agnostique : la valeur arrive DÉJÀ écrite (espaces, « 12 k », « 2,4 Go »), la
/// tendance aussi. Sans valeur, « — » à l'encre discrète et l'unité reste : trois
/// états, une seule forme. Le squelette cède dès qu'une valeur existe. Le chiffre
/// roule quand `value` change, jamais à l'apparition. Le chiffre n'est jamais à
/// la teinte : son contraste ne dépend d'aucune teinte.
public struct MeeshyFigure<Accessory: View>: View {
    private let value: String?
    private let unit: String
    private let trend: MeeshyFigureTrend?
    private let size: MeeshyFigureSize
    private let isLoading: Bool
    private let emptyLabel: String
    private let rolls: Bool
    private let accessory: Accessory

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    public init(value: String?,
                unit: String,
                trend: MeeshyFigureTrend? = nil,
                size: MeeshyFigureSize = .large,
                isLoading: Bool = false,
                emptyLabel: String,
                rolls: Bool = true,
                @ViewBuilder accessory: () -> Accessory) {
        self.value = value
        self.unit = unit
        self.trend = trend
        self.size = size
        self.isLoading = isLoading
        self.emptyLabel = emptyLabel
        self.rolls = rolls
        self.accessory = accessory()
    }

    private var animatesRoll: Bool {
        rolls && !MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    public var body: some View {
        let recipe = MeeshyFiguresRecipe.resolve(size: size, isLoading: isLoading, isEmpty: value == nil,
                                                 hasValue: value != nil)
        let isDark = colorScheme == .dark
        return HStack(alignment: .lastTextBaseline, spacing: MeeshySpacing.sm) {
            VStack(alignment: .leading, spacing: CGFloat(MeeshyFiguresRecipe.unitGap)) {
                if recipe.showsSkeleton {
                    MeeshySkeleton(shape: .line(widthRatio: 0.5))
                        .frame(height: CGFloat(recipe.fontSize))
                } else {
                    valueText(recipe: recipe, isDark: isDark)
                }
                Text(unit)
                    .font(MeeshyFont.relative(CGFloat(MeeshyFiguresRecipe.unitFontSize)))
                    .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                    .lineLimit(1)
                if let trend, !recipe.showsSkeleton { trendPill(trend, isDark: isDark) }
            }
            accessory
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(MeeshyFiguresRecipe.spoken(value: value, unit: unit, emptyLabel: emptyLabel))
        .accessibilityValue(trend?.text ?? "")
    }

    private func valueText(recipe: MeeshyFiguresRecipe, isDark: Bool) -> some View {
        let shown = MeeshyFiguresRecipe.displayedValue(value)
        return Text(shown)
            .font(MeeshyKitFont.exact(recipe.fontSize, weight: .heavy, design: .rounded).monospacedDigit())
            .foregroundStyle(value == nil ? MeeshyColors.textMuted(isDark: isDark) : MeeshyColors.textPrimary(isDark: isDark))
            .lineLimit(1)
            .minimumScaleFactor(CGFloat(MeeshyFiguresRecipe.minimumScale))
            .contentTransition(animatesRoll ? .numericText() : .identity)
            .meeshyAnimation(animatesRoll ? .easeOut(duration: 0.3) : nil, value: shown)
    }

    private func trendPill(_ trend: MeeshyFigureTrend, isDark: Bool) -> some View {
        let color: Color
        switch trend {
        case .up: color = MeeshyColors.success
        case .down: color = MeeshyColors.error
        case .flat: color = MeeshyColors.textSecondary(isDark: isDark)
        }
        return HStack(spacing: 4) {
            Image(systemName: trend.arrowName)
                .font(MeeshyKitFont.exact(MeeshyFiguresRecipe.trendArrow, weight: .bold))
            Text(trend.text).font(MeeshyFont.relative(12, weight: .semibold))
        }
        .foregroundStyle(color)
        .frame(minHeight: CGFloat(MeeshyFiguresRecipe.trendHeight))
    }
}

extension MeeshyFigure where Accessory == EmptyView {
    public init(value: String?,
                unit: String,
                trend: MeeshyFigureTrend? = nil,
                size: MeeshyFigureSize = .large,
                isLoading: Bool = false,
                emptyLabel: String,
                rolls: Bool = true) {
        self.init(value: value, unit: unit, trend: trend, size: size, isLoading: isLoading,
                  emptyLabel: emptyLabel, rolls: rolls, accessory: { EmptyView() })
    }
}

/// Un chiffre de bande, en VALEURS : ce que l'hôte range, sans type du domaine.
public struct MeeshyFigureItem: Equatable, Sendable {
    public let value: String?
    public let unit: String
    public let trend: MeeshyFigureTrend?

    public init(value: String?, unit: String, trend: MeeshyFigureTrend? = nil) {
        self.value = value
        self.unit = unit
        self.trend = trend
    }
}

/// **La bande (K34)** : deux à quatre chiffres, tous de la même taille et sur la
/// même ligne de base, séparés par des filets (jamais au bord). Sous 360 de
/// largeur la bande de quatre passe en compact ; aux grandes tailles, elle
/// s'empile et les filets se couchent. UN élément pour le lecteur d'écran.
public struct MeeshyFigureBand: View {
    private let items: [MeeshyFigureItem]
    private let size: MeeshyFigureSize
    private let isLoading: Bool
    private let emptyLabel: String
    private let onPress: (() -> Void)?

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var width: Double = 390

    public init(items: [MeeshyFigureItem],
                size: MeeshyFigureSize = .large,
                isLoading: Bool = false,
                emptyLabel: String,
                onPress: (() -> Void)? = nil) {
        self.items = Array(items.prefix(4))
        self.size = size
        self.isLoading = isLoading
        self.emptyLabel = emptyLabel
        self.onPress = onPress
    }

    private var recipe: MeeshyFiguresRecipe {
        MeeshyFiguresRecipe.resolve(size: size, count: items.count, width: width, isLoading: isLoading,
                                    isStacked: dynamicTypeSize.isAccessibilitySize)
    }

    public var body: some View {
        let recipe = self.recipe
        let line = MeeshyColors.hairline(isDark: colorScheme == .dark)
        let layout = recipe.separatorsAreHorizontal ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                                                    : AnyLayout(HStackLayout(alignment: .lastTextBaseline, spacing: CGFloat(MeeshyFiguresRecipe.separatorGap)))
        let band = layout {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                if index > 0 && recipe.separatorCount > 0 {
                    Rectangle().fill(line)
                        .frame(width: recipe.separatorsAreHorizontal ? nil : 1, height: recipe.separatorsAreHorizontal ? 1 : CGFloat(recipe.fontSize))
                        .accessibilityHidden(true)
                }
                MeeshyFigure(value: item.value, unit: item.unit, trend: item.trend, size: recipe.size,
                             isLoading: isLoading, emptyLabel: emptyLabel)
                    .accessibilityHidden(true)
            }
        }
        .background(GeometryReader { proxy in
            Color.clear.preference(key: MeeshyFigureBandWidthKey.self, value: Double(proxy.size.width))
        })
        .onPreferenceChange(MeeshyFigureBandWidthKey.self) { width = $0 }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(MeeshyFiguresRecipe.spokenBand(items.map {
            MeeshyFiguresRecipe.spoken(value: $0.value, unit: $0.unit, emptyLabel: emptyLabel)
        }))
        return Group {
            if let onPress {
                Button(action: onPress) { band }
                    .buttonStyle(.plain)
                    .frame(minHeight: 44)
            } else {
                band
            }
        }
    }
}

private struct MeeshyFigureBandWidthKey: PreferenceKey {
    static let defaultValue: Double = 390
    static func reduce(value: inout Double, nextValue: () -> Double) { value = nextValue() }
}

/// **La mini-courbe (K34)** : sept points, ni axe ni graduation, un trait de 2
/// arrondi, l'aire à 14 % et le point final de 6. Une série plus longue ou à axe
/// va à K50. Elle a une PHRASE pour nom (`summary`), jamais sept nombres.
public struct MeeshySpark: View {
    private let points: [Double]
    private let tint: Color?
    private let summary: String

    public init(points: [Double], tint: Color? = nil, summary: String) {
        self.points = points
        self.tint = tint
        self.summary = summary
    }

    public var body: some View {
        let width = MeeshyFiguresRecipe.sparkWidth
        let height = MeeshyFiguresRecipe.sparkHeight
        let drawn = MeeshyFiguresRecipe.sparkPoints(points, width: width, height: height)
        let color = tint ?? Color.accentColor
        return ZStack {
            if let last = drawn.last, let first = drawn.first {
                MeeshySparkArea(points: drawn, height: height).fill(color.opacity(MeeshyFiguresRecipe.sparkAreaOpacity))
                MeeshySparkLine(points: drawn)
                    .stroke(color, style: StrokeStyle(lineWidth: CGFloat(MeeshyFiguresRecipe.sparkStroke),
                                                      lineCap: .round, lineJoin: .round))
                Circle().fill(color)
                    .frame(width: CGFloat(MeeshyFiguresRecipe.sparkDot), height: CGFloat(MeeshyFiguresRecipe.sparkDot))
                    .position(x: CGFloat(last.x), y: CGFloat(last.y))
                    .opacity(first.x <= last.x ? 1 : 0)
            }
        }
        .frame(width: CGFloat(width), height: CGFloat(height))
        .environment(\.layoutDirection, .leftToRight)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(summary)
        .accessibilityAddTraits(.isImage)
    }
}

private struct MeeshySparkLine: Shape {
    let points: [MeeshySparkPoint]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard let first = points.first else { return path }
        path.move(to: CGPoint(x: first.x, y: first.y))
        for point in points.dropFirst() { path.addLine(to: CGPoint(x: point.x, y: point.y)) }
        return path
    }
}

private struct MeeshySparkArea: Shape {
    let points: [MeeshySparkPoint]
    let height: Double

    func path(in rect: CGRect) -> Path {
        var path = MeeshySparkLine(points: points).path(in: rect)
        guard let first = points.first, let last = points.last else { return path }
        path.addLine(to: CGPoint(x: last.x, y: height))
        path.addLine(to: CGPoint(x: first.x, y: height))
        path.closeSubpath()
        return path
    }
}

/// **La rangée de part (K34)** : une pastille de tête, le libellé, la valeur et une
/// jauge de 8 (la `MeeshyMeter` de K42), qui ne descend jamais sous 4. Quatre
/// rangées au plus, de la plus grande à la plus petite : l'ordre est celui de l'hôte.
public struct MeeshyShareBar<Leading: View>: View {
    private let title: String
    private let value: String
    private let share: Double
    private let tint: Color?
    private let leading: Leading

    @Environment(\.colorScheme) private var colorScheme

    public init(title: String,
                value: String,
                share: Double,
                tint: Color? = nil,
                @ViewBuilder leading: () -> Leading) {
        self.title = title
        self.value = value
        self.share = share
        self.tint = tint
        self.leading = leading()
    }

    public var body: some View {
        let isDark = colorScheme == .dark
        let fraction = share.isFinite ? min(max(share, 0), 1) : 0
        return HStack(spacing: MeeshySpacing.md) {
            leading
                .frame(width: CGFloat(MeeshyFiguresRecipe.shareBadge), height: CGFloat(MeeshyFiguresRecipe.shareBadge))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(title)
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                        .lineLimit(1)
                    Spacer(minLength: MeeshySpacing.sm)
                    Text(value)
                        .font(MeeshyFont.relative(17, weight: .heavy, design: .rounded).monospacedDigit())
                        .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                }
                MeeshyMeter(value: fraction, label: title, spokenValue: value, tint: tint, size: .s8)
                    .frame(minHeight: CGFloat(MeeshyFiguresRecipe.shareMinimumFill))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityValue(value)
    }
}
