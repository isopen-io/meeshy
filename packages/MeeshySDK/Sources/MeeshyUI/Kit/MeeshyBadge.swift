import SwiftUI

/// Le contenu d'une pastille : un mot, un compte, un code, un rang, une heure,
/// ou le seul glyphe de tête.
public nonisolated enum MeeshyBadgeContent: Sendable, Equatable {
    case label(String)
    case count(Int)
    case code(String)
    case ordinal(Int)
    case time(String)
    case glyph
}

/// La tête d'une pastille : un glyphe, un point fixe ou un point qui pulse.
public nonisolated enum MeeshyBadgeLeading: Sendable, Equatable {
    case none
    case systemImage(String)
    case dot
    case liveDot
}

/// **La pastille (K41)** : une information courte posée sur ou à côté d'autre
/// chose est une seule pastille : glyphe, valeur, teinte. Elle annote, elle ne
/// commande pas.
///
/// Agnostique : le texte est déjà traduit, le nombre est brut, la teinte opaque.
/// Sans `onPress`, elle est inerte (un texte sans rôle) ; avec, un bouton nommé de
/// 44 de cible sans changer l'encombrement. Un compte à zéro ne rend rien.
public struct MeeshyBadge: View {
    private let content: MeeshyBadgeContent
    private let leading: MeeshyBadgeLeading
    private let surface: MeeshyBadgeSurface
    private let kind: MeeshyBadgeKind
    private let tint: Color?
    private let size: MeeshyBadgeSize
    private let shape: MeeshyBadgeShape
    private let cap: Int
    private let total: Int?
    private let lineLimit: Int?
    private let isCurrent: Bool
    private let isStale: Bool
    private let label: String?
    private let onPress: (() -> Void)?

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isPulsing = false

    public init(_ content: MeeshyBadgeContent,
                leading: MeeshyBadgeLeading = .none,
                surface: MeeshyBadgeSurface = .tonal,
                kind: MeeshyBadgeKind = .neutral,
                tint: Color? = nil,
                size: MeeshyBadgeSize = .s22,
                shape: MeeshyBadgeShape = .capsule,
                cap: Int = MeeshyBadgeCount.defaultCap,
                of total: Int? = nil,
                lineLimit: Int? = 1,
                isCurrent: Bool = false,
                isStale: Bool = false,
                label: String? = nil,
                onPress: (() -> Void)? = nil) {
        self.content = content
        self.leading = leading
        self.surface = surface
        self.kind = kind
        self.tint = tint
        self.size = size
        self.shape = shape
        self.cap = cap
        self.total = total
        self.lineLimit = lineLimit
        self.isCurrent = isCurrent
        self.isStale = isStale
        self.label = label
        self.onPress = onPress
    }

    @ViewBuilder
    public var body: some View {
        if let text = displayedText {
            if let onPress {
                Button(action: onPress) { pill(text: text, isPressed: false) }
                    .buttonStyle(MeeshyBadgePressStyle { isPressed in pill(text: text, isPressed: isPressed) })
                    .accessibilityLabel(spokenName(text: text))
                    .accessibilityAddTraits(.isButton)
            } else {
                pill(text: text, isPressed: false)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(spokenName(text: text))
            }
        }
    }

    /// Le texte vu, `nil` quand il n'y a rien à montrer (compte à zéro, glyphe seul).
    private var displayedText: String? {
        switch content {
        case .label(let text), .code(let text), .time(let text): return text.isEmpty ? nil : text
        case .ordinal(let rank): return rank > 0 ? "#\(rank)" : nil
        case .glyph: return ""
        case .count(let count):
            guard let shown = MeeshyBadgeCount.text(count, cap: cap) else { return nil }
            return total.map { "\(shown) / \($0)" } ?? shown
        }
    }

    private func spokenName(text: String) -> String {
        if let label, !label.isEmpty { return label }
        if case .count(let count) = content, let spoken = MeeshyBadgeCount.spoken(count, cap: cap) {
            return "\(spoken)"
        }
        return text
    }

    private func resolvedRecipe(isPressed: Bool) -> MeeshyBadgeRecipe {
        MeeshyBadgeRecipe.resolve(surface: surface, kind: kind, hasTint: tint != nil, size: size, shape: shape,
                                  isMultiline: lineLimit != 1, isCurrent: isCurrent, isStale: isStale,
                                  isInteractive: onPress != nil, isPressed: isPressed)
    }

    private func pill(text: String, isPressed: Bool) -> some View {
        let recipe = resolvedRecipe(isPressed: isPressed)
        let isDark = colorScheme == .dark
        let tone = MeeshyBadgeColors.tone(kind, tint: tint, isDark: isDark)
        let ink = MeeshyBadgeColors.ink(surface: surface, kind: kind, tint: tint, isDark: isDark)
        return HStack(spacing: MeeshySpacing.xs) {
            leadingView(ink: ink)
            if !text.isEmpty {
                Text(verbatim: text)
                    .meeshyScaledFont(CGFloat(recipe.fontSize), weight: .semibold)
                    .monospacedDigit()
                    .lineLimit(lineLimit)
                    .multilineTextAlignment(.leading)
            }
        }
        .foregroundStyle(ink)
        .padding(.horizontal, CGFloat(text.isEmpty ? recipe.horizontalPadding / 2 : recipe.horizontalPadding))
        .frame(minWidth: CGFloat(recipe.minimumWidth), minHeight: CGFloat(recipe.height))
        .frame(maxWidth: recipe.fillsWidth ? .infinity : nil, alignment: .leading)
        .modifier(MeeshyBadgeSurfaceModifier(recipe: recipe, tone: tone))
        .opacity(recipe.opacity)
        .saturation(recipe.isDesaturated ? 0.4 : 1)
        .contentShape(Rectangle().inset(by: CGFloat(-(recipe.tapHeight - recipe.height) / 2)))
    }

