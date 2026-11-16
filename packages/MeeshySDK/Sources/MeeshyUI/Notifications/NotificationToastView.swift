import SwiftUI
import Combine
import MeeshySDK

/// La bannière in-app — la notification qui descend du haut de l'écran.
///
/// #8723 : « un design plus sexy avec du RELIEF ». La
/// carte n'est plus un rectangle noir plat cerclé d'un liseré : c'est une
/// plaque de verre (`adaptiveGlass` — Liquid Glass sur iOS 26, matériau
/// translucide avant) posée sur un voile opaque qui garde le texte lisible
/// quoi qu'il y ait dessous, bordée d'un reflet en haut, et détachée de
/// l'écran par deux ombres — une large et douce (la hauteur), une courte
/// teintée de l'accent (le contact). L'avatar porte la pastille du TYPE, la
/// ligne de titre porte l'heure, et l'aperçu ne paraît qu'UNE fois.
public struct NotificationToastView: View {
    public let event: SocketNotificationEvent
    public var onTap: (() -> Void)?
    public var onDismiss: (() -> Void)?
    /// L'ouverture du tiroir pendant la traction (#18721) : fermé au repos.
    public var drawer: NotificationToastDrawer

    // Transient leaf toast — do not observe the ThemeManager singleton.
    // `colorScheme` keeps theme-flip reactivity; `theme` is accessed
    // non-observingly for its derived text colors.
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.meeshyPresenceResolver) private var presenceResolver

    /// La présence servie de l'ACTEUR (#10956) — seulement quand l'avatar le représente :
    /// retombé sur la photo du groupe (`toastAvatarURL`), il ne porte aucun point de personne.
    private var actorPresence: PresenceState? { Self.actorPresence(for: event, resolver: presenceResolver) }

    /// La présence SERVIE de l'acteur, ou rien : l'avatar d'un groupe n'en porte pas, et
    /// le résolveur ne rend que ce que la passerelle a servi (jamais fabriquée). Partagée
    /// avec l'enveloppe qui repeint la bannière tirée (`BannerToConversationMorph`).
    static func actorPresence(for event: SocketNotificationEvent, resolver: ((String) -> PresenceState?)?) -> PresenceState? {
        let showsGroup = (event.senderAvatar?.isEmpty ?? true) && !event.isDirect && event.conversationAvatar?.isEmpty == false
        guard !showsGroup else { return nil }
        return event.senderId.flatMap { resolver?($0) }
    }
    private var theme: ThemeManager { ThemeManager.shared }

    private var notifType: MeeshyNotificationType { event.notificationType }
    private var accentColor: Color { Color(hex: notifType.accentHex) }

    /// `ThemeManager.mode` et non `colorScheme` : le mode fait autorité sur
    /// TOUTES les couleurs du thème, y compris le `theme.textPrimary` posé sur
    /// ce fond. Un thème forcé par l'utilisateur (clair verrouillé sous un iOS
    /// en sombre) diverge de `colorScheme` — lire deux sources différentes pour
    /// le fond et pour le texte y donnerait du blanc sur blanc. `colorScheme`
    /// reste déclaré au-dessus : sa seule tâche est de faire re-rendre la vue
    /// au basculement de thème.
    private var isDark: Bool { theme.mode.isDark }

    /// La teinte du thème sous le verre. Une notification est un message du
    /// système à l'utilisateur : elle doit se lire d'un coup d'œil quel que
    /// soit ce qu'elle masque (photo, vidéo, fil) — le voile garde le
    /// contraste, le verre au-dessus donne la matière.
    public static func backgroundColor(isDark: Bool) -> Color {
        MeeshyColors.backgroundPrimary(isDark: isDark)
    }

    /// Opacité du voile sous le verre : assez dense pour que le texte du thème
    /// garde son contraste sur n'importe quel fond, assez légère pour que la
    /// matière du verre se voie. Fonction pure — XCTest ne peut pas
    /// introspecter un `ShapeStyle`, seule la DÉCISION est vérifiable.
    public static func scrimOpacity(isDark: Bool) -> Double {
        isDark ? 0.78 : 0.82
    }

    /// Le liseré : un REFLET en haut (la lumière tombe sur l'arête), l'accent
    /// du type en bas — c'est ce qui donne l'épaisseur.
    public static func borderColor(accent: Color, isDark: Bool) -> Color {
        accent.opacity(isDark ? 0.45 : 0.30)
    }

    /// - Parameter presentation: ce que la bannière affiche, déjà résolu par
    ///   `NotificationToastManager` au moment de la pose (#7167). Absent, il
    ///   est résolu ici — une fois, à la construction, jamais à chaque corps.
    public init(
        event: SocketNotificationEvent,
        presentation: NotificationBannerPresentation? = nil,
        onTap: (() -> Void)? = nil,
        onDismiss: (() -> Void)? = nil,
        drawer: NotificationToastDrawer = .closed
    ) {
        self.event = event
        self.drawer = drawer
        self.presentation = presentation ?? NotificationToastManager.shared.resolvedBannerPresentation(for: event)
        self.onTap = onTap
        self.onDismiss = onDismiss
    }

    // MARK: - Présentation
    //
    // Headline, corps et vignette viennent d'UNE seule source :
    // `NotificationToastManager.resolvedBannerPresentation(for:)`. La vue ne
    // décide de rien — elle place.

    /// STOCKÉE, jamais calculée (#7167).
    private let presentation: NotificationBannerPresentation

    /// L'heure d'arrivée, figée à la pose : la bannière vit quelques secondes,
    /// une horloge qui tourne n'y dirait rien de plus.
    private let receivedAt = Date()

    private var avatarColorHex: String {
        DynamicColorGenerator.colorForName(event.toastAvatarColorSeed)
    }

    private static let thumbnailSide: CGFloat = 30
    /// Le rayon de la carte — aussi le départ du morphisme vers la conversation.
    static let cornerRadius: CGFloat = 22

    private var cardShape: RoundedRectangle {
        RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous)
    }

    // MARK: - Body

    public var body: some View {
        let banner = presentation
        return Button { onTap?() } label: {
            HStack(alignment: .center, spacing: MeeshySpacing.md) {
                avatarWithTypeBadge

                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.xsPlus) {
                        Text(banner.headline)
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                            .foregroundStyle(theme.textPrimary)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        Text(receivedAt, style: .time)
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                            .foregroundStyle(theme.textMuted)
                    }

                    if banner.body != nil || banner.showsContentTile {
                        HStack(alignment: .center, spacing: MeeshySpacing.sm) {
                            if banner.showsContentTile {
                                contentPreview(banner)
                            }
                            if let body = banner.body {
                                Text(body)
                                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                                    .foregroundStyle(theme.textSecondary)
                                    .lineLimit(2)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.top, MeeshySpacing.md)
            .padding(.bottom, MeeshySpacing.lg + drawer.opening)
            .overlay(alignment: .bottom) { drawerHandle }
            .background(cardShape.fill(Self.backgroundColor(isDark: isDark).opacity(Self.scrimOpacity(isDark: isDark))))
            .adaptiveGlass(in: cardShape, tint: accentColor.opacity(isDark ? 0.16 : 0.10))
            .overlay(cardShape.strokeBorder(rimGradient, lineWidth: 1))
            .shadow(color: .black.opacity(isDark ? 0.50 : 0.18), radius: 24, y: 14)
            .shadow(color: accentColor.opacity(isDark ? 0.30 : 0.20), radius: 6, y: 2)
            .contentShape(cardShape)
        }
        .buttonStyle(.plain)
        .padding(.horizontal, drawer.sideInset ?? MeeshySpacing.sm)
        // La bannière est UN élément pour VoiceOver : trois fragments lus
        // séparément font trois arrêts là où l'information est une.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(voiceOverLabel(banner))
        .accessibilityAddTraits(.isButton)
        .accessibilityHint(onDismiss == nil ? "" : String(localized: "notifications.banner.dismissHint", defaultValue: "Balayez vers le haut pour fermer", bundle: .module))
        .accessibilityAction(.escape) { onDismiss?() }
    }

    /// Le reflet du haut vers l'accent du bas — l'arête de la plaque.
    private var rimGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color.white.opacity(isDark ? 0.28 : 0.85),
                Self.borderColor(accent: accentColor, isDark: isDark)
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    /// La poignée : dit sans mot que la carte se balaie et se tire. Tiroir
    /// ouvert, un chevron paraît au-dessus d'elle ; armé, il prend l'accent du
    /// type et grossit : relâcher ouvrira la feuille.
    private var drawerHandle: some View {
        VStack(spacing: MeeshySpacing.xs) {
            Image(systemName: "chevron.compact.down")
                .font(.system(size: MeeshyIconSize.md, weight: .semibold))
                .foregroundStyle(drawer.isArmed ? accentColor : theme.textMuted)
                .scaleEffect(drawer.isArmed ? 1.2 : 1)
                .opacity(Double(min(1, drawer.opening / 40)))
            Capsule()
                .fill(drawer.isArmed ? accentColor : theme.textMuted.opacity(MeeshyOpacity.strong))
                .frame(width: 36, height: 4)
        }
        .padding(.bottom, MeeshySpacing.xs)
        .accessibilityHidden(true)
    }

    /// L'avatar de l'acteur et, en pastille, l'icône du TYPE dans sa couleur :
    /// on sait QUI et QUOI avant d'avoir lu.
    private var avatarWithTypeBadge: some View {
        ZStack(alignment: .bottomTrailing) {
            MeeshyAvatar(
                name: event.toastAvatarName,
                context: .notification,
                accentColor: avatarColorHex,
                avatarURL: event.toastAvatarURL,
                presenceState: actorPresence
            )
            .shadow(color: .black.opacity(isDark ? 0.35 : 0.12), radius: 4, y: 2)

            Circle()
                .fill(
                    LinearGradient(
                        colors: [accentColor, accentColor.opacity(0.78)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    Image(systemName: notifType.systemIcon)
                        .font(.system(size: MeeshyIconSize.xxs, weight: .bold))
                        .foregroundStyle(.white)
                )
                .frame(width: 20, height: 20)
                .overlay(Circle().stroke(Self.backgroundColor(isDark: isDark), lineWidth: MeeshyBorder.strong))
                .offset(x: 3, y: 3)
        }
        .accessibilityHidden(true)
    }

    /// La vignette du contenu visé, ou l'icône du contenu SOCIAL visé quand sa
    /// miniature manque — la même case, jamais deux dispositions. Elle n'est
    /// posée que si `showsContentTile` (#8897) : pour un message, la pastille
    /// de l'avatar dit déjà le type et le corps servi nomme le média.
    @ViewBuilder
    private func contentPreview(_ banner: NotificationBannerPresentation) -> some View {
        Group {
            if let thumbnail = banner.thumbnailURL {
                CachedAsyncImage(
                    url: thumbnail,
                    targetSize: CGSize(width: Self.thumbnailSide, height: Self.thumbnailSide),
                    // Une bannière vit sept secondes : un spinner puis un
                    // bouton « réessayer » dans une case de 30 points ne
                    // seraient jamais ni lisibles ni actionnables.
                    showsStatusOverlays: false,
                    // La case dit QUEL contenu — la retenir derrière la
                    // politique d'économie de données la rendrait vide
                    // dans le cas nominal.
                    autoLoad: true
                ) {
                    symbolTile(banner.contentSymbol)
                }
                .frame(width: Self.thumbnailSide, height: Self.thumbnailSide)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xs, style: .continuous))
            } else {
                symbolTile(banner.contentSymbol)
            }
        }
        .frame(width: Self.thumbnailSide, height: Self.thumbnailSide)
    }

    /// La case teintée, avec l'icône du contenu social quand il y en a une —
    /// vide pendant qu'une vraie vignette charge ou si elle échoue.
    private func symbolTile(_ symbol: String?) -> some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.xs, style: .continuous)
            .fill(accentColor.opacity(isDark ? 0.24 : 0.13))
            .overlay {
                if let symbol {
                    Image(systemName: symbol)
                        .font(.system(size: MeeshyIconSize.xs, weight: .semibold))
                        .foregroundColor(accentColor)
                }
            }
            .frame(width: Self.thumbnailSide, height: Self.thumbnailSide)
    }

    /// Ce qu'un lecteur d'écran entend : la phrase, puis la charge. La vignette
    /// n'est pas décrite — elle ILLUSTRE le corps, elle ne l'augmente pas.
    private func voiceOverLabel(_ banner: NotificationBannerPresentation) -> String {
        [banner.headline, banner.body]
            .compactMap { $0 }
            .joined(separator: ", ")
    }
}

