import SwiftUI

/// Les trois variantes de K28 : le héros qui se replie, la barre autonome d'un écran poussé
/// (sans héros), et la capsule ajustée à son contenu.
public nonisolated enum MeeshyCollapsingHeroVariant: String, Sendable, Equatable, CaseIterable {
    case hero
    case bar
    case capsule
}

/// Le titre d'une barre : un titre et son sous-titre, ou un grand titre seul.
public nonisolated enum MeeshyHeroBarTitleStyle: String, Sendable, Equatable, CaseIterable {
    case inline
    case large
}

/// Le fond d'une barre : nue (posée sur le fond de l'écran) ou de verre (K01).
public nonisolated enum MeeshyHeroBarSurface: String, Sendable, Equatable, CaseIterable {
    case bare
    case glass
}

/// La largeur de la capsule : ajustée à son contenu, ou pleine entre les deux commandes de la barre.
public nonisolated enum MeeshyHeroCapsuleWidth: String, Sendable, Equatable, CaseIterable {
    case fit
    case fill
}

/// **La recette de la barre et de la capsule de K28 en VALEURS.** Aucune vue, aucune couleur.
public nonisolated struct MeeshyHeroBarRecipe: Sendable, Equatable {
    /// La rangée de la barre : la cible des commandes, 44.
    public static let rowHeight: Double = 44
    public static let horizontalInset: Double = 16
    public static let gap: Double = 12
    public static let verticalInset: Double = 8
    public static let subtitleSize: Double = 12

    /// La capsule : 44 de haut, 12 au début, 16 à la fin, 8 entre la marque et le titre.
    public static let capsuleHeight: Double = 44
    public static let capsuleLeadingInset: Double = 12
    public static let capsuleTrailingInset: Double = 16
    public static let capsuleGap: Double = 8
    public static let capsuleTitleSize: Double = 16

    /// La capsule à deux lignes (planche Carte-Proches) : 56 de haut, 18 au début et à la fin (aucune
    /// marque en tête), titre 19, sous-titre 12,5.
    public static let capsuleTwoLineHeight: Double = 56
    public static let capsuleTwoLineHorizontalInset: Double = 18
    public static let capsuleTwoLineTitleSize: Double = 19
    public static let capsuleSubtitleSize: Double = 12.5

    public static func capsuleMinHeight(hasSubtitle: Bool) -> Double {
        hasSubtitle ? capsuleTwoLineHeight : capsuleHeight
    }

    /// Les retraits de la capsule : 18 et 18 à deux lignes, 12 et 16 à une ligne (sa marque en tête).
    public static func capsuleInsets(hasSubtitle: Bool) -> (leading: Double, trailing: Double) {
        hasSubtitle
            ? (capsuleTwoLineHorizontalInset, capsuleTwoLineHorizontalInset)
            : (capsuleLeadingInset, capsuleTrailingInset)
    }

    /// La priorité de mise en page de la capsule dans la barre : pleine, elle passe avant les espaces
    /// qui la centrent et prend toute la place entre les deux commandes.
    public static func capsuleLayoutPriority(_ width: MeeshyHeroCapsuleWidth) -> Double {
        width == .fill ? 1 : 0
    }

    /// L'encre de la capsule suit le TON de son verre, jamais le thème de l'app : tout verre autre que
    /// `theme` est sombre (Liquid Glass le force en sombre, le verre dessiné le fonce), donc l'encre
    /// claire (`isDark` vrai) ; le verre `theme` suit l'apparence.
    public static func capsuleInkIsDark(tone: MeeshyGlassTone, appearanceIsDark: Bool) -> Bool {
        tone != .theme || appearanceIsDark
    }

    public static func capsuleTitleFontSize(hasSubtitle: Bool) -> Double {
        hasSubtitle ? capsuleTwoLineTitleSize : capsuleTitleSize
    }

    /// La capsule se lit d'un bloc : le titre, son étiquette, puis le sous-titre ; une partie vide se tait.
    public static func capsuleSpoken(title: String, badge: String?, subtitle: String?) -> String {
        [title, badge, subtitle]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
    }

    /// Le corps du titre : 17 en ligne (avec son sous-titre), 20 en grand titre.
    public static func titleSize(_ style: MeeshyHeroBarTitleStyle) -> Double {
        switch style {
        case .inline: return 17
        case .large: return 20
        }
    }

    /// Le grand titre n'a pas de sous-titre : il est seul sur sa ligne.
    public static func showsSubtitle(_ style: MeeshyHeroBarTitleStyle, hasSubtitle: Bool) -> Bool {
        style == .inline && hasSubtitle
    }
}

