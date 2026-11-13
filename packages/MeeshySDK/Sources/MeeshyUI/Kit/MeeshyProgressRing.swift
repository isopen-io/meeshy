import SwiftUI

/// La teinte de l'arc : l'encre du ton (par défaut), une couleur unie (un accent,
/// le rouge de la prise) ou un dégradé. La piste reprend la teinte à 30 %.
public nonisolated enum MeeshyProgressRingTint: Sendable, Equatable {
    case ink
    case solid(Color)
    case gradient([Color])
}

extension MeeshyProgressRingTint {
    /// La couleur de la piste : l'encre, la teinte unie, ou le premier arrêt.
    func trackColor(ink: Color) -> Color {
        switch self {
        case .ink: return ink
        case .solid(let color): return color
        case .gradient(let colors): return colors.first ?? ink
        }
    }

    /// Le style de l'arc : l'encre, la teinte unie, ou un dégradé angulaire.
    func arcStyle(ink: Color) -> AnyShapeStyle {
        switch self {
        case .ink: return AnyShapeStyle(ink)
        case .solid(let color): return AnyShapeStyle(color)
        case .gradient(let colors): return AnyShapeStyle(AngularGradient(colors: colors, center: .center))
        }
    }
}

/// **L'anneau de progression (K09)** : un seul anneau dit où en est une opération
/// en vol. Une piste, un arc qui avance depuis midi dans le sens horaire, et au
/// centre un chiffre ou ce que l'hôte y pose.
///
/// Agnostique : `progress` est une fraction 0…1 (absente = indéterminé), `label`
/// le nom de l'opération déjà traduit (`nil` = décoratif, l'hôte parle à sa
/// place), `valueText` remplace la valeur dite. Aucun verre, aucun geste, aucune
/// couleur en dur : l'encre vient du ton, la teinte de l'hôte.
///
/// Performance : l'arc, le balayage et le chiffre sont trois feuilles
/// `Equatable` ; seul le changement de leurs VALEURS les redessine, et le chiffre
/// ne change qu'au pourcentage entier.
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
    @Environment(\.locale) private var locale

    public init(progress: Double?,
                label: String?,
                valueText: String? = nil,
                diameter: CGFloat = MeeshyControlSize.tapTarget,
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
        let ink = recipe.inkColor(isDark: colorScheme == .dark)
        ZStack {
            if scrim {
                Circle().fill(MeeshyColors.scrim)
            }
            Circle()
                .stroke(tint.trackColor(ink: ink).opacity(recipe.trackOpacity), lineWidth: recipe.stroke)
                .frame(width: recipe.radius * 2, height: recipe.radius * 2)
            if !recipe.isIndeterminate {
                MeeshyProgressRingArc(fraction: recipe.arcFraction, radius: recipe.radius, stroke: recipe.stroke,
                                      tint: tint, ink: ink, animates: !recipe.reduceMotion)
                    .equatable()
            }
            if recipe.sweeps {
                MeeshyProgressRingSweep(radius: recipe.radius, stroke: recipe.stroke, tint: tint, ink: ink,
                                        spins: recipe.spins)
                    .equatable()
                    .id(recipe.spins)
            }
            centerContent(recipe: recipe, ink: ink)
        }
        .frame(width: recipe.diameter, height: recipe.diameter)
        .allowsHitTesting(false)
        .modifier(MeeshyProgressRingAccessibility(label: label,
                                                  valueText: valueText,
                                                  percent: recipe.percent,
                                                  progress: recipe.fraction))
    }

    private var hasCenter: Bool { Center.self != EmptyView.self }

    private var recipeValue: MeeshyProgressRingRecipe {
        MeeshyProgressRingRecipe.resolve(progress: progress,
                                         diameter: Double(diameter),
                                         sweeps: sweeps,
                                         showsPercent: showsPercent,
                                         hasCenter: hasCenter,
                                         tone: tone ?? hostTone,
                                         reduceMotion: reduceMotion,
                                         increasedContrast: colorSchemeContrast == .increased)
    }

    @ViewBuilder
    private func centerContent(recipe: MeeshyProgressRingRecipe, ink: Color) -> some View {
        if hasCenter {
            center
                .frame(width: recipe.innerDiameter, height: recipe.innerDiameter)
                .clipShape(Circle())
                .accessibilityHidden(true)
        } else if let digits = recipe.digits, let size = recipe.digitSize {
            MeeshyProgressRingDigits(
                text: MeeshyProgressRingRecipe.digitsText(digits, showsSign: recipe.showsSign, locale: locale),
                size: size,
                ink: ink
            )
            .equatable()
            .frame(width: recipe.innerDiameter)
        }
    }
}

