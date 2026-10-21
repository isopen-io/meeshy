import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - iPad Root View Right Panel Content (Hub Routes)

/// Ce que la colonne droite de l'iPad montre.
///
/// Une route ouverte PASSE DEVANT la conversation, comme une page poussée par-dessus un fil sur iPhone. L'ordre
/// inverse laissait la route posée mais invisible : réglages, notifications, le post d'un push ou d'un lien touché
/// fil ouvert n'ouvraient rien, et le premier « retour » se dépensait à retirer cette route que personne ne voyait.
/// `Router.onPopRequested` retire déjà la route avant la conversation : cet ordre est le sien.
enum iPadRightColumn: Equatable {
    case panel(Route)
    case conversation(Conversation)
    case conversationList

    static func resolve(conversation: Conversation?, panelRoute: Route?) -> iPadRightColumn {
        if let panelRoute { return .panel(panelRoute) }
        if let conversation { return .conversation(conversation) }
        return .conversationList
    }

    /// La conversation que la personne a SOUS LES YEUX : `nil` quand une route la recouvre. La pastille de
    /// synchronisation et le mini-lecteur s'effacent devant un fil visible, pas devant un fil recouvert.
    static func visibleConversationId(conversation: Conversation?, panelRoute: Route?) -> String? {
        panelRoute == nil ? conversation?.id : nil
    }
}

/// La pile du JEU au-dessus de la route racine du panneau droit (#9564, amendement n° 4). Elle ne vaut que pour SA
/// racine : un panneau ouvert sur une autre route part d'une pile vide, sans jamais rejouer une page d'avant.
struct GamePanelTrail {
    var root: Route?
    var path = NavigationPath()
    /// Les pages empilées, lisibles : `NavigationPath` ne rend pas ses éléments, et le relais vers l'iPhone
    /// (`RootNavigationHandoff`) doit pouvoir les reprendre.
    private(set) var routes: [Route] = []

    init(root: Route? = nil) {
        self.root = root
    }

    /// La pile renvoyée par la `NavigationStack` du panneau : un retour par glissement ne fait que la
    /// raccourcir, et les pages lisibles suivent.
    init(root: Route, path: NavigationPath, previous: GamePanelTrail) {
        self.root = root
        self.path = path
        self.routes = previous.root == root ? Array(previous.routes.prefix(path.count)) : []
    }

    func path(over route: Route) -> NavigationPath { root == route ? path : NavigationPath() }

    func routes(over route: Route) -> [Route] { root == route ? routes : [] }

    mutating func push(_ route: Route, over root: Route) {
        if self.root != root { self = GamePanelTrail(root: root) }
        path.append(route)
        routes.append(route)
    }

    mutating func pop() {
        guard !path.isEmpty else { return }
        path.removeLast()
        if !routes.isEmpty { routes.removeLast() }
    }
}

/// La pile du jeu, tenue par RÉFÉRENCE : une `Route` est lourde, et `iPadRootView` est une valeur que chaque
/// closure de son corps copie (budget de `ConversationViewValueSizeGuardTests`).
final class GamePanelTrailStore: ObservableObject {
    // Même garde que `Router` : une deinit synthétisée isolée plante au démontage hors d'une tâche (iOS 26.1).
    nonisolated deinit {}
    @Published var trail = GamePanelTrail()
}

/// Le panneau droit de l'iPad quand une route (autre qu'une conversation) y
/// est ouverte : une `NavigationStack` locale autour de `iPadPanelDestination`.
///
/// `NavigationStack` OBLIGATOIRE : sans lui, tout `NavigationLink` interne à un
/// écran du panneau est inerte (lignes de TrackingLinksView / ShareLinksView /
/// CommunityLinksView vers leur vue de détail — mortes sur iPad jusqu'au
/// 2026-07-29). `.id(route)` vide la pile locale quand on change de route,
/// sinon la vue de détail poussée survivrait au changement d'écran racine.
struct iPadRightPanel: View {
    let route: Route
    @Binding var rightPanelRoute: Route?
    /// La pile du jeu au-dessus de `route` (#9564) : vide hors de Progression.
    @Binding var gamePath: NavigationPath
    let notificationManager: NotificationToastManager
    let onOpenConversation: (Conversation) -> Void
    let onNotificationTap: (APINotification) -> Void