/// **K28 `bar`** : la barre autonome d'un écran poussé, sans héros. Au début une commande
/// (K02, retour ou fermeture), puis le titre, puis à la fin une commande, un bouton libellé (K40)
/// ou un avatar. Nue ou de verre. Le titre est l'en-tête de l'écran pour le lecteur d'écran.
/// Un titre posé par l'hôte (une capsule) se centre entre les deux commandes.
public struct MeeshyCollapsingHeroBar<Leading: View, Title: View, Trailing: View>: View {
    private let surface: MeeshyHeroBarSurface
    private let tone: MeeshyGlassTone?
    private let centersTitle: Bool
    private let leading: Leading
    private let title: Title
    private let trailing: Trailing

    public init(surface: MeeshyHeroBarSurface = .bare,
                tone: MeeshyGlassTone? = nil,
                @ViewBuilder leading: () -> Leading,
                @ViewBuilder title: () -> Title,
                @ViewBuilder trailing: () -> Trailing) {
        self.surface = surface
        self.tone = tone
        self.centersTitle = true
        self.leading = leading()
        self.title = title()
        self.trailing = trailing()
    }

    init(surface: MeeshyHeroBarSurface, tone: MeeshyGlassTone?, centersTitle: Bool,
         leading: Leading, title: Title, trailing: Trailing) {
        self.surface = surface
        self.tone = tone
        self.centersTitle = centersTitle
        self.leading = leading
        self.title = title
        self.trailing = trailing
    }

    public var body: some View {
        HStack(spacing: CGFloat(MeeshyHeroBarRecipe.gap)) {
            leading
            if centersTitle {
                Spacer(minLength: 0)
                title
                Spacer(minLength: 0)
            } else {
                title.frame(maxWidth: .infinity, alignment: .leading)
            }
            trailing
        }
        .frame(minHeight: CGFloat(MeeshyHeroBarRecipe.rowHeight))
        .padding(.horizontal, CGFloat(MeeshyHeroBarRecipe.horizontalInset))
        .padding(.vertical, CGFloat(MeeshyHeroBarRecipe.verticalInset))
        .background { glassLayer }
    }

    @ViewBuilder
    private var glassLayer: some View {
        if surface == .glass {
            Color.clear
                .meeshyGlass(in: MeeshyCollapsingHeroBarShape(cornerRadius: CGFloat(MeeshyCollapsingHeroRecipe.barCornerRadius)),
                             tone: tone)
                .ignoresSafeArea(.container, edges: .top)
                .accessibilityHidden(true)
        }
    }
}

extension MeeshyCollapsingHeroBar where Title == MeeshyHeroBarTitle {
    /// La barre au titre écrit : en ligne avec son sous-titre, ou grand titre seul, au début.
    public init(title: String,
                subtitle: String? = nil,
                titleStyle: MeeshyHeroBarTitleStyle = .inline,
                surface: MeeshyHeroBarSurface = .bare,
                tone: MeeshyGlassTone? = nil,
                @ViewBuilder leading: () -> Leading,
                @ViewBuilder trailing: () -> Trailing) {
        self.init(surface: surface, tone: tone, centersTitle: false, leading: leading(),
                  title: MeeshyHeroBarTitle(title: title, subtitle: subtitle, style: titleStyle), trailing: trailing())
    }
}

/// Le titre écrit d'une barre : lu une fois, comme l'en-tête de l'écran, avec son sous-titre.
public struct MeeshyHeroBarTitle: View {
    let title: String
    let subtitle: String?
    let style: MeeshyHeroBarTitleStyle

    @Environment(\.colorScheme) private var colorScheme

