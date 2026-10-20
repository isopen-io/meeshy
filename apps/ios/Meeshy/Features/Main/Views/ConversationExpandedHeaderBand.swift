import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La bande d'en-tête de conversation, en type NOMINAL** (#6194, LOT-10).
///
/// Une struct `View` obtient son propre nœud dans l'AttributeGraph, et le graphe
/// DÉROULE la pile avant d'évaluer son `body` ; une propriété calculée n'en
/// obtient aucun, elle s'empile (#5837). Les cinq fentes (retour, contenu
/// médian, avatar, verre, partage) sont des closures `() -> T` dont `T` est une
/// struct nominale PETITE : la construction se fait dans le cadre de la
/// closure, entré puis quitté, jamais dans celui de l'appelant — qui, sinon,
/// réserve la place de TOUTES les branches de type opaque en `-Onone`.
///
/// Une fente ne porte jamais une chaîne de modificateurs ni une valeur de vue
/// stockée : ce qui doit être modifié l'est dans le `body` du type qui
/// l'accueille. Gardes : `ConversationScreenTypeIdentityGuardTests`,
/// `ConversationViewBodyTypeDepthTests`.
struct ConversationExpandedHeaderBand<Back: View, Mid: View, Avatar: View, Background: View, Share: View>: View {

    /// Ce que la bande montre, résolu par `ConversationHeaderLayout` — passé en
    /// VALEUR, jamais en observant `composerState` : une feuille qui observe un
    /// objet global se re-rend pour des changements qui ne la concernent pas
    /// (« Zero Unnecessary Re-render »).
    let layout: ConversationHeaderLayout

    @ViewBuilder let backButton: () -> Back
    @ViewBuilder let midContent: () -> Mid
    @ViewBuilder let avatar: () -> Avatar
    @ViewBuilder let background: () -> Background
    /// « Partager » à côté de l'avatar (#10206) — vide quand la conversation
    /// n'a pas d'adresse publique.
    @ViewBuilder let share: () -> Share

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: MeeshySpacing.sm) {
                if layout.showsBackButton { backButton() }
                midContent()
                share()
                avatar()
            }
            .padding(.leading, layout.showsBackButton ? 0 : MeeshySpacing.xs)
            .padding(.trailing, MeeshySpacing.sm)
        }
        .padding(layout.glassShape.innerInsets)
        .background(background())
        .padding(layout.glassShape.outerInsets)
    }
}

/// **La forme du verre de l'en-tête** (#8822, #8898).
///
/// - `none` : le fil replié, sans verre.
/// - `floatingBlock` : le fil déplié — un bloc arrondi qui flotte, avec marges.
/// - `edgeToEdgeBand` : l'aperçu tiré de la bannière. Directive porteur
///   2026-09-30 : « tout le bloc épouse l'entête arrondi puis ligne droite sur
///   la bordure basse… le tout en liquid glass ». Le verre va d'un bord à
///   l'autre, collé en haut de la feuille — l'arrondi du haut est celui de la
///   feuille, qui le découpe — et finit par une arête DROITE. C'est la bande du
///   web (`thread-header.tsx`, `inset-x-0 top-0`). Le haut réserve la place de
///   la poignée de la feuille.
enum HeaderGlassShape: Equatable {
    case none
    case floatingBlock
    case edgeToEdgeBand

    var innerInsets: EdgeInsets {
        switch self {
        case .none: return EdgeInsets()
        case .floatingBlock:
            return EdgeInsets(top: MeeshySpacing.sm - 2, leading: MeeshySpacing.sm + 2,
                              bottom: MeeshySpacing.sm - 2, trailing: MeeshySpacing.sm + 2)
        case .edgeToEdgeBand:
            return EdgeInsets(top: MeeshySpacing.lg + 2, leading: MeeshySpacing.md,
                              bottom: MeeshySpacing.sm + 2, trailing: MeeshySpacing.sm)
        }
    }

    var outerInsets: EdgeInsets {
        switch self {
        case .none:
            return EdgeInsets(top: MeeshySpacing.sm, leading: MeeshySpacing.lg, bottom: 0, trailing: MeeshySpacing.lg)
        case .floatingBlock:
            return EdgeInsets(top: MeeshySpacing.sm, leading: MeeshySpacing.sm, bottom: 0, trailing: MeeshySpacing.sm)
        case .edgeToEdgeBand:
            return EdgeInsets()
        }
    }
}

