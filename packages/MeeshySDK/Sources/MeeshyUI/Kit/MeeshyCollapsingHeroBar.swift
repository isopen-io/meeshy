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

/// **K28 `capsule`** : le titre d'un écran ajusté à son contenu, une marque au début (mini-avatar
/// ou glyphe teinté) et le titre, dans une capsule de verre de 44. Avec `action`, elle se touche
/// (ouvrir la fiche de la personne) ; sans, elle est l'en-tête de l'écran.
public struct MeeshyCollapsingHeroCapsule<Mark: View>: View {
    private let title: String
    private let tone: MeeshyGlassTone?
    private let accessibilityLabel: String?
    private let action: (() -> Void)?
    private let mark: Mark

    public init(_ title: String,
                tone: MeeshyGlassTone? = nil,
                accessibilityLabel: String? = nil,
                action: (() -> Void)? = nil,
                @ViewBuilder mark: () -> Mark) {
        self.title = title
        self.tone = tone
        self.accessibilityLabel = accessibilityLabel
        self.action = action
        self.mark = mark()
    }

    public var body: some View {
        if let action {
            Button(action: action) { capsule }
                .buttonStyle(.plain)
                .accessibilityLabel(accessibilityLabel ?? title)
        } else {
            capsule
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(accessibilityLabel ?? title)
                .accessibilityAddTraits(.isHeader)
        }
    }

    private var capsule: some View {
        HStack(spacing: CGFloat(MeeshyHeroBarRecipe.capsuleGap)) {
            mark.accessibilityHidden(true)
            Text(title)
                .font(MeeshyFont.relative(CGFloat(MeeshyHeroBarRecipe.capsuleTitleSize), weight: .heavy, design: .rounded))
                .lineLimit(1)
        }
        .padding(.leading, CGFloat(MeeshyHeroBarRecipe.capsuleLeadingInset))
        .padding(.trailing, CGFloat(MeeshyHeroBarRecipe.capsuleTrailingInset))
        .frame(minHeight: CGFloat(MeeshyHeroBarRecipe.capsuleHeight))
        .meeshyGlass(in: Capsule(), tone: tone, isInteractive: action != nil)
        .contentShape(Capsule())
    }
}