extension MeeshyProgressRing where Center == EmptyView {
    public init(progress: Double?,
                label: String?,
                valueText: String? = nil,
                diameter: CGFloat = MeeshyControlSize.tapTarget,
                tint: MeeshyProgressRingTint = .ink,
                showsPercent: Bool = true,
                sweeps: Bool = false,
                scrim: Bool = false,
                tone: MeeshyGlassTone? = nil) {
        self.init(progress: progress, label: label, valueText: valueText, diameter: diameter, tint: tint,
                  showsPercent: showsPercent, sweeps: sweeps, scrim: scrim, tone: tone, center: { EmptyView() })
    }
}

/// L'arc qui avance depuis midi : il rejoint chaque nouvelle valeur en 200 ms,
/// linéaire, ou y saute sous « réduire les animations ». Seule la longueur du
/// tracé s'anime, jamais la mise en page.
struct MeeshyProgressRingArc: View, Equatable {
    let fraction: Double
    let radius: Double
    let stroke: Double
    let tint: MeeshyProgressRingTint
    let ink: Color
    let animates: Bool

    var body: some View {
        Circle()
            .trim(from: 0, to: fraction)
            .stroke(tint.arcStyle(ink: ink), style: StrokeStyle(lineWidth: stroke, lineCap: .round))
            .frame(width: radius * 2, height: radius * 2)
            .rotationEffect(.degrees(-90))
            .animation(MeeshyProgressRingRecipe.arcAnimation(animates: animates), value: fraction)
    }
}

/// Le balayage : un arc de 18 % qui tourne en 1,1 s, sans fin. La phase est
/// MONOTONE (jamais remise à zéro, patron de `StorySaveProgressRing`) : un
/// `@State` déjà à sa valeur finale ne relancerait aucune animation à la
/// réapparition suivante. Immobile à midi sous « réduire les animations ».
struct MeeshyProgressRingSweep: View, Equatable {
    let radius: Double
    let stroke: Double
    let tint: MeeshyProgressRingTint
    let ink: Color
    let spins: Bool

    @State private var phase: Double = 0

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.radius == rhs.radius && lhs.stroke == rhs.stroke && lhs.tint == rhs.tint
            && lhs.ink == rhs.ink && lhs.spins == rhs.spins
    }

    var body: some View {
        Circle()
            .trim(from: 0, to: MeeshyProgressRingRecipe.sweepFraction)
            .stroke(tint.arcStyle(ink: ink), style: StrokeStyle(lineWidth: stroke, lineCap: .round))
            .frame(width: radius * 2, height: radius * 2)
            .rotationEffect(.degrees(phase * 360 - 90))
            .animation(spins ? MeeshyProgressRingRecipe.spinAnimation : nil, value: phase)
            .onAppear {
                guard spins else { return }
                phase += 1
            }
    }
}

/// Le chiffre : gras, tabulaire, figé au diamètre (pas au Dynamic Type), réduit
/// jusqu'à 60 % plutôt que déborder. Masqué aux lecteurs d'écran : la valeur
/// est dite par l'anneau.
struct MeeshyProgressRingDigits: View, Equatable {
    let text: String
    let size: CGFloat
    let ink: Color

    var body: some View {
        Text(verbatim: text)
            .font(MeeshyProgressRingRecipe.font(size: size))
            .monospacedDigit()
            .foregroundStyle(ink)
            .lineLimit(1)
            .minimumScaleFactor(MeeshyProgressRingRecipe.digitsMinimumScale)
            .accessibilityHidden(true)
    }
}

/// Un seul élément d'accessibilité : rôle d'indicateur (un `ProgressView`
/// représenté), nom, valeur dite. Sans nom (`label` nil), l'anneau sort de
/// l'arbre. Jamais une zone vivante : l'hôte annonce le début et la fin.
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