/// **Le verre de l'en-tête, en type NOMINAL** — sorti de `ConversationView`
/// (hors budget) pour porter les deux formes (#8898). Le repli iOS 16-25 est
/// celui d'`adaptiveGlass`, identique au reste de l'app.
struct ConversationHeaderGlass: View {
    let shape: HeaderGlassShape
    let accentColor: String
    let secondaryColor: String

    private static let blockRadius = MeeshyRadius.xxl - 2

    var body: some View {
        switch shape {
        case .none:
            Color.clear
        case .floatingBlock:
            Color.clear.adaptiveGlass(in: RoundedRectangle(cornerRadius: Self.blockRadius))
                .overlay(
                    RoundedRectangle(cornerRadius: Self.blockRadius)
                        .stroke(rim(startPoint: .leading, endPoint: .trailing), lineWidth: MeeshyBorder.regular)
                )
                .shadow(color: Color(hex: accentColor).opacity(MeeshyOpacity.light), radius: 8, y: 2)
                .transition(.scale(scale: 0.1, anchor: .trailing).combined(with: .opacity))
        case .edgeToEdgeBand:
            // Le verre monte sous la poignée et jusqu'au bord de la feuille ;
            // l'arête basse est une ligne droite teintée de l'accent.
            Color.clear.adaptiveGlass(in: Rectangle())
                .overlay(alignment: .bottom) {
                    rim(startPoint: .leading, endPoint: .trailing)
                        .frame(height: 1)
                }
                .shadow(color: Color(hex: accentColor).opacity(MeeshyOpacity.light), radius: 8, y: 3)
                .ignoresSafeArea(edges: .top)
        }
    }

    private func rim(startPoint: UnitPoint, endPoint: UnitPoint) -> LinearGradient {
        LinearGradient(colors: [Color(hex: accentColor).opacity(0.4), Color(hex: secondaryColor).opacity(MeeshyOpacity.light)],
                       startPoint: startPoint, endPoint: endPoint)
    }
}

/// **Ce que la bande d'en-tête montre, et où** — loi PURE (#8822).
///
/// Deux états depuis toujours : REPLIÉ (retour, actions, avatar) et DÉPLIÉ
/// (retour, titre et étiquettes dans le bloc de verre, avatar). L'aperçu tiré
/// de la bannière héritait du premier : un chevron qui fait `router.pop()` sous
/// une feuille, et aucune identité. Exigence porteur du 2026-09-30 : « afficher
/// tout le header de la conversation dans son bloc de verre Liquid Glass sans
/// (<) ! » — l'aperçu a donc SA disposition : l'identité ET les actions dans le
/// verre, sans retour, plus la porte vers la conversation complète.
struct ConversationHeaderLayout: Equatable {
    let showsBackButton: Bool
    let showsTitle: Bool
    let showsActions: Bool
    /// La forme du verre sous l'en-tête (#8898).
    let glassShape: HeaderGlassShape
    /// L'en-tête est-il posé dans du verre (`adaptiveGlass`) ?
    var isGlassBlock: Bool { glassShape != .none }
    /// L'aperçu seul : la porte vers la conversation complète, qui remplace le
    /// calque transparent qui volait le défilement. Elle prend la place de la
    /// LOUPE (#9031) : l'aperçu ne cherche pas, il s'agrandit.
    let showsOpenFullConversation: Bool
    /// L'avatar montre l'IDENTITÉ (#9031) — la pile des plus actifs avec leurs
    /// points de présence, puis l'interlocuteur ou le groupe : en-tête déplié,
    /// et toujours dans l'aperçu. Sinon, l'avatar seul, sa flamme du jour dessous.
    let avatarShowsIdentity: Bool
    /// Hors aperçu, la frappe remplace la bande par sa barre compacte (retour +
    /// avatar) ; l'aperçu garde son en-tête — la barre compacte porte un retour.
    let yieldsToTypingBar: Bool
    /// La hauteur de la bande réserve le haut de la liste : mesurée dès que la
    /// bande a sa forme de repos (repliée, ou l'en-tête complet de l'aperçu).
    let measuresBandHeight: Bool

