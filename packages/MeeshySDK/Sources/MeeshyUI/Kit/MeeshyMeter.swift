import SwiftUI

/// **La jauge (K42)** : une mesure fixe se lit sur une jauge linéaire qui dit sa
/// valeur, sa teinte et ce qu'il reste (23 arrivées sur 50, 64 % de batterie).
/// Elle se lit, elle ne se règle pas : ni cible, ni focus, ni geste.
///
/// Agnostique : deux nombres et des mots déjà traduits ; aucun quota, niveau ou
/// lien nommé. Le remplissage part du bord de début (de la droite en arabe).
/// Une opération en vol sans valeur reste le travail de K09 ; seule la forme
/// `indeterminate` bouge sans fin.
public struct MeeshyMeter<Leading: View, Trailing: View>: View {
    private let value: Double
    private let total: Double
    private let label: String
    private let spokenValue: String?
    private let form: MeeshyMeterForm
    private let kind: MeeshyMeterKind
    private let fullKind: MeeshyMeterKind?
    private let tint: Color?
    private let tintEnd: Color?
    private let size: MeeshyMeterSize
    private let title: String?
    private let valueText: String?
    private let startCaption: String?
    private let endCaption: String?
    private let marks: [Double]
    private let isStale: Bool
    private let animatesOnAppear: Bool
    private let leading: Leading
    private let trailing: Trailing

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.locale) private var locale
    @State private var hasAppeared = false

    public init(value: Double,
                total: Double = 1,
                label: String,
                spokenValue: String? = nil,
                form: MeeshyMeterForm = .continuous,
                kind: MeeshyMeterKind = .accent,
                fullKind: MeeshyMeterKind? = nil,
                tint: Color? = nil,
                tintEnd: Color? = nil,
                size: MeeshyMeterSize = .s8,
                title: String? = nil,
                valueText: String? = nil,
                startCaption: String? = nil,
                endCaption: String? = nil,
                marks: [Double] = [],
                isStale: Bool = false,
                animatesOnAppear: Bool = true,
                @ViewBuilder leading: () -> Leading,
                @ViewBuilder trailing: () -> Trailing) {
        self.value = value
        self.total = total
        self.label = label
        self.spokenValue = spokenValue
        self.form = form
        self.kind = kind
        self.fullKind = fullKind
        self.tint = tint
        self.tintEnd = tintEnd
        self.size = size
        self.title = title
        self.valueText = valueText
        self.startCaption = startCaption
        self.endCaption = endCaption
        self.marks = marks
        self.isStale = isStale
        self.animatesOnAppear = animatesOnAppear
        self.leading = leading()
        self.trailing = trailing()
    }

    public var body: some View {
        let fraction = form == .indeterminate ? nil : MeeshyMeterFraction.resolve(value: value, total: total)
        let recipe = MeeshyMeterRecipe.resolve(form: form, kind: kind, fullKind: fullKind, size: size,
                                               fraction: fraction, isStale: isStale)
        if recipe.isRendered {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                header
                HStack(spacing: MeeshySpacing.sm) {
                    leading
                    track(recipe: recipe)
                    trailing
                }
                captions
            }
            .accessibilityRepresentation {
                ProgressView(value: recipe.fillFraction, total: 1)
                    .accessibilityLabel(label)
                    .accessibilityValue(MeeshyMeterRecipe.spokenValue(spoken: spokenValue,
                                                                      fraction: recipe.fillFraction,
                                                                      locale: locale))
            }
        }
    }

    @ViewBuilder
    private var header: some View {
        if title != nil || valueText != nil {
            HStack(alignment: .firstTextBaseline) {
                if let title { Text(verbatim: title).meeshyScaledFont(MeeshyFont.subheadSize, weight: .semibold) }
                Spacer(minLength: MeeshySpacing.sm)
                if let valueText {
                    Text(verbatim: valueText)
                        .meeshyScaledFont(MeeshyFont.subheadSize)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder
    private var captions: some View {
        if startCaption != nil || endCaption != nil {
            HStack {
                if let startCaption { Text(verbatim: startCaption) }
                Spacer(minLength: MeeshySpacing.sm)
                if let endCaption { Text(verbatim: endCaption) }
            }
            .meeshyScaledFont(MeeshyFont.smallSize)
            .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func track(recipe: MeeshyMeterRecipe) -> some View {
        let isDark = colorScheme == .dark
        let trackColor = MeeshyMeterColors.track(isDark: isDark)
        let style = MeeshyMeterColors.fill(recipe.kind, tint: tint, tintEnd: tintEnd, isDark: isDark)
        let entry = MeeshyMeterRecipe.entryAnimation(reduce: reduceMotion, animatesOnAppear: animatesOnAppear)
        Group {
            switch recipe.form {
            case .stepped:
                steps(recipe: recipe, trackColor: trackColor, style: style)
            case .indeterminate:
                MeeshyMeterIndeterminate(height: CGFloat(recipe.height), trackColor: trackColor, style: style)
            case .continuous:
                continuous(recipe: recipe, trackColor: trackColor, style: style)
            }
        }
        .frame(height: CGFloat(recipe.height))
        .saturation(recipe.isDesaturated ? 0 : 1)
        .opacity(recipe.isDesaturated ? MeeshyOpacity.heavy : 1)
        .animation(entry, value: recipe.fillFraction)
        .onAppear {
            guard !hasAppeared else { return }
            hasAppeared = true
        }
    }

    private func continuous(recipe: MeeshyMeterRecipe, trackColor: Color, style: AnyShapeStyle) -> some View {
        let shown = (hasAppeared || !animatesOnAppear) ? (recipe.fillFraction ?? 0) : 0
        let shownMarks = MeeshyMeterRecipe.visibleMarks(marks, form: recipe.form)
        return GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(trackColor)
                Capsule().fill(style).frame(width: proxy.size.width * CGFloat(shown))
                ForEach(shownMarks, id: \.self) { mark in
                    Rectangle()
                        .fill(MeeshyMeterColors.mark(isDark: colorScheme == .dark))
                        .frame(width: MeeshyBorder.regular, height: CGFloat(recipe.height))
                        .padding(.leading, proxy.size.width * CGFloat(mark))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private func steps(recipe: MeeshyMeterRecipe, trackColor: Color, style: AnyShapeStyle) -> some View {
        HStack(spacing: CGFloat(recipe.stepGap)) {
            ForEach(0..<recipe.segmentCount, id: \.self) { index in
                Capsule()
                    .fill(index < recipe.filledSegmentCount ? style : AnyShapeStyle(trackColor))
            }
        }
    }
}

extension MeeshyMeter where Leading == EmptyView, Trailing == EmptyView {
    public init(value: Double,
                total: Double = 1,
                label: String,
                spokenValue: String? = nil,
                form: MeeshyMeterForm = .continuous,
                kind: MeeshyMeterKind = .accent,
                fullKind: MeeshyMeterKind? = nil,
                tint: Color? = nil,
                tintEnd: Color? = nil,
                size: MeeshyMeterSize = .s8,
                title: String? = nil,
                valueText: String? = nil,
                startCaption: String? = nil,
                endCaption: String? = nil,
                marks: [Double] = [],
                isStale: Bool = false,
                animatesOnAppear: Bool = true) {
        self.init(value: value, total: total, label: label, spokenValue: spokenValue, form: form, kind: kind,
                  fullKind: fullKind, tint: tint, tintEnd: tintEnd, size: size, title: title,
                  valueText: valueText, startCaption: startCaption, endCaption: endCaption, marks: marks,
                  isStale: isStale, animatesOnAppear: animatesOnAppear,
                  leading: { EmptyView() }, trailing: { EmptyView() })
    }
}

/// Le segment sans valeur : il glisse d'un bord à l'autre, immobile sous
/// « réduire les animations ».
private struct MeeshyMeterIndeterminate: View {
    let height: CGFloat
    let trackColor: Color
    let style: AnyShapeStyle

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var phase: CGFloat = 0

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(trackColor)
                Capsule().fill(style)
                    .frame(width: proxy.size.width * MeeshyMeterIndeterminate.segmentShare)
                    .padding(.leading, proxy.size.width * (1 - MeeshyMeterIndeterminate.segmentShare) * phase)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .clipShape(Capsule())
        }
        .frame(height: height)
        .animation(MeeshyMotion.animation(.pulse, reduce: reduceMotion), value: phase)
        .onAppear { phase = reduceMotion ? 0 : 1 }
        .onDisappear { phase = 0 }
    }

    private static let segmentShare: CGFloat = 0.3
}

/// Les couleurs des genres de la jauge : la seule traduction genre vers couleur.
enum MeeshyMeterColors {
    static func fill(_ kind: MeeshyMeterKind, tint: Color?, tintEnd: Color?, isDark: Bool) -> AnyShapeStyle {
        if let tint {
            guard let tintEnd else { return AnyShapeStyle(tint) }
            return AnyShapeStyle(LinearGradient(colors: [tint, tintEnd], startPoint: .leading, endPoint: .trailing))
        }
        switch kind {
        case .accent: return AnyShapeStyle(MeeshyColors.brandPrimary)
        case .ok: return AnyShapeStyle(MeeshyColors.success)
        case .warn: return AnyShapeStyle(MeeshyColors.warning)
        case .err: return AnyShapeStyle(MeeshyColors.error)
        }
    }

    static func track(isDark: Bool) -> Color {
        MeeshyColors.textSecondary(isDark: isDark).opacity(MeeshyOpacity.light)
    }

    static func mark(isDark: Bool) -> Color {
        MeeshyColors.textPrimary(isDark: isDark).opacity(MeeshyOpacity.strong)
    }
}
