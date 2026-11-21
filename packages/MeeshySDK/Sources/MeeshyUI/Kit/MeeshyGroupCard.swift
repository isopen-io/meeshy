import SwiftUI

/// **La carte de groupe (K43)** : ce qui va ensemble tient dans UNE surface
/// arrondie, avec ses filets en retrait, son en-tête et son pied. Elle rassemble,
/// elle ne décide de rien : « une carte, une idée, jamais une carte dans une carte ».
///
/// Agnostique : un sur-titre, une teinte et des emplacements (`accessory`,
/// `media`, `emblem`, `content`, `footer`). Un emplacement vide ne prend aucune
/// place. Les rangées se rangent avec `MeeshyGroupCardRows`, qui trace les N − 1
/// filets en retrait de 18. Avec `onPress` toute la carte est UN bouton, nommé par
/// `label` (obligatoire alors) ; sans lui, elle est un groupe nommé par son
/// sur-titre. Verrouillée, elle passe à 42 % et rien ne s'active.
public struct MeeshyGroupCard<Accessory: View, Media: View, Emblem: View, Content: View, Footer: View>: View {
    private let overline: String?
    private let surface: MeeshyGroupCardSurface
    private let layout: MeeshyGroupCardLayout
    private let tint: Color?
    private let isLocked: Bool
    private let isFeatured: Bool
    private let isBubble: Bool
    private let label: String?
    private let onPress: (() -> Void)?
    private let accessory: Accessory
    private let media: Media
    private let emblem: Emblem
    private let content: Content
    private let footer: Footer
    private let hasAccessory: Bool
    private let hasMedia: Bool
    private let hasEmblem: Bool
    private let hasFooter: Bool

    @Environment(\.colorScheme) private var colorScheme

    public init(overline: String? = nil,
                surface: MeeshyGroupCardSurface = .raised,
                layout: MeeshyGroupCardLayout = .content,
                tint: Color? = nil,
                isLocked: Bool = false,
                isFeatured: Bool = false,
                isBubble: Bool = false,
                label: String? = nil,
                onPress: (() -> Void)? = nil,
                @ViewBuilder accessory: () -> Accessory,
                @ViewBuilder media: () -> Media,
                @ViewBuilder emblem: () -> Emblem,
                @ViewBuilder content: () -> Content,
                @ViewBuilder footer: () -> Footer) {
        assert(onPress == nil || label != nil, "MeeshyGroupCard : onPress demande un label")
        self.overline = overline
        self.surface = surface
        self.layout = layout
        self.tint = tint
        self.isLocked = isLocked
        self.isFeatured = isFeatured
        self.isBubble = isBubble
        self.label = label
        self.onPress = onPress
        self.accessory = accessory()
        self.media = media()
        self.emblem = emblem()
        self.content = content()
        self.footer = footer()
        self.hasAccessory = Accessory.self != EmptyView.self
        self.hasMedia = Media.self != EmptyView.self
        self.hasEmblem = Emblem.self != EmptyView.self
        self.hasFooter = Footer.self != EmptyView.self
    }

    private func recipe(isPressed: Bool) -> MeeshyGroupCardRecipe {
        MeeshyGroupCardRecipe.resolve(surface: surface, layout: layout, isPressable: onPress != nil,
                                      isPressed: isPressed, isLocked: isLocked, isFeatured: isFeatured, isBubble: isBubble)
    }

    public var body: some View {
        let rest = recipe(isPressed: false)
        return Group {
            if let onPress, rest.isActive {
                Button(action: onPress) { EmptyView() }
                    .buttonStyle(MeeshyGroupCardStyle { isPressed in card(recipe: recipe(isPressed: isPressed)) })
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(label ?? overline ?? "")
                    .accessibilityAddTraits(.isButton)
            } else {
                card(recipe: rest)
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel(overline ?? label ?? "")
                    .disabled(!rest.isActive)
            }
        }
    }