    static func resolve(previewMode: Bool, showOptions: Bool) -> ConversationHeaderLayout {
        if previewMode {
            return ConversationHeaderLayout(
                showsBackButton: false, showsTitle: true, showsActions: true, glassShape: .edgeToEdgeBand,
                showsOpenFullConversation: true, avatarShowsIdentity: true,
                yieldsToTypingBar: false, measuresBandHeight: true
            )
        }
        return ConversationHeaderLayout(
            showsBackButton: true, showsTitle: showOptions, showsActions: !showOptions,
            glassShape: showOptions ? .floatingBlock : .none,
            showsOpenFullConversation: false, avatarShowsIdentity: showOptions,
            yieldsToTypingBar: true, measuresBandHeight: !showOptions
        )
    }
}

/// **Le contenu médian de la bande, en type NOMINAL** (#6194).
///
/// Le gain de la forme nominale est double : elle crée un nœud d'attribut (le
/// graphe déroule la pile), et son nom remplace tout le sous-arbre structurel
/// dans les mangled names de ses hôtes — ce qui raccourcit la récursion du
/// démangleur.
struct ConversationHeaderMidContent<TitleAndTags: View, Actions: View>: View {

    let layout: ConversationHeaderLayout
    @ViewBuilder let titleAndTags: () -> TitleAndTags
    @ViewBuilder let actionButtons: () -> Actions
    /// La bascule de l'en-tête quand l'avatar ouvre une fiche (#10300) : la zone
    /// libre — l'espace avant les actions replié, la colonne du titre dépliée.
    var onToggleBand: (() -> Void)? = nil

    var body: some View {
        if layout.showsTitle && layout.showsActions {
            // L'aperçu (#8822) : l'identité prend la place, les actions la suivent.
            // Les actions gardent leur taille (`fixedSize`) : comprimées, la
            // puce de mode chevauchait la loupe — c'est le titre qui tronque.
            HStack(spacing: MeeshySpacing.xs) {
                titleAndTags()
                actionButtons().fixedSize()
            }
        } else if layout.showsTitle {
            titleAndTags()
                .modifier(HeaderBandToggleArea(onToggle: onToggleBand))
        } else {
            // Le bouton d'appel reste à côté de la recherche dans les DEUX
            // états : le repli ne bascule que la zone nom/tags.
            HStack {
                Spacer()
                actionButtons()
            }
            .modifier(HeaderBandToggleArea(onToggle: onToggleBand))
        }
    }
}

/// **La grappe d'actions de l'en-tête, en type NOMINAL** (#6194).
///
/// Appel + recherche + mode de lecture. Le commentaire qu'elle remplace
/// racontait la bonne histoire avec le mauvais remède : « éraser un cran plus
/// bas ne suffisait pas — l'APPELANT doit quand même résoudre le type opaque
/// COMPOSITE, TOUS ses enfants combinés ». C'est exact, et c'est précisément ce
/// qu'un type nominal supprime : le nom se substitue au sous-arbre entier.
///
/// Loi commune `ScrollMotion` conservée : la grappe s'efface pendant le
/// défilement et revient à l'arrêt. Le retour, l'avatar et le titre ne la
/// suivent pas — on doit pouvoir quitter la conversation et savoir où l'on est,
/// même en plein défilement.
struct ConversationHeaderActionsCluster<Call: View, Search: View, ReadingMode: View>: View {

    @ViewBuilder let callButtons: () -> Call
    @ViewBuilder let searchButton: () -> Search
    @ViewBuilder let readingModeCluster: () -> ReadingMode

    var body: some View {
        HStack(spacing: 0) {
            callButtons().layoutPriority(1)
            searchButton()
            readingModeCluster()
        }
        .hiddenWhileScrolling()
    }
}

/// **La section d'en-tête flottante, en type NOMINAL** (#6213 bis).
///
/// Mesuré sur `Services CEO i16pm` (pile principale de 1008 Ko) par
/// `CrashStackDumper` : le cadre de la propriété calculée qui portait ces
/// branches pesait **565 712 octets** (55 % de la pile), quand la struct
/// nominale de #6194 ne pèse plus que 176 octets.
///
/// En `-Onone`, une propriété qui rend `some View` est retournée
/// INDIRECTEMENT : l'APPELANT réserve la place du type concret, et avec trois
/// branches plus une conditionnelle, il réserve celle de TOUTES. Une closure
/// `() -> T` renverse cela : les branches se succèdent au lieu de s'additionner.
struct ConversationFloatingHeaderSection<Anonymous: View, Typing: View, Band: View, SearchBarView: View>: View {