// MARK: - Le tiroir (#18721)

/// Ce que la traction fait de la carte : de combien son bord bas est
/// descendu, sa marge latérale, et si relâcher ouvrira la feuille.
public nonisolated struct NotificationToastDrawer: Equatable, Sendable {
    public let opening: CGFloat
    /// `nil` ⇒ la marge de repos de la carte.
    public let sideInset: CGFloat?
    public let isArmed: Bool

    public init(opening: CGFloat, sideInset: CGFloat?, isArmed: Bool) {
        self.opening = opening
        self.sideInset = sideInset
        self.isArmed = isArmed
    }

    public static let closed = NotificationToastDrawer(opening: 0, sideInset: nil, isArmed: false)

    /// Le tiroir sous une traction donnée ; sous « Réduire les animations »,
    /// la carte ne s'étire pas, mais l'armement se voit toujours.
    public static func pulled(translation: CGFloat, restInset: CGFloat, reduceMotion: Bool) -> NotificationToastDrawer {
        guard translation > 0 else { return .closed }
        guard !reduceMotion else {
            return NotificationToastDrawer(opening: 0, sideInset: nil, isArmed: NotificationBannerDrawer.isArmed(translation: translation))
        }
        return NotificationToastDrawer(
            opening: NotificationBannerDrawer.opening(translation: translation),
            sideInset: NotificationBannerDrawer.sideInset(progress: NotificationBannerPull.progress(translation: translation), rest: restInset),
            isArmed: NotificationBannerDrawer.isArmed(translation: translation)
        )
    }
}