    private func card(recipe: MeeshyGroupCardRecipe) -> some View {
        let isDark = colorScheme == .dark
        let shape = RoundedRectangle(cornerRadius: CGFloat(recipe.cornerRadius), style: .continuous)
        let accent = tint ?? Color.accentColor
        return VStack(alignment: .leading, spacing: 0) {
            if hasMedia { media.frame(maxWidth: .infinity) }
            if hasEmblem {
                emblem.padding(.horizontal, CGFloat(MeeshyGroupCardRecipe.dividerInset))
                    .padding(.top, hasMedia ? -28 : 14)
            }
            if MeeshyGroupCardRecipe.showsHeader(hasOverline: overline != nil, hasAccessory: hasAccessory) {
                header(recipe: recipe, isDark: isDark)
            }
            content
                .environment(\.meeshyGroupCardDivider, MeeshyGroupCardDividerStyle(
                    inset: CGFloat(recipe.dividerInset),
                    color: dividerColor(recipe: recipe, isDark: isDark)))
                .padding(.vertical, CGFloat(recipe.verticalPadding))
            if hasFooter { footer.padding(EdgeInsets(top: 14, leading: 16, bottom: 16, trailing: 16)) }
        }
        .frame(maxWidth: .infinity, minHeight: CGFloat(recipe.minHeight), alignment: .topLeading)
        .opacity(recipe.contentOpacity)
        .foregroundStyle(recipe.usesDarkInk ? (MeeshyKitRGB(hex: "0B0B12")?.color ?? .black) : MeeshyColors.textPrimary(isDark: isDark))
        .background { fill(recipe: recipe, shape: shape, accent: accent, isDark: isDark) }
        .overlay { border(recipe: recipe, shape: shape, accent: accent, isDark: isDark) }
        .overlay { Color.white.opacity(recipe.lighten).clipShape(shape).allowsHitTesting(false) }
        .clipShape(shape)
        .overlay { halo(recipe: recipe, shape: shape, accent: accent) }
        .scaleEffect(CGFloat(recipe.scale))
    }

    private func header(recipe: MeeshyGroupCardRecipe, isDark: Bool) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            if let overline {
                Text(overline)
                    .font(MeeshyFont.relative(11, weight: .bold))
                    .textCase(.uppercase)
                    .foregroundStyle(MeeshyColors.textMuted(isDark: isDark))
                    .lineLimit(1)
                    .accessibilityAddTraits(.isHeader)
            }
            Spacer(minLength: 0)
            accessory
        }
        .padding(.horizontal, CGFloat(MeeshyGroupCardRecipe.dividerInset))
        .frame(minHeight: CGFloat(recipe.headerHeight))
    }

    private func dividerColor(recipe: MeeshyGroupCardRecipe, isDark: Bool) -> Color {
        let base = recipe.surface == .danger ? MeeshyColors.error : MeeshyColors.hairline(isDark: isDark)
        return base.opacity(recipe.dividerOpacity)
    }

    @ViewBuilder
    private func fill(recipe: MeeshyGroupCardRecipe, shape: RoundedRectangle, accent: Color, isDark: Bool) -> some View {
        switch recipe.surface {
        case .raised: shape.fill(MeeshyColors.backgroundSecondary(isDark: isDark))
        case .ground: shape.fill(MeeshyColors.backgroundPrimary(isDark: isDark))
        case .glass: Color.clear.meeshyGlass(in: shape)
        case .accent: shape.fill(accent.opacity(recipe.washOpacity))
        case .danger: shape.fill(MeeshyColors.error.opacity(recipe.washOpacity))
        case .solid: shape.fill(accent)
        case .dashed: Color.clear
        }
    }

    @ViewBuilder
    private func border(recipe: MeeshyGroupCardRecipe, shape: RoundedRectangle, accent: Color, isDark: Bool) -> some View {
        let color: Color = {
            switch recipe.surface {
            case .accent: return accent.opacity(recipe.borderOpacity)
            case .danger: return MeeshyColors.error.opacity(recipe.borderOpacity)
            default: return MeeshyColors.hairline(isDark: isDark)
            }
        }()
        if recipe.isBorderDashed {
            shape.strokeBorder(color, style: StrokeStyle(lineWidth: CGFloat(recipe.borderWidth), dash: [6, 4]))
        } else if recipe.borderWidth > 0 {
            shape.strokeBorder(color, lineWidth: CGFloat(recipe.borderWidth))
        }
    }

    @ViewBuilder
    private func halo(recipe: MeeshyGroupCardRecipe, shape: RoundedRectangle, accent: Color) -> some View {
        if recipe.haloWidth > 0 {
            shape.strokeBorder(accent.opacity(recipe.haloOpacity), lineWidth: CGFloat(recipe.haloWidth))
                .allowsHitTesting(false)
        }
    }
}