    public var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(title)
                .font(MeeshyFont.relative(CGFloat(MeeshyHeroBarRecipe.titleSize(style)), weight: .heavy, design: .rounded))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: colorScheme == .dark))
                .lineLimit(1)
            if let subtitle, MeeshyHeroBarRecipe.showsSubtitle(style, hasSubtitle: true) {
                Text(subtitle)
                    .font(MeeshyFont.relative(CGFloat(MeeshyHeroBarRecipe.subtitleSize), weight: .medium))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// **K28 `capsule`** : le titre d'un écran, une marque au début (mini-avatar ou glyphe teinté),
/// le titre et son étiquette (K41), et au besoin un sous-titre sous le titre (la capsule passe
/// alors à deux lignes, 56). Ajustée à son contenu, ou pleine entre les deux commandes de la barre.
/// Avec `action`, elle se touche (ouvrir la fiche de la personne) ; sans, elle est l'en-tête de l'écran.
public struct MeeshyCollapsingHeroCapsule<Mark: View>: View {
    private let title: String
    private let subtitle: String?
    private let titleBadge: String?
    private let width: MeeshyHeroCapsuleWidth
    private let tint: Color?
    private let tone: MeeshyGlassTone?
    private let accessibilityLabel: String?
    private let action: (() -> Void)?
    private let mark: Mark

    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.meeshyGlassTone) private var hostTone

    public init(_ title: String,
                subtitle: String? = nil,
                titleBadge: String? = nil,
                width: MeeshyHeroCapsuleWidth = .fit,
                tint: Color? = nil,
                tone: MeeshyGlassTone? = nil,
                accessibilityLabel: String? = nil,
                action: (() -> Void)? = nil,
                @ViewBuilder mark: () -> Mark) {
        self.title = title
        self.subtitle = subtitle
        self.titleBadge = titleBadge
        self.width = width
        self.tint = tint
        self.tone = tone
        self.accessibilityLabel = accessibilityLabel
        self.action = action
        self.mark = mark()
    }

    private var hasSubtitle: Bool { !(subtitle ?? "").isEmpty }

    private var inkIsDark: Bool {
        MeeshyHeroBarRecipe.capsuleInkIsDark(tone: tone ?? hostTone, appearanceIsDark: colorScheme == .dark)
    }

    private var spoken: String {
        accessibilityLabel ?? MeeshyHeroBarRecipe.capsuleSpoken(title: title, badge: titleBadge, subtitle: subtitle)
    }

    public var body: some View {
        if let action {
            Button(action: action) { capsule }
                .buttonStyle(.plain)
                .accessibilityLabel(spoken)
                .layoutPriority(MeeshyHeroBarRecipe.capsuleLayoutPriority(width))
        } else {
            capsule
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(spoken)
                .accessibilityAddTraits(.isHeader)
                .layoutPriority(MeeshyHeroBarRecipe.capsuleLayoutPriority(width))
        }
    }

    private var capsule: some View {
        HStack(spacing: CGFloat(MeeshyHeroBarRecipe.capsuleGap)) {
            mark.accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                titleLine
                if let subtitle, hasSubtitle {
                    Text(subtitle)
                        .font(MeeshyFont.relative(CGFloat(MeeshyHeroBarRecipe.capsuleSubtitleSize), weight: .semibold))
                        .foregroundStyle(MeeshyColors.textSecondary(isDark: inkIsDark))
                        .lineLimit(1)
                }
            }
            if width == .fill { Spacer(minLength: 0) }
        }
        .padding(.leading, CGFloat(MeeshyHeroBarRecipe.capsuleInsets(hasSubtitle: hasSubtitle).leading))
        .padding(.trailing, CGFloat(MeeshyHeroBarRecipe.capsuleInsets(hasSubtitle: hasSubtitle).trailing))
        .frame(maxWidth: width == .fill ? .infinity : nil,
               minHeight: CGFloat(MeeshyHeroBarRecipe.capsuleMinHeight(hasSubtitle: hasSubtitle)))
        .meeshyGlass(in: Capsule(), tone: tone, isInteractive: action != nil)
        .contentShape(Capsule())
    }

    private var titleLine: some View {
        HStack(spacing: CGFloat(MeeshyHeroBarRecipe.capsuleGap)) {
            Text(title)
                .font(MeeshyFont.relative(CGFloat(MeeshyHeroBarRecipe.capsuleTitleFontSize(hasSubtitle: hasSubtitle)),
                                          weight: .heavy, design: .rounded))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: inkIsDark))
                .lineLimit(1)
            if let titleBadge, !titleBadge.isEmpty {
                MeeshyBadge(.label(titleBadge), surface: .solid, kind: .accent, tint: tint)
                    .transition(.opacity)
            }
        }
    }
}
