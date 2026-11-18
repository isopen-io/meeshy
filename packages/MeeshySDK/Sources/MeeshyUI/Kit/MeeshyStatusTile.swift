import SwiftUI

/// **La tuile d'état (évolution de K34)** : un état qui se lit en un mot — « 64 % »,
/// « Joignable », « Alfama » — sous son glyphe et son libellé, avec au pied une
/// jauge (K42) ou une phrase. Elle peut porter un média en fond (la miniature d'un
/// lieu, sous un voile de lisibilité) et devenir UNE cible.
///
/// Agnostique : des textes déjà écrits, un glyphe et un ton. Elle ne sait ni ce
/// qu'est une batterie ni d'où vient un lieu. Périmée (`isStale`), elle passe en
/// pointillé, son glyphe perd sa teinte et son média se désature : rien ne promet
/// plus une donnée vivante. UN élément pour le lecteur d'écran.
public struct MeeshyStatusTile<Media: View, Footer: View>: View {
    private let title: String
    private let systemImage: String
    private let value: String
    private let detail: String?
    private let kind: MeeshyStatusTileKind
    private let tint: Color?
    private let isStale: Bool
    private let label: String?
    private let hint: String?
    private let onPress: (() -> Void)?
    private let hasMedia: Bool
    private let media: Media
    private let footer: Footer

    @Environment(\.colorScheme) private var colorScheme

    public init(title: String,
                systemImage: String,
                value: String,
                detail: String? = nil,
                kind: MeeshyStatusTileKind = .accent,
                tint: Color? = nil,
                isStale: Bool = false,
                label: String? = nil,
                hint: String? = nil,
                onPress: (() -> Void)? = nil,
                hasMedia: Bool,
                @ViewBuilder media: () -> Media,
                @ViewBuilder footer: () -> Footer) {
        self.title = title
        self.systemImage = systemImage
        self.value = value
        self.detail = detail
        self.kind = kind
        self.tint = tint
        self.isStale = isStale
        self.label = label
        self.hint = hint
        self.onPress = onPress
        self.hasMedia = hasMedia
        self.media = media()
        self.footer = footer()
    }

    private var recipe: MeeshyStatusTileRecipe {
        MeeshyStatusTileRecipe.resolve(kind: kind, isStale: isStale, hasMedia: hasMedia, isPressable: onPress != nil)
    }

    public var body: some View {
        let recipe = self.recipe
        let spoken = MeeshyStatusTileRecipe.spoken(title: title, value: value, detail: detail, label: label)
        if let onPress {
            Button(action: onPress) { surface(recipe: recipe) }
                .buttonStyle(MeeshyStatusTilePressStyle())
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spoken)
                .accessibilityHint(hint ?? "")
                .accessibilityAddTraits(.isButton)
        } else {
            surface(recipe: recipe)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spoken)
        }
    }

    private func surface(recipe: MeeshyStatusTileRecipe) -> some View {
        let isDark = colorScheme == .dark
        let shape = RoundedRectangle(cornerRadius: CGFloat(MeeshyStatusTileRecipe.cornerRadius), style: .continuous)
        return content(recipe: recipe, isDark: isDark)
            .padding(CGFloat(MeeshyStatusTileRecipe.padding))
            .frame(maxWidth: .infinity, minHeight: CGFloat(recipe.minHeight), alignment: .bottomLeading)
            .background { background(recipe: recipe, isDark: isDark) }
            .clipShape(shape)
            .overlay {
                shape.strokeBorder(MeeshyColors.hairline(isDark: isDark),
                                   style: StrokeStyle(lineWidth: CGFloat(MeeshyStatusTileRecipe.borderWidth),
                                                      dash: recipe.borderDash.map { CGFloat($0) }))
            }
            .contentShape(shape)
    }

    private func content(recipe: MeeshyStatusTileRecipe, isDark: Bool) -> some View {
        VStack(alignment: .leading, spacing: CGFloat(MeeshyStatusTileRecipe.gap)) {
            HStack(spacing: CGFloat(MeeshyStatusTileRecipe.headGap)) {
                Image(systemName: systemImage)
                    .foregroundStyle(glyphColor(recipe.glyphKind, isDark: isDark))
                Text(title)
                    .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                    .lineLimit(1)
            }
            .font(MeeshyFont.relative(CGFloat(MeeshyStatusTileRecipe.headFontSize), weight: .semibold))
            Text(value)
                .font(MeeshyFont.relative(CGFloat(recipe.valueFontSize), weight: .heavy, design: .rounded))
                .foregroundStyle(recipe.isStale ? MeeshyColors.textMuted(isDark: isDark) : MeeshyColors.textPrimary(isDark: isDark))
                .lineLimit(2)
                .minimumScaleFactor(0.7)
                .fixedSize(horizontal: false, vertical: true)
            footer
            if let detail, !detail.isEmpty {
                Text(detail)
                    .font(MeeshyFont.relative(CGFloat(MeeshyStatusTileRecipe.detailFontSize)))
                    .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func background(recipe: MeeshyStatusTileRecipe, isDark: Bool) -> some View {
        ZStack {
            MeeshyColors.backgroundSecondary(isDark: isDark)
            if recipe.hasMedia {
                media
                    .grayscale(recipe.mediaIsDesaturated ? 1 : 0)
                    .opacity(recipe.mediaOpacity)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
                veil(isDark: isDark)
            }
        }
    }

    private func veil(isDark: Bool) -> some View {
        let ground = MeeshyColors.backgroundPrimary(isDark: isDark)
        return LinearGradient(
            colors: [ground.opacity(MeeshyStatusTileRecipe.veilLeadOpacity),
                     ground.opacity(MeeshyStatusTileRecipe.veilMidOpacity),
                     ground.opacity(MeeshyStatusTileRecipe.veilTailOpacity)],
            startPoint: .leading, endPoint: .trailing
        )
        .accessibilityHidden(true)
    }

    private func glyphColor(_ kind: MeeshyStatusTileKind, isDark: Bool) -> Color {
        switch kind {
        case .accent: return tint ?? MeeshyColors.brandPrimary
        case .ok: return MeeshyColors.success
        case .warn: return MeeshyColors.warning
        case .err: return MeeshyColors.error
        case .neutral: return MeeshyColors.textMuted(isDark: isDark)
        }
    }
}

extension MeeshyStatusTile where Media == EmptyView {
    public init(title: String,
                systemImage: String,
                value: String,
                detail: String? = nil,
                kind: MeeshyStatusTileKind = .accent,
                tint: Color? = nil,
                isStale: Bool = false,
                label: String? = nil,
                hint: String? = nil,
                onPress: (() -> Void)? = nil,
                @ViewBuilder footer: () -> Footer) {
        self.init(title: title, systemImage: systemImage, value: value, detail: detail, kind: kind, tint: tint,
                  isStale: isStale, label: label, hint: hint, onPress: onPress, hasMedia: false,
                  media: { EmptyView() }, footer: footer)
    }
}

/// L'appui : une légère contraction, jamais de teinte qui mentirait sur l'état.
private struct MeeshyStatusTilePressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? CGFloat(MeeshyStatusTileRecipe.pressedScale) : 1)
            .meeshyAnimation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