    let isAnonymous: Bool
    let isTyping: Bool
    let showSearch: Bool
    /// Passés en valeurs PRIMITIVES pour les `.animation(_:value:)` : la vue
    /// n'observe aucun objet, elle reçoit ce dont ses transitions dépendent.
    let showOptions: Bool
    let hidesHeaderActions: Bool
    /// Focal/Script + défilement : le header entier glisse vers le bord HAUT en
    /// fondant (loi `hidesEntireHeader`, `EdgeHiddenChrome`), sans démontage ;
    /// les touches passent au fil. Appliqué DANS le corps : une fente ne porte
    /// jamais une chaîne de modificateurs.
    let hidesBandForScroll: Bool
    /// La bande réserve-t-elle le haut de la liste ? `ConversationHeaderLayout.measuresBandHeight`.
    let measuresBandHeight: Bool

    @ViewBuilder let anonymousBar: () -> Anonymous
    @ViewBuilder let typingBar: () -> Typing
    @ViewBuilder let expandedBand: () -> Band
    @ViewBuilder let searchBar: () -> SearchBarView
    /// Hauteur de la bande REPLIÉE (#7998) : elle grandit avec Dynamic Type,
    /// et la pill de jour doit démarrer sous elle. Dépliée, la pill se retire
    /// — sa hauteur n'est pas publiée, pour ne pas faire sauter le fil.
    let onBandHeightChange: (CGFloat) -> Void

    var body: some View {
        VStack {
            if isAnonymous {
                anonymousBar()
            } else if isTyping {
                typingBar()
            } else {
                expandedBand()
                    .hiddenTowardsEdge(hidesBandForScroll, .top)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
                        if measuresBandHeight { onBandHeightChange(height) }
                    }
            }

            if showSearch {
                searchBar()
                    .transition(.move(edge: .top).combined(with: .opacity))
            }

            Spacer()
        }
        .zIndex(100)
        // Le mouvement est PUBLIÉ ici, consommé plus bas par les seuls
        // `.hiddenWhileScrolling()` des grappes de boutons (inchangé).
        .scrollMotionActive(hidesHeaderActions)
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: showOptions)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isTyping)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showSearch)
        .animation(.easeOut(duration: FocalMetrics.HiddenChrome.easeOut), value: hidesBandForScroll)
    }
}

/// **La rangée catégorie, puis étiquettes colorées, défilable** (ex-`headerTagsRow`).
///
/// F11 (revue adversariale 2026-08-25) : elle reçoit la conversation VIVANTE —
/// un changement de mode de chiffrement ou un tag ajouté ou retiré se reflète
/// sur CETTE bande sans réouverture, comme la bande d'avatars voisine.
struct ConversationHeaderTagsRow: View {
    let conversation: Conversation?
    let section: ConversationSection?
    /// La pastille d'engagement ne se lit que sous le titre de l'en-tête DÉPLIÉ.
    let showsEngagement: Bool
    let accentColor: String
    let successColor: Color

    private var isEncrypted: Bool { conversation?.encryptionMode != nil }

    private var hasTags: Bool {
        section != nil || !(conversation?.tags.isEmpty ?? true) || isEncrypted
    }