    var body: some View {
        NavigationStack(path: $gamePath) {
            iPadPanelDestination(
                route: route,
                rightPanelRoute: $rightPanelRoute,
                notificationManager: notificationManager,
                onOpenConversation: onOpenConversation,
                onNotificationTap: onNotificationTap
            )
            // Les pages du jeu poussées DANS le panneau : fiche, sous-page — le retour système et le glissement
            // depuis le bord y ramènent à la page d'au-dessus (#9564).
            .navigationDestination(for: Route.self) { pushed in
                iPadPanelDestination(
                    route: pushed,
                    rightPanelRoute: $rightPanelRoute,
                    notificationManager: notificationManager,
                    onOpenConversation: onOpenConversation,
                    onNotificationTap: onNotificationTap
                )
            }
            // Filet de sécurité pour les écrans qui délèguent leur chrome à la
            // barre système (membres d'une communauté…) :
            // racine du panneau, ils n'ont ni bouton retour propre ni geste de
            // retour, donc aucune sortie. Les écrans à en-tête maison posent
            // `.navigationBarHidden(true)` et ne voient jamais ce bouton.
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        HapticFeedback.light()
                        rightPanelRoute = nil
                    } label: {
                        Image(systemName: "chevron.backward")
                    }
                    .accessibilityLabel(String(localized: "root.ipad.close_panel", defaultValue: "Fermer", bundle: .main))
                }
            }
        }
        .id(route)
        // Rend `dismiss()` opérant pour les écrans racine du panneau : ils ne
        // sont ni poussés ni présentés, leur bouton retour n'avait donc aucun
        // effet. Cf. `PanelBackAction`.
        .environment(\.meeshyPanelDismiss, { rightPanelRoute = nil })
    }
}

/// L'écran du PANNEAU DROIT de l'iPad pour une `Route`.
///
/// Une struct NOMINALE, et non une fonction `@ViewBuilder` d'extension
/// (#5837) : appelée depuis `rightColumn`, le `switch` à 27 cas — arbre
/// `_ConditionalContent` plus la chaîne de chaque cas — entrait dans le type
/// concret de `iPadRootView.body`. Ici la racine ne voit qu'un nom.
struct iPadPanelDestination: View {
    let route: Route
    @Binding var rightPanelRoute: Route?
    let notificationManager: NotificationToastManager
    let onOpenConversation: (Conversation) -> Void
    let onNotificationTap: (APINotification) -> Void

