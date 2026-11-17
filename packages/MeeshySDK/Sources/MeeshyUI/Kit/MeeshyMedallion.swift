import SwiftUI

/// **Le médaillon (K45)** : un glyphe qui nomme une chose sans se toucher est un
/// médaillon teinté, d'une seule recette. Jamais interactif.
///
/// Agnostique : un glyphe (ou une valeur de un à trois caractères) et une teinte
/// opaque ; aucun réglage, trophée ou lien nommé. Décoratif par défaut : sans
/// `label`, il sort de l'arbre d'accessibilité (la rangée ou la phrase de l'hôte
/// parle). Une forme que la plateforme ne trace pas rend un disque de même boîte.
/// Le halo et les ondes ne changent jamais la boîte : aucun voisin ne bouge.
public struct MeeshyMedallion: View {
    private let systemImage: String?
    private let value: String?
    private let kind: MeeshyMedallionKind
    private let tint: Color?
    private let shape: MeeshyMedallionShape
    private let fill: MeeshyMedallionFill
    private let decor: MeeshyMedallionDecor
    private let size: MeeshyMedallionSize
    private let state: MeeshyMedallionState
    private let gradientEnd: Color?
    private let surface: Color?
    private let label: String?
    private let isAnimated: Bool
    private let supportsShape: Bool

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    public init(systemImage: String? = nil,
                value: String? = nil,
                kind: MeeshyMedallionKind = .accent,
                tint: Color? = nil,
                shape: MeeshyMedallionShape = .disc,
                fill: MeeshyMedallionFill = .soft,
                decor: MeeshyMedallionDecor = .none,
                size: MeeshyMedallionSize = .s44,
                state: MeeshyMedallionState = .normal,
                gradientEnd: Color? = nil,
                surface: Color? = nil,
                label: String? = nil,
                isAnimated: Bool = true,
                supportsShape: Bool = true) {
        self.systemImage = systemImage
        self.value = value
        self.kind = kind
        self.tint = tint
        self.shape = shape
        self.fill = fill
        self.decor = decor
        self.size = size
        self.state = state
        self.gradientEnd = gradientEnd
        self.surface = surface
        self.label = label
        self.isAnimated = isAnimated
        self.supportsShape = supportsShape
    }

    public var body: some View {
        let recipe = MeeshyMedallionRecipe.resolve(kind: kind, shape: shape, fill: fill, decor: decor,
                                                   size: size, state: state,
                                                   reduceMotion: reduceMotion || !isAnimated,
                                                   supportsShape: supportsShape)
        let isDark = colorScheme == .dark
        let tone = MeeshyMedallionColors.tone(kind, tint: tint, isDark: isDark)
        let diameter = CGFloat(recipe.diameter)
        ZStack {
            plate(of: recipe, tone: tone, isDark: isDark)
            if recipe.dashedLineWidth > 0 {
                MeeshyMedallionDashedRing(recipe: recipe, tone: tone)
            }
            if recipe.strikeLineWidth > 0 {
                MeeshyMedallionStrike(recipe: recipe, tone: tone, surface: surface ?? .clear)
            }
        }
        .frame(width: diameter, height: diameter)
        .background(alignment: .center) {
            MeeshyMedallionHalo(recipe: recipe, tone: tone)
        }
        .background(alignment: .center) {
            MeeshyMedallionWaves(recipe: recipe, tone: tone)
        }
        .modifier(MeeshyMedallionAccessibility(
            label: MeeshyMedallionWords.spokenLabel(label: label, isLocked: recipe.isLocked)
        ))
    }

    @ViewBuilder
    private func plate(of recipe: MeeshyMedallionRecipe, tone: Color, isDark: Bool) -> some View {
        let outline = recipe.isLocked
        MeeshyMedallionOutline(shape: recipe.shape, cornerRadius: CGFloat(recipe.cornerRadius))
            .fill(background(recipe: recipe, tone: tone))
            .overlay(
                MeeshyMedallionOutline(shape: recipe.shape, cornerRadius: CGFloat(recipe.cornerRadius))
                    .stroke(tone, lineWidth: outline ? CGFloat(recipe.outlineWidth) : 0)
            )
        content(recipe: recipe, tone: tone, isDark: isDark)
    }

