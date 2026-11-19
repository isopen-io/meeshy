import SwiftUI

/// **L'en-tête qui se replie (K28)** : une bannière, un avatar, un titre ; le doigt
/// monte, tout se range dans une barre de verre épinglée. Un seul nombre,
/// `progress`, mène la danse.
///
/// Agnostique : il reçoit des textes et des emplacements (`banner`, `leading`,
/// `trailing`, `avatar` qui reçoit sa taille courante). Il ne sait ni personne,
/// ni présence, ni niveau, et ne mesure aucun défilement : l'hôte lit son
/// décalage (voir `MeeshyCollapsingHeroRecipe.progress(offset:)`) et le lui remet.
/// Un seul avatar et un seul titre voyagent du début à la fin : le titre est lu
/// une fois, comme un en-tête, avec son sous-titre. La barre repliée devient un
/// bouton nommé par `collapsedTapLabel` quand l'hôte donne `onCollapsedTap`.
/// Une feuille, qui n'a pas de barre d'état au-dessus d'elle, donne `topInset`.
/// L'épinglage ne vibre pas : un changement de vue n'a pas de retour haptique (#19783). Sous « Réduire les animations »
/// (système ou forcé dans Meeshy), l'identité ne glisse plus : elle passe dans la barre
/// par un fondu.
public struct MeeshyCollapsingHero<Banner: View, Leading: View, Trailing: View, AvatarSlot: View>: View {
    private let progress: Double
    private let title: String
    private let subtitle: String?
    private let alignment: MeeshyCollapsingHeroAlignment
    private let expandedHeight: Double
    private let collapsedHeight: Double
    private let topInset: Double?
    private let tone: MeeshyGlassTone?
    private let isLoading: Bool
    private let collapsedTapLabel: String?
    private let onCollapsedTap: (() -> Void)?
    /// La bannière reste DANS la barre repliée, floutée par son verre, au lieu de s'effacer (fiche de profil, #19780).
    private let keepsBannerInBar: Bool
    private let banner: Banner
    private let leading: Leading
    private let trailing: Trailing
    private let avatar: ((CGFloat) -> AvatarSlot)?

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion

    public init(progress: Double,
                title: String,
                subtitle: String? = nil,
                alignment: MeeshyCollapsingHeroAlignment = .leading,
                expandedHeight: Double = MeeshyCollapsingHeroRecipe.expandedHeight,
                collapsedHeight: Double = MeeshyCollapsingHeroRecipe.collapsedHeight,
                topInset: Double? = nil,
                tone: MeeshyGlassTone? = nil,
                isLoading: Bool = false,
                collapsedTapLabel: String? = nil,
                onCollapsedTap: (() -> Void)? = nil,
                keepsBannerInBar: Bool = false,
                @ViewBuilder banner: () -> Banner,
                @ViewBuilder leading: () -> Leading,
                @ViewBuilder trailing: () -> Trailing,
                avatar: ((CGFloat) -> AvatarSlot)?) {
        self.progress = progress
        self.title = title
        self.subtitle = subtitle
        self.alignment = alignment
        self.expandedHeight = expandedHeight
        self.collapsedHeight = collapsedHeight
        self.topInset = topInset
        self.tone = tone
        self.isLoading = isLoading
        self.collapsedTapLabel = collapsedTapLabel
        self.onCollapsedTap = onCollapsedTap
        self.keepsBannerInBar = keepsBannerInBar
        self.banner = banner()
        self.leading = leading()
        self.trailing = trailing()
        self.avatar = avatar
    }

    private var recipe: MeeshyCollapsingHeroRecipe {
        MeeshyCollapsingHeroRecipe.resolve(
            progress: progress, expandedHeight: expandedHeight, collapsedHeight: collapsedHeight,
            alignment: alignment, hasAvatar: avatar != nil, hasSubtitle: subtitle != nil,
            reduceMotion: MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
        )
    }

    public var body: some View {
        let recipe = self.recipe
        let isDark = colorScheme == .dark
        return GeometryReader { proxy in
            let top = MeeshyCollapsingHeroRecipe.controlTop(safeArea: Double(proxy.safeAreaInsets.top), topInset: topInset)
            ZStack(alignment: .topLeading) {
                bannerLayer(recipe: recipe, width: proxy.size.width)
                barLayer(recipe: recipe)
                identity(recipe: recipe, width: Double(proxy.size.width), top: top, isDark: isDark)
                controls(recipe: recipe, top: top)
                collapsedButton(recipe: recipe)
            }
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
        }
        .frame(height: CGFloat(recipe.height))
    }