// MARK: - Le geste de la bannière (#8723)

/// Ce que décide un geste relâché sur la bannière. Vers le HAUT (ou lancé
/// vers le haut) ferme ; vers le BAS, c'est une traction, et
/// `NotificationBannerPull` décide si elle devient la conversation (#18721) ;
/// en deçà, rien. Pur : c'est la seule partie du geste qu'un témoin peut tenir.
public nonisolated enum NotificationBannerSwipe: Equatable, Sendable {
    case dismiss
    /// Tirée vers le bas : la décision appartient à `NotificationBannerPull`.
    case preview
    case none

    public static func outcome(translation: CGFloat, predictedEnd: CGFloat) -> NotificationBannerSwipe {
        if translation < -30 || predictedEnd < -80 { return .dismiss }
        if translation > 36 { return .preview }
        return .none
    }
}

// MARK: - La bannière qui devient la feuille de la conversation (#18721)

/// L'enveloppe que la racine peint pendant le morphisme : la carte du tiroir
/// relâché grandit jusqu'au cadre de la feuille de la conversation, ses coins
/// passent au rayon de la feuille, le message s'efface pendant que l'en-tête
/// de la feuille (poignée, avatar, nom) se compose, et l'écran derrière
/// s'assombrit jusqu'au voile de la feuille. La feuille réelle se pose
/// ensuite à la même place, sans animation : l'œil ne voit qu'une carte qui
/// devient feuille.
///
/// `Animatable` : SwiftUI interpole la SEULE `progress` image par image et
/// chaque valeur peinte (cadre, rayon, faces, voile) en dérive
/// (`NotificationBannerMorph`). Une animation posée sur un cadre calculé hors
/// de la vue ne s'interpolait pas : la recette de #18721 montrait une
/// enveloppe figée à sa taille de départ.
public struct BannerToConversationMorph: View, Animatable {
    let event: SocketNotificationEvent
    let headline: String
    let message: String?
    /// Le cadre GLOBAL du tiroir quand le doigt s'est levé.
    let origin: CGRect
    /// Le cadre GLOBAL de la feuille que la carte devient.
    let target: CGRect
    /// Le rayon des coins de la feuille.
    let targetCornerRadius: CGFloat
    /// Le fond de la feuille.
    let surface: Color
    var progress: CGFloat