    private func background(recipe: MeeshyMedallionRecipe, tone: Color) -> AnyShapeStyle {
        guard recipe.fill == .solid else { return AnyShapeStyle(tone.opacity(recipe.softOpacity)) }
        guard let gradientEnd else { return AnyShapeStyle(tone) }
        return AnyShapeStyle(LinearGradient(colors: [tone, gradientEnd],
                                            startPoint: .topLeading, endPoint: .bottomTrailing))
    }

    @ViewBuilder
    private func content(recipe: MeeshyMedallionRecipe, tone: Color, isDark: Bool) -> some View {
        let ink = recipe.usesDarkInk ? MeeshyColors.plateauNoir : tone
        if recipe.showsLockGlyph {
            Image(systemName: "lock.fill")
                .resizable()
                .scaledToFit()
                .frame(width: CGFloat(recipe.glyphSize), height: CGFloat(recipe.glyphSize))
                .foregroundStyle(tone)
        } else if let text = MeeshyMedallionRecipe.displayedValue(value) {
            Text(verbatim: text)
                .font(MeeshyMedallionRecipe.valueFont(size: CGFloat(recipe.valueSize)))
                .foregroundStyle(ink)
                .lineLimit(1)
        } else if let systemImage {
            Image(systemName: systemImage)
                .resizable()
                .scaledToFit()
                .frame(width: CGFloat(recipe.glyphSize), height: CGFloat(recipe.glyphSize))
                .foregroundStyle(ink)
        }
    }
}

/// La rangée de médaillons : elle dit « 3 sur 5 » en un seul élément.
public struct MeeshyMedallionRow<Items: View>: View {
    private let earned: Int
    private let total: Int
    private let caption: String
    private let items: Items

    public init(earned: Int, total: Int, caption: String, @ViewBuilder items: () -> Items) {
        self.earned = earned
        self.total = total
        self.caption = caption
        self.items = items()
    }

    public var body: some View {
        HStack(spacing: MeeshySpacing.sm) { items }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(caption)
            .accessibilityValue(MeeshyMedallionWords.rowValue(earned: earned, total: total))
    }
}

private struct MeeshyMedallionAccessibility: ViewModifier {
    let label: String?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let label {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label)
                .accessibilityAddTraits(.isImage)
        } else {
            content.accessibilityHidden(true)
        }
    }
}

/// Le contour d'une forme du médaillon : disque, carré arrondi, festons, organique.
nonisolated private struct MeeshyMedallionOutline: Shape {
    let shape: MeeshyMedallionShape
    let cornerRadius: CGFloat

    func path(in rect: CGRect) -> Path {
        switch shape {
        case .disc:
            return Circle().path(in: rect)
        case .squircle:
            return RoundedRectangle(cornerRadius: cornerRadius, style: .continuous).path(in: rect)
        case .scallop:
            return polar(in: rect) { angle in
                1 - MeeshyMedallionOutline.scallopDepth * (1 + cos(Double(MeeshyMedallionRecipe.scallopLobes) * angle)) / 2
            }
        case .blob:
            return polar(in: rect) { angle in
                1 - MeeshyMedallionOutline.blobDepth * (1 + sin(2 * angle + 0.6) * 0.6 + sin(3 * angle) * 0.4) / 2
            }
        }
    }

    private func polar(in rect: CGRect, radius: (Double) -> Double) -> Path {
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let outer = Double(min(rect.width, rect.height)) / 2
        var path = Path()
        for step in 0...MeeshyMedallionOutline.samples {
            let angle = Double(step) / Double(MeeshyMedallionOutline.samples) * 2 * Double.pi
            let distance = outer * radius(angle)
            let point = CGPoint(x: center.x + CGFloat(distance * cos(angle)),
                                y: center.y + CGFloat(distance * sin(angle)))
            if step == 0 { path.move(to: point) } else { path.addLine(to: point) }
        }
        path.closeSubpath()
        return path
    }

    private static let samples = 180
    private static let scallopDepth = 0.08
    private static let blobDepth = 0.14
}