    var body: some View {
        switch route {
        case .settings:
            SettingsView()
                                .navigationBarHidden(true)
        case .profile:
            ProfileView()
                                .navigationBarHidden(true)
        case .contacts(let initialTab):
            ContactsHubView(initialTab: initialTab)
                .navigationBarHidden(true)
        case .peopleDiscovery(let initialTab):
            PeopleDiscoveryView(initialTab: initialTab)
                .navigationBarHidden(true)
        case .nearbyDiscovery(let initialCoordinate):
            NearbyDiscoveryView(initialCoordinate: initialCoordinate?.coordinate)
                .navigationBarHidden(true)
        case .communityList:
            CommunityListView(
                onSelectCommunity: { community in
                    rightPanelRoute = .communityDetail(community.id)
                },
                onCreateCommunity: {
                    rightPanelRoute = .communityCreate
                },
                onDismiss: { rightPanelRoute = nil }
            )
            .navigationBarHidden(true)
        case .communityDetail(let communityId):
            CommunityDetailView(
                communityId: communityId,
                onSelectConversation: { apiConversation in
                    let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                    let conv = apiConversation.toConversation(currentUserId: currentUserId)
                    onOpenConversation(conv)
                },
                onOpenSettings: { community in
                    rightPanelRoute = .communitySettings(community)
                },
                onOpenMembers: { id in
                    rightPanelRoute = .communityMembers(id)
                },
                onInvite: { id in
                    rightPanelRoute = .communityInvite(id)
                },
                onDismiss: { rightPanelRoute = nil }
            )
            .navigationBarHidden(true)
        case .communityCreate:
            CommunityCreateView(
                onCreated: { community in
                    rightPanelRoute = .communityDetail(community.id)
                },
                onDismiss: { rightPanelRoute = nil }
            )
            .navigationBarHidden(true)
        case .communitySettings(let community):
            CommunitySettingsView(
                community: community,
                onUpdated: { _ in rightPanelRoute = .communityDetail(community.id) },
                onDeleted: { rightPanelRoute = nil },
                onLeft: { rightPanelRoute = nil },
                // « Annuler » revient au détail de la communauté, comme le retour de pile sur iPhone.
                onCancel: { rightPanelRoute = .communityDetail(community.id) }
            )
        case .communityMembers(let communityId):
            CommunityMembersView(
                communityId: communityId,
                onInvite: {
                    rightPanelRoute = .communityInvite(communityId)
                }
            )
        case .communityInvite(let communityId):
            CommunityInviteView(communityId: communityId, onDone: { rightPanelRoute = nil })
        case .notifications:
            NotificationListView(
                onNotificationTap: { notification in
                    onNotificationTap(notification)
                },
                onDismiss: { rightPanelRoute = nil },
                onQuickAction: { action in
                    await NotificationQuickActionPerformer(openConversation: onOpenConversation)
                        .perform(action)
                }
            )
                        .navigationBarHidden(true)
            .onDisappear {
                Task { await notificationManager.refreshUnreadCount() }
            }
        case .userStats:
            UserStatsView()
                                .navigationBarHidden(true)
        // L'ancien tableau de bord (#9564, amendement n° 4) ouvre la première page, une version durant.
        case .progression, .progressionDashboard:
            ProgressionView()
                                .navigationBarHidden(true)
        case .progressionSection(let section):
            ProgressionSectionPage(section: section)
                .navigationBarHidden(true)
        case .progressionRules(let rule, let section):
            GameRulesPage(focusedRule: rule, focusedSection: section)
                .navigationBarHidden(true)
        case .progressionNotebook:
            GameNotebookPage()
                .navigationBarHidden(true)
        case .gamePage(let page, let focus):
            GamePageView(page: page, focus: focus)
                .navigationBarHidden(true)
        case .progressionConcept(let concept, let section):
            ProgressionConceptPage(concept: concept, section: section)
                .navigationBarHidden(true)
        case .links:
            LinksHubView()
                        case .affiliate:
            AffiliateView()
                                .navigationBarHidden(true)
        case .trackingLinks:
            TrackingLinksView()
                                .navigationBarHidden(true)
        case .shareLinks:
            ShareLinksView()
                                .navigationBarHidden(true)
        case .communityLinks:
            CommunityLinksView()
                                .navigationBarHidden(true)
        case .dataExport:
            DataExportView()
                                .navigationBarHidden(true)
        case .postDetail(let postId, let initialPost, let showComments, let commentId, let parentCommentId):
            PostDetailView(postId: postId, initialPost: initialPost, showComments: showComments, targetCommentId: commentId, targetParentCommentId: parentCommentId)
        case .hashtagResults(let tag):
            HashtagResultsView(tag: tag)
        case .bookmarks:
            // Idem iPhone : l'en-tête partagé porte le titre et le retour, qui
            // ferme le panneau par `PanelBackAction` (#6481).
            BookmarksView()
                .navigationBarHidden(true)
        case .starredMessages:
            StarredMessagesView()
                .navigationBarHidden(true)
        case .friendRequests:
            FriendRequestListView()
                                .navigationBarHidden(true)
        case .conversation:
            EmptyView()
        case .storyNotificationTarget(let storyId, let intent, let context, let commentId, let parentCommentId):
            // Mirrors iPhone (RootView) so that tapping a story-related
            // notification on iPad lands on the same Phase E/F screen
            // (loading → active → expired). The screen presents the viewer
            // through the shared `StoryViewerCoordinator` env object.
            StoryNotificationTargetScreen(
                storyId: storyId,
                intent: intent,
                context: context,
                commentId: commentId,
                parentCommentId: parentCommentId
            )
            .navigationBarHidden(true)
        case .moodSpotlight(let statusId):
            MoodSpotlightView(statusId: statusId)
        }
    }
}