    public var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    @Environment(\.colorScheme) private var colorScheme
    /// La même présence servie que la bannière : l'enveloppe la repeint, elle ne la fabrique pas.
    @Environment(\.meeshyPresenceResolver) private var presenceResolver
    private var theme: ThemeManager { ThemeManager.shared }

    public init(
        event: SocketNotificationEvent, headline: String, message: String?,
        origin: CGRect, target: CGRect, targetCornerRadius: CGFloat, surface: Color, progress: CGFloat
    ) {
        self.event = event
        self.headline = headline
        self.message = message
        self.origin = origin
        self.target = target
        self.targetCornerRadius = targetCornerRadius
        self.surface = surface
        self.progress = progress
    }

    public var body: some View {
        GeometryReader { proxy in
            let space = proxy.frame(in: .global)
            let start = origin.offsetBy(dx: -space.minX, dy: -space.minY)
            let end = target.offsetBy(dx: -space.minX, dy: -space.minY)
            let frame = NotificationBannerMorph.frame(progress: progress, from: start, to: end)
            let shape = RoundedRectangle(
                cornerRadius: NotificationBannerMorph.cornerRadius(
                    progress: progress, from: NotificationToastView.cornerRadius, to: targetCornerRadius),
                style: .continuous
            )
            ZStack(alignment: .topLeading) {
                Color.black.opacity(NotificationBannerMorph.scrimOpacity(progress: progress))
                ZStack(alignment: .top) {
                    bannerFace
                        .frame(maxWidth: .infinity, alignment: .topLeading)
                    sheetHeader
                        .opacity(NotificationBannerMorph.conversationOpacity(progress: progress))
                }
                .frame(width: frame.width, height: frame.height, alignment: .top)
                .background(shape.fill(surface))
                .clipShape(shape)
                .shadow(color: .black.opacity(0.18 * (1 - Double(min(1, max(0, progress))))), radius: 24, y: 14)
                .position(x: frame.midX, y: frame.midY)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var avatar: some View {
        MeeshyAvatar(
            name: event.toastAvatarName,
            context: .notification,
            accentColor: DynamicColorGenerator.colorForName(event.toastAvatarColorSeed),
            avatarURL: event.toastAvatarURL,
            presenceState: NotificationToastView.actorPresence(for: event, resolver: presenceResolver)
        )
    }

    /// La face de la carte : l'identité reste, le message s'efface.
    private var bannerFace: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.md) {
            avatar
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(headline)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                    .foregroundStyle(theme.textPrimary)
                    .lineLimit(1)
                if let message {
                    Text(message)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                        .foregroundStyle(theme.textSecondary)
                        .lineLimit(2)
                        .opacity(NotificationBannerMorph.bodyOpacity(progress: progress))
                }
            }
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .padding(.top, MeeshySpacing.md)
        .opacity(1 - NotificationBannerMorph.conversationOpacity(progress: progress))
    }

    /// La face de la feuille : sa poignée, puis l'en-tête de la conversation.
    private var sheetHeader: some View {
        VStack(spacing: MeeshySpacing.sm) {
            Capsule()
                .fill(theme.textMuted.opacity(MeeshyOpacity.strong))
                .frame(width: 36, height: 5)
                .padding(.top, MeeshySpacing.xs)
            Text(headline)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                .foregroundStyle(theme.textPrimary)
                .lineLimit(1)
        }
    }
}