    var body: some View {
        if hasTags {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.xs) {
                    if showsEngagement { engagementBadge }
                    if isEncrypted { lockIcon }
                    if let section { sectionChip(section) }
                    if let conversation {
                        ForEach(conversation.tags) { tag in tagChip(name: tag.name, hex: tag.color) }
                    }
                }
            }
        } else if showsEngagement {
            engagementBadge
        }
    }

    private var engagementBadge: some View {
        ConversationEngagementBadge(
            conversationId: conversation?.id ?? "",
            seed: conversation?.viewerEngagement,
            accentColor: accentColor
        )
    }

    private var lockIcon: some View {
        Image(systemName: "lock.fill")
            .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
            .foregroundColor(successColor)
            .accessibilityLabel(String(localized: "conversation.encrypted", defaultValue: "Conversation chiffrée", bundle: .main))
    }

    private func sectionChip(_ section: ConversationSection) -> some View {
        HStack(spacing: MeeshySpacing.xxs) {
            Image(systemName: section.icon)
                .font(MeeshyFont.relative(7, weight: .bold))
                .accessibilityHidden(true)
            Text(section.name)
                .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .bold))
        }
        .foregroundColor(Color(hex: section.color))
        .padding(.horizontal, MeeshySpacing.xs)
        .padding(.vertical, MeeshySpacing.xxs)
        .background(chipBackground(hex: section.color))
    }

    private func tagChip(name: String, hex: String) -> some View {
        Text(name)
            .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .semibold))
            .foregroundColor(Color(hex: hex))
            .padding(.horizontal, MeeshySpacing.xs)
            .padding(.vertical, MeeshySpacing.xxs)
            .background(chipBackground(hex: hex))
    }

    private func chipBackground(hex: String) -> some View {
        Capsule()
            .fill(Color(hex: hex).opacity(MeeshyOpacity.light))
            .overlay(
                Capsule()
                    .stroke(Color(hex: hex).opacity(MeeshyOpacity.medium), lineWidth: MeeshyBorder.hairline)
            )
    }
}

/// L'emplacement de la recherche dans la grappe d'actions : la loupe, ou — dans
/// l'aperçu (#9031) — la porte vers la conversation complète qui prend sa place.
struct ConversationHeaderSearchSlot: View {
    let previewMode: Bool
    let accentColor: String
    let secondaryColor: String
    let onOpenFull: () -> Void
    let onSearch: () -> Void

    var body: some View {
        if previewMode {
            ConversationHeaderOpenFullButton(accentColor: accentColor, onOpen: onOpenFull)
        } else {
            ConversationHeaderSearchButton(accentColor: accentColor, secondaryColor: secondaryColor, action: onSearch)
        }
    }
}

/// LA PORTE VERS LA CONVERSATION COMPLÈTE, dans l'aperçu (#8822). Elle remplace
/// le calque transparent posé sur tout le fil, qui l'ouvrait au toucher — et
/// volait ainsi le DÉFILEMENT à la liste.
struct ConversationHeaderOpenFullButton: View {
    let accentColor: String
    let onOpen: () -> Void

    var body: some View {
        Button {
            HapticFeedback.light()
            onOpen()
        } label: {
            HeaderOpenFullGlyph(accentColor: accentColor)
        }
        .accessibilityLabel(String(localized: "conversation.preview.openFull", defaultValue: "Ouvrir la conversation", bundle: .main))
        .accessibilityIdentifier("conversation.preview.openFull")
    }
}

struct ConversationHeaderState {
    var showStoryViewerFromHeader = false
    var storyUserIdForHeader: String?
    var showSearch = false
    var searchQuery = ""
    /// Hauteur MESURÉE de la bande d'en-tête repliée (#7998).
    var bandHeight: CGFloat = 0
    /// La flamme du jour touchée par le lecteur (#9031) — elle revient au
    /// prochain dépliement ; retenue par `ConversationHeaderMemory`.
    var flameDismissed = false
}

/// **L'en-tête d'un direct ouvert suit son pair** (#9359).
///
/// La conversation de l'écran est une valeur FIGÉE à la navigation : la liste
/// et le cache se repeignent à `user:updated`, pas elle. Cette loi repeint la
/// conversation AFFICHÉE par la loi de la ligne d'un direct
/// (`ConversationStore.merging(_:withUserUpdate:)`) — aucune règle parallèle —
/// et `ConversationView.admitPeerUpdate` en fait l'override de l'écran. Les
/// annonces successives se replient donc d'elles-mêmes, chacune sur la
/// précédente.
enum DirectPeerRepaint {

    /// `nil` quand l'annonce ne vise pas le pair du direct affiché, ou ne lui
    /// change rien : l'écran ne se redessine pas pour elle.
    static func repainted(_ displayed: Conversation?, by event: UserUpdatedEvent) -> Conversation? {
        guard let displayed, displayed.type == .direct,
              displayed.participantUserId == event.userId,
              let repainted = ConversationStore.merging(displayed, withUserUpdate: event),
              repainted.title != displayed.title
                || repainted.participantUsername != displayed.participantUsername
                || repainted.participantAvatarURL != displayed.participantAvatarURL
                || repainted.participantBanner != displayed.participantBanner
        else { return nil }
        return repainted
    }
}