    @ViewBuilder
    private func bannerLayer(recipe: MeeshyCollapsingHeroRecipe, width: CGFloat) -> some View {
        Group {
            if isLoading {
                MeeshySkeleton(shape: .card(aspect: 393 / expandedHeight, radius: 0))
            } else {
                banner
            }
        }
        .frame(width: width, height: CGFloat(recipe.height + recipe.bannerStretch), alignment: .top)
        .clipShape(MeeshyCollapsingHeroBarShape(cornerRadius: CGFloat(
            MeeshyCollapsingHeroRecipe.bannerCornerRadius(recipe, keepsBannerInBar: keepsBannerInBar))))
        .opacity(MeeshyCollapsingHeroRecipe.bannerOpacity(recipe, keepsBannerInBar: keepsBannerInBar))
        .accessibilityHidden(true)
    }

    private func barLayer(recipe: MeeshyCollapsingHeroRecipe) -> some View {
        Color.clear
            .meeshyGlass(in: MeeshyCollapsingHeroBarShape(cornerRadius: CGFloat(MeeshyCollapsingHeroRecipe.barCornerRadius)),
                         tone: tone)
            .opacity(recipe.glassOpacity)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    private func identity(recipe: MeeshyCollapsingHeroRecipe, width: Double, top: Double, isDark: Bool) -> some View {
        let travel = recipe.identityTravel
        let avatarSize = recipe.avatarSize
        let centered = alignment == .center
        let expandedX = centered ? (width - MeeshyCollapsingHeroRecipe.avatarExpanded) / 2 : 20
        let collapsedX = MeeshyCollapsingHeroRecipe.controlInsetCollapsed + MeeshyCollapsingHeroRecipe.controlTarget + 12
        let x = expandedX + (collapsedX - expandedX) * travel
        let expandedY = expandedHeight - 86
        let collapsedY = top + MeeshyCollapsingHeroRecipe.controlTarget / 2 - MeeshyCollapsingHeroRecipe.avatarCollapsed / 2
        let y = expandedY + (collapsedY - expandedY) * travel
        let textExpandedY = expandedHeight - 86 + MeeshyCollapsingHeroRecipe.avatarExpanded + 10
        let textCollapsedY = top + 6
        let textY = textExpandedY + (textCollapsedY - textExpandedY) * travel
        let textExpandedX: Double = centered ? 0 : 20
        let textX = textExpandedX + (collapsedX + MeeshyCollapsingHeroRecipe.avatarCollapsed + 10 - textExpandedX) * travel
        return ZStack(alignment: .topLeading) {
            if let avatar, avatarSize > 0 {
                Group {
                    if isLoading {
                        MeeshySkeleton(shape: .circle(diameter: avatarSize))
                    } else {
                        avatar(CGFloat(avatarSize))
                    }
                }
                .frame(width: CGFloat(avatarSize), height: CGFloat(avatarSize))
                .offset(x: CGFloat(x), y: CGFloat(y))
            }
            titleBlock(recipe: recipe, isDark: isDark, centered: centered && travel < 0.5)
                .frame(width: CGFloat(max(width - textX - 16, 0)), alignment: centered && travel < 0.5 ? .center : .leading)
                .offset(x: CGFloat(textX), y: CGFloat(textY))
        }
        .opacity(recipe.identityOpacity)
    }

    @ViewBuilder
    private func titleBlock(recipe: MeeshyCollapsingHeroRecipe, isDark: Bool, centered: Bool) -> some View {
        if isLoading {
            loadingTitleBlock(centered: centered)
        } else {
            nameBlock(recipe: recipe, isDark: isDark, centered: centered)
        }
    }

    private func nameBlock(recipe: MeeshyCollapsingHeroRecipe, isDark: Bool, centered: Bool) -> some View {
        VStack(alignment: centered ? .center : .leading, spacing: 2) {
            Text(title)
                .font(MeeshyKitFont.exact(recipe.titleSize, weight: .heavy, design: .rounded))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                .lineLimit(1)
                .truncationMode(.tail)
            if let subtitle, recipe.subtitleSize > 0 {
                Text(subtitle)
                    .font(MeeshyKitFont.exact(recipe.subtitleSize, weight: .medium))
                    .foregroundStyle(Color.accentColor)
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    /// Premier chargement (cache vide) : le nom et le pseudo sont des squelettes K38, muets pour le lecteur d'écran.
    private func loadingTitleBlock(centered: Bool) -> some View {
        VStack(alignment: centered ? .center : .leading, spacing: MeeshySpacing.sm) {
            MeeshySkeleton(shape: .card(
                aspect: MeeshyCollapsingHeroRecipe.loadingTitleWidth / MeeshyCollapsingHeroRecipe.loadingTitleHeight,
                radius: MeeshyCollapsingHeroRecipe.loadingTitleRadius))
                .frame(maxWidth: CGFloat(MeeshyCollapsingHeroRecipe.loadingTitleWidth))
            MeeshySkeleton(shape: .line(widthRatio: 1))
                .frame(width: CGFloat(MeeshyCollapsingHeroRecipe.loadingSubtitleWidth))
        }
        .accessibilityHidden(true)
    }

    private func controls(recipe: MeeshyCollapsingHeroRecipe, top: Double) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            leading
            Spacer(minLength: MeeshySpacing.sm)
            trailing
        }
        .padding(.leading, CGFloat(MeeshyCollapsingHeroRecipe.controlInsetExpanded - recipe.controlShift))
        .padding(.trailing, CGFloat(MeeshyCollapsingHeroRecipe.controlInsetExpanded))
        .padding(.top, CGFloat(top))
    }

    @ViewBuilder
    private func collapsedButton(recipe: MeeshyCollapsingHeroRecipe) -> some View {
        if recipe.barOwnsIdentity, let onCollapsedTap {
            let height = CGFloat(collapsedHeight)
            let inset = CGFloat(MeeshyCollapsingHeroRecipe.controlInsetExpanded + MeeshyCollapsingHeroRecipe.controlTarget)
            Color.clear
                .frame(height: height)
                .contentShape(Rectangle())
                .padding(.horizontal, inset)
                .onTapGesture(perform: onCollapsedTap)
                .accessibilityElement()
                .accessibilityLabel(collapsedTapLabel ?? title)
                .accessibilityAddTraits(.isButton)
                .accessibilityAction { onCollapsedTap() }
        }
    }
}

/// La barre repliée : un rectangle aux coins bas arrondis de 28.
nonisolated struct MeeshyCollapsingHeroBarShape: Shape {
    let cornerRadius: CGFloat

    func path(in rect: CGRect) -> Path {
        let radius = min(cornerRadius, rect.width / 2, rect.height)
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - radius))
        path.addArc(center: CGPoint(x: rect.maxX - radius, y: rect.maxY - radius), radius: radius,
                    startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        path.addLine(to: CGPoint(x: rect.minX + radius, y: rect.maxY))
        path.addArc(center: CGPoint(x: rect.minX + radius, y: rect.maxY - radius), radius: radius,
                    startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        path.closeSubpath()
        return path
    }
}

extension MeeshyCollapsingHero where AvatarSlot == EmptyView {
    public init(progress: Double,
                title: String,
                subtitle: String? = nil,
                alignment: MeeshyCollapsingHeroAlignment = .leading,
                expandedHeight: Double = MeeshyCollapsingHeroRecipe.expandedHeight,
                collapsedHeight: Double = MeeshyCollapsingHeroRecipe.collapsedHeight,
                topInset: Double? = nil,
                tone: MeeshyGlassTone? = nil,
                isLoading: Bool = false,
                collapsedTapLabel: String? = nil,
                onCollapsedTap: (() -> Void)? = nil,
                @ViewBuilder banner: () -> Banner,
                @ViewBuilder leading: () -> Leading,
                @ViewBuilder trailing: () -> Trailing) {
        self.init(progress: progress, title: title, subtitle: subtitle, alignment: alignment,
                  expandedHeight: expandedHeight, collapsedHeight: collapsedHeight, topInset: topInset, tone: tone,
                  isLoading: isLoading, collapsedTapLabel: collapsedTapLabel, onCollapsedTap: onCollapsedTap,
                  banner: banner, leading: leading, trailing: trailing, avatar: nil)
    }
}
