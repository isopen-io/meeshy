import SwiftUI

/// La teinte de l'arc : l'encre du ton (par défaut), une couleur unie (un accent,
/// le rouge de la prise) ou un dégradé. La piste reprend la teinte à 30 %.
public enum MeeshyProgressRingTint: Sendable, Equatable {
    case ink
    case solid(Color)
    case gradient([Color])
}

/// **L'anneau de progression (K09)** : un seul anneau dit où en est une opération
/// en vol. Une piste, un arc qui avance depuis midi dans le sens horaire, et au
/// centre un chiffre ou ce que l'hôte y pose.
///
/// Agnostique : `progress` est une fraction 0…1 (absente = indéterminé), `label`
/// le nom de l'opération déjà traduit (`nil` = décoratif, l'hôte parle à sa
/// place), `valueText` remplace la valeur dite. Aucun verre, aucun geste, aucune
/// couleur en dur : l'encre vient du ton, la teinte de l'hôte.
public struct MeeshyProgressRing<Center: View>: View {
    private let progress: Double?
    private let label: String?
    private let valueText: String?
    private let diameter: CGFloat
    private let tint: MeeshyProgressRingTint
    private let showsPercent: Bool
    private let sweeps: Bool
    private let scrim: Bool
    private let tone: MeeshyGlassTone?
    private let center: Center

    @Environment(\.meeshyGlassTone) private var hostTone
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorSchemeContrast) private var colorSchemeContrast
    @State private var spin: Double = 0

    public init(progress: Double?,
                label: String?,
                valueText: String? = nil,
                diameter: CGFloat = 44,
                tint: MeeshyProgressRingTint = .ink,
                showsPercent: Bool = true,
                sweeps: Bool = false,
                scrim: Bool = false,
                tone: MeeshyGlassTone? = nil,
                @ViewBuilder center: () -> Center) {
        self.progress = progress
        self.label = label
        self.valueText = valueText
        self.diameter = diameter
        self.tint = tint
        self.showsPercent = showsPercent
        self.sweeps = sweeps
        self.scrim = scrim
        self.tone = tone
        self.center = center()
    }

    public var body: some View {
        let recipe = recipeValue
        let ink = recipe.ink == .themeInk ? MeeshyColors.textPrimary(isDark: colorScheme == .dark) : MeeshyColors.onMedia
        ZStack {
            if scrim {
                Circle()
                    .fill(MeeshyColors.scrim)
                    .frame(width: recipe.diameter, height: recipe.diameter)
            }
            track(recipe: recipe, ink: ink)
            if !recipe.isIndeterminate {
                progressArc(recipe: recipe, ink: ink)
            }
            if recipe.sweeps {
                sweepArc(recipe: recipe, ink: ink)
            }
            digitsOrCenter(recipe: recipe, ink: ink)
        }
        .frame(width: recipe.diameter, height: recipe.diameter)
        .allowsHitTesting(false)
        .onAppear {
            guard recipe.spins else { return }
            withAnimation(recipe.spinAnimation) { spin = 360 }
        }
        .modifier(MeeshyProgressRingAccessibility(label: label,
                                                  valueText: valueText,
                                                  percent: recipe.percent,
                                                  progress: recipe.fraction))
    }

    private var recipeValue: MeeshyProgressRingRecipe {
        MeeshyProgressRingRecipe.resolve(progress: progress,
                                         diameter: Double(diameter),
                                         sweeps: sweeps,
                                         showsPercent: showsPercent,
                                         hasCenter: Center.self != EmptyView.self,
                                         tone: tone ?? hostTone,
                                         reduceMotion: reduceMotion,
                                         increasedContrast: colorSchemeContrast == .increased)
    }

    private func track(recipe: MeeshyProgressRingRecipe, ink: Color) -> some View {
        Circle()
            .stroke(trackColor(ink: ink).opacity(recipe.trackOpacity), lineWidth: recipe.stroke)
            .frame(width: recipe.radius * 2, height: recipe.radius * 2)
    }

    private func progressArc(recipe: MeeshyProgressRingRecipe, ink: Color) -> some View {
        Circle()
            .trim(from: 0, to: recipe.arcFraction)
            .stroke(style: StrokeStyle(lineWidth: recipe.stroke, lineCap: .round))
            .foregroundStyle(strokeStyle(ink: ink))
            .frame(width: recipe.radius * 2, height: recipe.radius * 2)
            .rotationEffect(.degrees(-90))
            .animation(recipe.animation, value: recipe.arcFraction)
    }

    private func sweepArc(recipe: MeeshyProgressRingRecipe, ink: Color) -> some View {
        Circle()
            .trim(from: 0, to: MeeshyProgressRingRecipe.sweepFraction)
            .stroke(style: StrokeStyle(lineWidth: recipe.stroke, lineCap: .round))
            .foregroundStyle(strokeStyle(ink: ink))
            .frame(width: recipe.radius * 2, height: recipe.radius * 2)
            .rotationEffect(.degrees(-90 + (recipe.spins ? spin : 0)))
    }

    @ViewBuilder
    private func digitsOrCenter(recipe: MeeshyProgressRingRecipe, ink: Color) -> some View {
        if Center.self != EmptyView.self {
            center
                .accessibilityHidden(true)
                .frame(width: recipe.diameter - 2 * recipe.stroke, height: recipe.diameter - 2 * recipe.stroke)
        } else if let digits = recipe.digits, let size = recipe.digitSize {
            (Text(IntegerFormatStyle<Int>().format(digits)) + Text(recipe.showsSign ? "%" : ""))
                .font(.system(size: size, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .accessibilityHidden(true)
        }
    }

    private func trackColor(ink: Color) -> Color {
        switch tint {
        case .ink: return ink
        case .solid(let color): return color
        case .gradient(let colors): return colors.first ?? ink
        }
    }

    private func strokeStyle(ink: Color) -> AnyShapeStyle {
        switch tint {
        case .ink: return AnyShapeStyle(ink)
        case .solid(let color): return AnyShapeStyle(color)
        case .gradient(let colors): return AnyShapeStyle(AngularGradient(colors: colors, center: .center))
        }
    }
}

extension MeeshyProgressRing where Center == EmptyView {
    public init(progress: Double?,
                label: String?,
                valueText: String? = nil,
                diameter: CGFloat = 44,
                tint: MeeshyProgressRingTint = .ink,
                showsPercent: Bool = true,
                sweeps: Bool = false,
                scrim: Bool = false,
                tone: MeeshyGlassTone? = nil) {
        self.init(progress: progress, label: label, valueText: valueText, diameter: diameter, tint: tint,
                  showsPercent: showsPercent, sweeps: sweeps, scrim: scrim, tone: tone, center: { EmptyView() })
    }
}

/// Un seul élément d'accessibilité : rôle d'indicateur (un `ProgressView`
/// représenté), nom, valeur dite. Sans nom (`label` nil), l'anneau sort de l'arbre.
private struct MeeshyProgressRingAccessibility: ViewModifier {
    let label: String?
    let valueText: String?
    let percent: Int?
    let progress: Double?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let label {
            let spoken = MeeshyProgressRingWords.spokenValue(percent: percent, valueText: valueText)
            content
                .accessibilityRepresentation {
                    ProgressView(value: progress, total: 1)
                        .accessibilityLabel(label)
                        .accessibilityValue(spoken)
                        .accessibilityAddTraits(.updatesFrequently)
                }
        } else {
            content.accessibilityHidden(true)
        }
    }
}