    @ViewBuilder
    private func leadingView(ink: Color) -> some View {
        switch leading {
        case .none:
            EmptyView()
        case .systemImage(let name):
            Image(systemName: name)
                .resizable()
                .scaledToFit()
                .frame(width: MeeshyIconSize.xs, height: MeeshyIconSize.xs)
                .accessibilityHidden(true)
        case .dot:
            Circle().fill(ink).frame(width: MeeshyBadgeLeadingMetrics.dot, height: MeeshyBadgeLeadingMetrics.dot)
                .accessibilityHidden(true)
        case .liveDot:
            Circle().fill(ink)
                .frame(width: MeeshyBadgeLeadingMetrics.dot, height: MeeshyBadgeLeadingMetrics.dot)
                .opacity(isPulsing ? MeeshyOpacity.strong : 1)
                .animation(MeeshyMotion.animation(.pulse, reduce: reduceMotion), value: isPulsing)
                .onAppear { isPulsing = !reduceMotion }
                .onDisappear { isPulsing = false }
                .accessibilityHidden(true)
        }
    }
}

private enum MeeshyBadgeLeadingMetrics {
    static let dot: CGFloat = 6
}

/// Le fond de la pastille : le ton plein, le ton à 16 %, le filet, ou le verre de K01.
private struct MeeshyBadgeSurfaceModifier: ViewModifier {
    let recipe: MeeshyBadgeRecipe
    let tone: Color

    @ViewBuilder
    func body(content: Content) -> some View {
        if recipe.usesGlass {
            content.meeshyGlass(in: Capsule(), density: .dense, tint: tone)
        } else {
            content
                .background(Capsule().fill(tone.opacity(recipe.fillOpacity)))
                .overlay(Capsule().strokeBorder(tone, lineWidth: CGFloat(recipe.borderWidth)))
        }
    }
}

/// Le style d'une pastille touchable : l'appui s'exprime par l'opacité.
private struct MeeshyBadgePressStyle<Label: View>: ButtonStyle {
    let render: (Bool) -> Label

    init(@ViewBuilder _ render: @escaping (Bool) -> Label) {
        self.render = render
    }

    func makeBody(configuration: Configuration) -> some View {
        render(configuration.isPressed)
            .opacity(configuration.isPressed ? MeeshyOpacity.intense : 1)
    }
}

/// Les couleurs des sens de la pastille : la seule traduction sens vers couleur.
enum MeeshyBadgeColors {
    static func tone(_ kind: MeeshyBadgeKind, tint: Color?, isDark: Bool) -> Color {
        if let tint { return tint }
        switch kind {
        case .neutral: return MeeshyColors.textSecondary(isDark: isDark)
        case .accent: return MeeshyColors.brandPrimary
        case .ok: return MeeshyColors.success
        case .warn: return MeeshyColors.warning
        case .err: return MeeshyColors.error
        }
    }

    static func ink(surface: MeeshyBadgeSurface, kind: MeeshyBadgeKind, tint: Color?, isDark: Bool) -> Color {
        switch surface {
        case .solid:
            return kind == .warn ? MeeshyColors.plateauNoir : MeeshyColors.onMedia
        case .glass:
            return MeeshyColors.onMedia
        case .tonal, .outline:
            if tint != nil { return tone(kind, tint: tint, isDark: isDark) }
            switch kind {
            case .neutral: return MeeshyColors.textPrimary(isDark: isDark)
            case .accent: return isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo700
            case .ok: return isDark ? MeeshyColors.success : MeeshyColors.successDeep
            case .warn: return isDark ? MeeshyColors.warning : MeeshyColors.amber500
            case .err: return isDark ? MeeshyColors.error : MeeshyColors.errorInk
            }
        }
    }
}

public extension View {

    /// Pose une pastille au coin de la vue : le centre de la pastille sur le coin,
    /// reflété en écriture de droite à gauche. `cutout` la détoure du fond.
    func meeshyBadge<Badge: View>(alignment: Alignment = .topTrailing,
                                  cutout: Bool = false,
                                  @ViewBuilder badge: () -> Badge) -> some View {
        overlay(alignment: alignment) {
            MeeshyBadgeAnchor(cutout: cutout, badge: badge())
                .alignmentGuide(alignment.horizontal) { $0[HorizontalAlignment.center] }
                .alignmentGuide(alignment.vertical) { $0[VerticalAlignment.center] }
        }
    }
}

private struct MeeshyBadgeAnchor<Badge: View>: View {
    let cutout: Bool
    let badge: Badge

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        badge
            .padding(cutout ? MeeshySpacing.xxs : 0)
            .background(Capsule().fill(cutout ? MeeshyColors.backgroundPrimary(isDark: colorScheme == .dark) : .clear))
    }
}
