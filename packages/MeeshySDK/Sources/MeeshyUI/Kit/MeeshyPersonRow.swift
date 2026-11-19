import SwiftUI

/// **La rangée de personne (K39)** : avatar, nom, une ligne dessous, une pastille
/// de niveau, une méta et un accessoire de fin. Partout où l'on liste des gens,
/// c'est elle ; seuls changent les mots et ce qu'on pose à la fin.
///
/// Agnostique : elle reçoit des mots, un nom de glyphe et trois emplacements
/// (`avatar`, `trailing`). Elle ne dessine ni présence ni anneau — l'hôte les met
/// dans `avatar`, selon sa propre loi — et ne connaît ni cercle, ni rôle, ni
/// distance. La partie gauche est UN élément (une phrase) ; l'accessoire de fin
/// garde sa cible et son nom. Sans `onPress` ni sélection, la rangée est un texte.
public struct MeeshyPersonRow<Avatar: View, Trailing: View>: View {
    private let title: String
    private let subtitle: String?
    private let subtitleImage: String?
    private let meta: String?
    private let metaDetail: String?
    private let levelImage: String?
    private let levelLabel: String?
    private let selection: MeeshyPersonRowSelection
    private let selectedLabel: String?
    private let outfit: MeeshyPersonRowOutfit
    private let size: MeeshyPersonRowSize
    private let ghostGlyph: String
    private let showsDivider: Bool
    private let label: String?
    private let onPress: (() -> Void)?
    private let avatar: Avatar
    private let trailing: Trailing

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    public init(title: String,
                subtitle: String? = nil,
                subtitleImage: String? = nil,
                meta: String? = nil,
                metaDetail: String? = nil,
                levelImage: String? = nil,
                levelLabel: String? = nil,
                selection: MeeshyPersonRowSelection = .none,
                selectedLabel: String? = nil,
                outfit: MeeshyPersonRowOutfit = .normal,
                size: MeeshyPersonRowSize = .regular,
                ghostGlyph: String = "person",
                showsDivider: Bool = true,
                label: String? = nil,
                onPress: (() -> Void)? = nil,
                @ViewBuilder avatar: () -> Avatar,
                @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.subtitle = subtitle
        self.subtitleImage = subtitleImage
        self.meta = meta
        self.metaDetail = metaDetail
        self.levelImage = levelImage
        self.levelLabel = levelLabel
        self.selection = selection
        self.selectedLabel = selectedLabel
        self.outfit = outfit
        self.size = size
        self.ghostGlyph = ghostGlyph
        self.showsDivider = showsDivider
        self.label = label
        self.onPress = onPress
        self.avatar = avatar()
        self.trailing = trailing()
    }

    private var textScale: Double { dynamicTypeSize.isAccessibilitySize ? 2 : 1 }

    private func recipe(isPressed: Bool) -> MeeshyPersonRowRecipe {
        MeeshyPersonRowRecipe.resolve(size: size, outfit: outfit, selection: selection, hasPress: onPress != nil,
                                      isPressed: isPressed, textScale: textScale)
    }

    private var spokenLabel: String {
        if let label { return label }
        let said = [meta, metaDetail].compactMap { $0 }.joined(separator: " ")
        let selected = recipe(isPressed: false).isSelected ? selectedLabel : nil
        return MeeshyPersonRowRecipe.spokenLabel(parts: [title, levelLabel, subtitle, said, selected])
    }

    public var body: some View {
        let rest = recipe(isPressed: false)
        return HStack(spacing: 0) {
            leftPart(rest: rest)
            trailing
                .frame(minWidth: CGFloat(MeeshyPersonRowRecipe.minimumTarget),
                       minHeight: CGFloat(MeeshyPersonRowRecipe.minimumTarget))
                .opacity(rest.trailingOpacity)
                .padding(.trailing, CGFloat(rest.trailingMargin))
        }
        .frame(minHeight: CGFloat(rest.rowHeight))
        .overlay(alignment: .bottomLeading) { divider(rest) }
    }