struct iPadLeftColumnHeader: View {
    let title: String
    var showFeedButton: Bool = false
    var onFeedTap: (() -> Void)?
    var notificationCount: Int = 0
    var onNotificationsTap: (() -> Void)?
    var onSettingsTap: (() -> Void)?

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            if showFeedButton {
                Button {
                    HapticFeedback.light()
                    onFeedTap?()
                } label: {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        Image(systemName: "square.stack.fill")
                            .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .semibold))
                        Text(String(localized: "root.ipad.feed", defaultValue: "Flux", bundle: .main))
                            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                    }
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.indigo500, MeeshyColors.indigo700],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .padding(.horizontal, MeeshySpacing.md)
                    .padding(.vertical, MeeshySpacing.xsPlus)
                    .background(
                        Capsule()
                            .fill(MeeshyColors.indigo100.opacity(isDark ? 0.15 : 1))
                    )
                }
            }

            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            if let onNotificationsTap {
                Button {
                    HapticFeedback.light()
                    onNotificationsTap()
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "bell.fill")
                            .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .medium))
                            .foregroundColor(theme.textSecondary)

                        if notificationCount > 0 {
                            Text(NotificationBadge.displayed(notificationCount))
                                // Doctrine 86i : le compteur reste figé face au Dynamic
                                // Type, mais la pastille s'élargit — « 99+ » entier.
                                .font(MeeshyFont.relative(MeeshyFont.microSize, weight: NotificationBadge.fontWeight))
                                .foregroundColor(.white)
                                .lineLimit(1)
                                .padding(.horizontal, MeeshySpacing.xs)
                                .frame(minWidth: 16, minHeight: 16)
                                .background(Capsule().fill(MeeshyColors.error))
                                .offset(x: 6, y: -6)
                                .accessibilityHidden(true)
                        }
                    }
                }
                .accessibilityLabel(String(localized: "root.ipad.notifications", defaultValue: "Notifications", bundle: .main))
                .accessibilityValue(notificationCount > 0 ? String(notificationCount) : "")
            }

            if let onSettingsTap {
                Button {
                    HapticFeedback.light()
                    onSettingsTap()
                } label: {
                    Image(systemName: "gearshape.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                }
                .accessibilityLabel(String(localized: "root.ipad.settings", defaultValue: "Paramètres", bundle: .main))
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
        .background(theme.backgroundPrimary.opacity(0.95))
    }
}

// MARK: - iPad Resizable Handle

struct iPadResizableHandle: View {
    @Binding var ratio: Double
    let windowWidth: CGFloat
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @State private var isDragging = false
    /// La part de la colonne AU DÉBUT du geste. `value.translation` se mesure depuis ce début : l'ajouter à une
    /// part déjà déplacée par l'événement précédent comptait le même déplacement à chaque image, et la poignée
    /// filait devant le doigt.
    @State private var dragStartRatio: Double?

    private let handleWidth: CGFloat = 20

    var body: some View {
        ZStack {
            Rectangle()
                .fill(isDark ? Color.white.opacity(MeeshyOpacity.subtle) : Color.black.opacity(MeeshyOpacity.subtle))
                .frame(width: 1)

            RoundedRectangle(cornerRadius: 2)
                .fill(isDragging ? MeeshyColors.indigo400 : (isDark ? Color.white.opacity(MeeshyOpacity.light) : Color.black.opacity(MeeshyOpacity.light)))
                .frame(width: 4, height: 36)
                .animation(.easeInOut(duration: 0.15), value: isDragging)
        }
        .frame(width: handleWidth)
        .contentShape(Rectangle())
        .meeshyColumnResizePointer()
        .gesture(
            // minimumDistance > tap-wobble so an accidental tap near the divider
            // never starts a resize (and never swallows a nearby tap sequence).
            DragGesture(minimumDistance: 8)
                .onChanged { value in
                    isDragging = true
                    let start = dragStartRatio ?? ratio
                    dragStartRatio = start
                    ratio = ColumnWidthLaw.dragged(
                        from: start, translation: value.translation.width, windowWidth: windowWidth)
                }
                .onEnded { _ in
                    isDragging = false
                    dragStartRatio = nil
                }
        )
        .ignoresSafeArea()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "root.ipad.resizable_handle.label", defaultValue: "Séparateur de colonnes", bundle: .main))
        .accessibilityValue(String(format: String(localized: "root.ipad.resizable_handle.value_points", defaultValue: "%d points", bundle: .main), Int(ColumnWidthLaw.width(ratio: ratio, windowWidth: windowWidth))))
        .accessibilityHint(String(format: String(localized: "root.ipad.resizable_handle.hint_width", defaultValue: "Ajuste la largeur de la colonne de gauche entre %d et %d points", bundle: .main), Int(ColumnWidthLaw.minimumWidth), Int(ColumnWidthLaw.maximumWidth)))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment:
                ratio = ColumnWidthLaw.stepped(ratio, by: 1, windowWidth: windowWidth)
            case .decrement:
                ratio = ColumnWidthLaw.stepped(ratio, by: -1, windowWidth: windowWidth)
            @unknown default:
                break
            }
        }
    }
}