/// Le style qui rend la carte entière avec l'état d'appui.
private struct MeeshyGroupCardStyle<Content: View>: ButtonStyle {
    let build: (Bool) -> Content

    init(@ViewBuilder build: @escaping (Bool) -> Content) {
        self.build = build
    }

    func makeBody(configuration: Configuration) -> some View {
        build(configuration.isPressed)
    }
}

/// Le filet d'une carte : le retrait et la couleur, posés par la carte.
struct MeeshyGroupCardDividerStyle: Equatable {
    var inset: CGFloat = CGFloat(MeeshyGroupCardRecipe.dividerInset)
    var color: Color = .clear
}

private struct MeeshyGroupCardDividerKey: EnvironmentKey {
    static let defaultValue = MeeshyGroupCardDividerStyle()
}

extension EnvironmentValues {
    var meeshyGroupCardDivider: MeeshyGroupCardDividerStyle {
        get { self[MeeshyGroupCardDividerKey.self] }
        set { self[MeeshyGroupCardDividerKey.self] = newValue }
    }
}

/// **Le filet d'une carte** : celui que trace `MeeshyGroupCardRows`, offert à
/// l'hôte dont les rangées ne sont pas une collection (un champ, une bascule, un
/// pas-à-pas). Retrait et couleur viennent de la carte qui l'entoure ; muet.
public struct MeeshyGroupCardDivider: View {
    @Environment(\.meeshyGroupCardDivider) private var divider

    public init() {}

    public var body: some View {
        Rectangle().fill(divider.color).frame(height: 1)
            .padding(.leading, divider.inset)
            .accessibilityHidden(true)
    }
}

/// **Les rangées d'une carte** : N rangées, N − 1 filets en retrait, jamais avant
/// la première ni après la dernière.
public struct MeeshyGroupCardRows<Data: RandomAccessCollection, ID: Hashable, Row: View>: View {
    private let data: Data
    private let id: KeyPath<Data.Element, ID>
    private let row: (Data.Element) -> Row

    public init(_ data: Data, id: KeyPath<Data.Element, ID>, @ViewBuilder row: @escaping (Data.Element) -> Row) {
        self.data = data
        self.id = id
        self.row = row
    }

    public var body: some View {
        let items = Array(data)
        return VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                if index > 0 { MeeshyGroupCardDivider() }
                row(item).frame(minHeight: CGFloat(MeeshyGroupCardRecipe.rowMinHeight))
            }
        }
    }
}

extension MeeshyGroupCardRows where Data.Element: Identifiable, ID == Data.Element.ID {
    public init(_ data: Data, @ViewBuilder row: @escaping (Data.Element) -> Row) {
        self.init(data, id: \.id, row: row)
    }
}

extension MeeshyGroupCard where Accessory == EmptyView, Media == EmptyView, Emblem == EmptyView, Footer == EmptyView {
    public init(overline: String? = nil,
                surface: MeeshyGroupCardSurface = .raised,
                layout: MeeshyGroupCardLayout = .content,
                tint: Color? = nil,
                isLocked: Bool = false,
                label: String? = nil,
                onPress: (() -> Void)? = nil,
                @ViewBuilder content: () -> Content) {
        self.init(overline: overline, surface: surface, layout: layout, tint: tint, isLocked: isLocked,
                  isFeatured: false, isBubble: false, label: label, onPress: onPress,
                  accessory: { EmptyView() }, media: { EmptyView() }, emblem: { EmptyView() },
                  content: content, footer: { EmptyView() })
    }
}