    @ViewBuilder
    private func leftPart(rest: MeeshyPersonRowRecipe) -> some View {
        if rest.isPressable, let action = onPress {
            Button(action: action) { EmptyView() }
                .buttonStyle(MeeshyPersonRowStyle { isPressed in content(recipe: recipe(isPressed: isPressed)) })
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spokenLabel)
                .accessibilityAddTraits(rest.isSelected ? [.isButton, .isSelected] : .isButton)
        } else {
            content(recipe: rest)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spokenLabel)
        }
    }

    private func content(recipe: MeeshyPersonRowRecipe) -> some View {
        let isDark = colorScheme == .dark
        return HStack(spacing: CGFloat(recipe.avatarGap)) {
            avatarSlot(recipe: recipe, isDark: isDark)
            VStack(alignment: .leading, spacing: 2) {
                titleLine(recipe: recipe, isDark: isDark)
                if let subtitle {
                    subtitleLine(subtitle, recipe: recipe, isDark: isDark)
                }
                if recipe.metaBelowSubtitle { metaBlock(recipe: recipe, isDark: isDark) }
            }
            Spacer(minLength: MeeshySpacing.sm)
            if !recipe.metaBelowSubtitle { metaBlock(recipe: recipe, isDark: isDark) }
            selectionMark(recipe: recipe)
        }
        .padding(.leading, CGFloat(recipe.leadingMargin))
        .padding(.trailing, CGFloat(MeeshySpacing.sm))
        .frame(maxWidth: .infinity, minHeight: CGFloat(recipe.rowHeight), alignment: .leading)
        .background(Color.accentColor.opacity(recipe.pressVeil))
        .contentShape(Rectangle())
    }

    @ViewBuilder
    private func avatarSlot(recipe: MeeshyPersonRowRecipe, isDark: Bool) -> some View {
        Group {
            if recipe.isAvatarGhost {
                Circle()
                    .strokeBorder(MeeshyColors.textMuted(isDark: isDark), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
                    .overlay(Image(systemName: ghostGlyph).font(MeeshyKitFont.exact(recipe.avatarSize * 0.4))
                        .foregroundStyle(MeeshyColors.textMuted(isDark: isDark)))
            } else {
                avatar.opacity(recipe.avatarOpacity)
            }
        }
        .frame(width: CGFloat(recipe.avatarSize), height: CGFloat(recipe.avatarSize))
    }

    /// La ligne dessous, précédée d'un glyphe quand l'hôte en donne un (« 🔋 Sang · à l'instant ») : le glyphe se tait
    /// pour VoiceOver, la phrase dit déjà tout.
    private func subtitleLine(_ subtitle: String, recipe: MeeshyPersonRowRecipe, isDark: Bool) -> some View {
        HStack(spacing: 5) {
            if let subtitleImage {
                Image(systemName: subtitleImage)
                    .font(MeeshyFont.relative(CGFloat(recipe.subtitleFontSize)))
                    .accessibilityHidden(true)
            }
            Text(subtitle)
                .font(MeeshyFont.relative(CGFloat(recipe.subtitleFontSize)))
                .lineLimit(1)
        }
        .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark).opacity(recipe.isMutedText ? 0.8 : 1))
    }

    private func titleLine(recipe: MeeshyPersonRowRecipe, isDark: Bool) -> some View {
        HStack(spacing: 4) {
            Text(title)
                .font(MeeshyFont.relative(CGFloat(recipe.titleFontSize), weight: .bold))
                .foregroundStyle(recipe.isMutedText ? MeeshyColors.textMuted(isDark: isDark) : MeeshyColors.textPrimary(isDark: isDark))
                .lineLimit(1)
            if let levelImage {
                Image(systemName: levelImage)
                    .font(MeeshyKitFont.exact(recipe.titleAccessorySize * 0.8))
                    .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))
                    .frame(width: CGFloat(recipe.titleAccessorySize), height: CGFloat(recipe.titleAccessorySize))
            }
        }
    }

    @ViewBuilder
    private func metaBlock(recipe: MeeshyPersonRowRecipe, isDark: Bool) -> some View {
        if meta != nil || metaDetail != nil {
            VStack(alignment: recipe.metaBelowSubtitle ? .leading : .trailing, spacing: 1) {
                if let meta {
                    Text(meta)
                        .font(MeeshyFont.relative(CGFloat(recipe.metaFontSize), weight: .heavy, design: .rounded))
                        .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                        .lineLimit(1)
                }
                if let metaDetail {
                    Text(metaDetail)
                        .font(MeeshyFont.relative(CGFloat(recipe.metaDetailFontSize), weight: .semibold))
                        .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
                        .lineLimit(1)
                }
            }
        }
    }

    @ViewBuilder
    private func selectionMark(recipe: MeeshyPersonRowRecipe) -> some View {
        if let shape = recipe.selectionShape {
            let on = recipe.isSelected
            Image(systemName: shape == .check ? (on ? "checkmark.circle.fill" : "circle") : (on ? "largecircle.fill.circle" : "circle"))
                .font(MeeshyKitFont.exact(22))
                .foregroundStyle(on ? Color.accentColor : MeeshyColors.textMuted(isDark: colorScheme == .dark))
                .accessibilityHidden(true)
        }
    }

    @ViewBuilder
    private func divider(_ recipe: MeeshyPersonRowRecipe) -> some View {
        if showsDivider && recipe.showsDivider {
            Rectangle()
                .fill(MeeshyColors.hairline(isDark: colorScheme == .dark))
                .frame(height: 1)
                .padding(.leading, CGFloat(recipe.dividerInset))
                .accessibilityHidden(true)
        }
    }
}

/// Le style qui rend la partie gauche avec l'état d'appui : un voile, aucune échelle.
private struct MeeshyPersonRowStyle<Content: View>: ButtonStyle {
    let build: (Bool) -> Content

    init(@ViewBuilder build: @escaping (Bool) -> Content) {
        self.build = build
    }

    func makeBody(configuration: Configuration) -> some View {
        build(configuration.isPressed)
    }
}

extension MeeshyPersonRow where Trailing == EmptyView {
    public init(title: String,
                subtitle: String? = nil,
                subtitleImage: String? = nil,
                meta: String? = nil,
                metaDetail: String? = nil,
                levelImage: String? = nil,
                levelLabel: String? = nil,
                selection: MeeshyPersonRowSelection = .none,
                selectedLabel: String? = nil,
                outfit: MeeshyPersonRowOutfit = .normal,
                size: MeeshyPersonRowSize = .regular,
                ghostGlyph: String = "person",
                showsDivider: Bool = true,
                label: String? = nil,
                onPress: (() -> Void)? = nil,
                @ViewBuilder avatar: () -> Avatar) {
        self.init(title: title, subtitle: subtitle, subtitleImage: subtitleImage, meta: meta, metaDetail: metaDetail, levelImage: levelImage,
                  levelLabel: levelLabel, selection: selection, selectedLabel: selectedLabel, outfit: outfit,
                  size: size, ghostGlyph: ghostGlyph, showsDivider: showsDivider, label: label, onPress: onPress,
                  avatar: avatar, trailing: { EmptyView() })
    }
}