/// Le halo : un anneau plein de 11 % du diamètre, la teinte à 7 %. Il ne compte
/// pas dans la mise en page (posé en arrière-plan).
private struct MeeshyMedallionHalo: View {
    let recipe: MeeshyMedallionRecipe
    let tone: Color

    var body: some View {
        if recipe.haloThickness > 0 {
            Circle()
                .fill(tone.opacity(recipe.haloOpacity))
                .frame(width: CGFloat(recipe.diameter + 2 * recipe.haloThickness),
                       height: CGFloat(recipe.diameter + 2 * recipe.haloThickness))
                .allowsHitTesting(false)
        }
    }
}

/// Les ondes : un à trois anneaux qui partent du bord et s'éteignent, décalés
/// d'une part égale ; sous mouvement réduit, un seul anneau posé au bord. Posées
/// en arrière-plan : la boîte du médaillon ne change pas.
private struct MeeshyMedallionWaves: View {
    let recipe: MeeshyMedallionRecipe
    let tone: Color

    var body: some View {
        let diameter = CGFloat(recipe.diameter)
        ZStack {
            if recipe.showsStillRing {
                ring(diameter: diameter)
                    .opacity(MeeshyMedallionRecipe.waveStartOpacity)
            }
            if recipe.waveCount > 0 {
                TimelineView(.animation(paused: !recipe.animates)) { context in
                    let elapsed = context.date.timeIntervalSinceReferenceDate
                    ZStack {
                        ForEach(0..<recipe.waveCount, id: \.self) { index in
                            let wave = MeeshyMedallionRecipe.wave(index: index, count: recipe.waveCount,
                                                                  elapsed: elapsed)
                            ring(diameter: diameter)
                                .scaleEffect(CGFloat(wave.scale))
                                .opacity(wave.opacity)
                        }
                    }
                }
            }
        }
        .allowsHitTesting(false)
    }

    private func ring(diameter: CGFloat) -> some View {
        Circle()
            .strokeBorder(tone, lineWidth: CGFloat(MeeshyMedallionRecipe.waveStroke))
            .frame(width: diameter, height: diameter)
    }
}

/// L'anneau pointillé : il tourne d'un tour en 40 s, posé sous mouvement réduit.
/// L'angle se lit sur l'horloge de la vue : aucune animation écrite à la main.
private struct MeeshyMedallionDashedRing: View {
    let recipe: MeeshyMedallionRecipe
    let tone: Color

    var body: some View {
        TimelineView(.animation(paused: !recipe.animates)) { context in
            let turns = context.date.timeIntervalSinceReferenceDate / recipe.dashedTurnSeconds
            Circle()
                .inset(by: CGFloat(recipe.dashedInset))
                .stroke(tone, style: StrokeStyle(lineWidth: CGFloat(recipe.dashedLineWidth),
                                                 lineCap: .round, dash: [2, 5]))
                .rotationEffect(.degrees(recipe.animates ? (turns - turns.rounded(.down)) * 360 : 0))
        }
        .allowsHitTesting(false)
    }
}

/// Le trait barré : « indisponible » sans changer de glyphe, détouré du fond.
private struct MeeshyMedallionStrike: View {
    let recipe: MeeshyMedallionRecipe
    let tone: Color
    let surface: Color

    var body: some View {
        ZStack {
            Capsule()
                .fill(surface)
                .frame(width: CGFloat(recipe.strikeLength),
                       height: CGFloat(recipe.strikeLineWidth + 2 * recipe.strikeOutline))
            Capsule()
                .fill(tone)
                .frame(width: CGFloat(recipe.strikeLength), height: CGFloat(recipe.strikeLineWidth))
        }
        .rotationEffect(.degrees(recipe.strikeAngle))
        .allowsHitTesting(false)
    }
}

/// Les couleurs des genres du médaillon : la seule traduction genre vers couleur.
enum MeeshyMedallionColors {
    static func tone(_ kind: MeeshyMedallionKind, tint: Color?, isDark: Bool) -> Color {
        if let tint { return tint }
        switch kind {
        case .accent: return MeeshyColors.brandPrimary
        case .ok: return MeeshyColors.success
        case .warn: return MeeshyColors.warning
        case .err: return MeeshyColors.error
        case .neutral: return MeeshyColors.textSecondary(isDark: isDark)
        }
    }
}
