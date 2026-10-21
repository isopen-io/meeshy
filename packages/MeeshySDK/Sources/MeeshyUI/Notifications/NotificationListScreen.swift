import SwiftUI
import Combine
import MeeshySDK

// MARK: - NotificationListScreen

public struct NotificationListScreen<ViewModel: NotificationListModeling>: View {
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var viewModel: ViewModel

    public var onNotificationTap: ((APINotification) -> Void)?
    public var onDismiss: (() -> Void)?
    /// Exécute un geste de rangée (`NotificationQuickAction`) et dit s'il a
    /// abouti. `nil` : aucune rangée ne propose de geste.
    public var onQuickAction: (@MainActor (NotificationQuickAction) async -> Bool)?

    @State private var scrollRelay = ScrollOffsetRelay()
    /// Les personnes à qui « Se connecter » est parti depuis cet écran —
    /// posé AVANT l'aller-retour, retiré s'il échoue.
    @State private var connectRequestedIds: Set<String> = []

    private let brandColor = MeeshyColors.indigo500

    public init(
        viewModel: ViewModel,
        onNotificationTap: ((APINotification) -> Void)? = nil,
        onDismiss: (() -> Void)? = nil,
        onQuickAction: (@MainActor (NotificationQuickAction) async -> Bool)? = nil
    ) {
        self.viewModel = viewModel
        self.onNotificationTap = onNotificationTap
        self.onDismiss = onDismiss
        self.onQuickAction = onQuickAction
    }

    public var body: some View {
        VStack(spacing: 0) {
            header
            filterBar
            notificationList
        }
        .background(theme.backgroundGradient.ignoresSafeArea())
        .task { await viewModel.loadInitial() }
    }

    // MARK: - Gestes de rangée (#8105)

    /// « Écrire » ouvre ailleurs, la notification est donc lue ; « Se
    /// connecter » s'affiche envoyé tout de suite et se défait s'il échoue.
    private func runQuickAction(_ action: NotificationQuickAction,
                                on notification: APINotification,
                                perform: @escaping (NotificationQuickAction) async -> Bool) {
        Task {
            await viewModel.markRead(notification)
            guard case .connect(let userId) = action else {
                _ = await perform(action)
                return
            }
            connectRequestedIds.insert(userId)
            if !(await perform(action)) { connectRequestedIds.remove(userId) }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 0) {
            // Seul ce reader se re-rend au fil du scroll — la racine écrit
            // `scrollRelay.offset` sans s'y abonner (P1-1).
            ScrollOffsetReader(relay: scrollRelay) { offset in
                CollapsibleHeader(
                    title: String(localized: "notifications.title", defaultValue: "Notifications", bundle: .module),
                    scrollOffset: offset,
                    onBack: { onDismiss?() },
                    titleColor: theme.textPrimary,
                    backArrowColor: brandColor,
                    backgroundColor: theme.backgroundPrimary,
                    trailing: {
                        if viewModel.unreadCount > 0 {
                            Button {
                                HapticFeedback.light()
                                Task { await viewModel.markAllRead() }
                            } label: {
                                Text(String(localized: "notifications.markAllRead", defaultValue: "Tout lire", bundle: .module))
                                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                                    .foregroundColor(brandColor)
                            }
                        } else {
                            EmptyView()
                        }
                    }
                )
            }

            if viewModel.unreadCount > 0 {
                Text(NotificationListCopy.unreadLabel(count: viewModel.unreadCount))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                    .foregroundColor(brandColor)
                    .padding(.bottom, MeeshySpacing.xs)
            }
        }
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(NotificationCategory.allCases, id: \.self) { category in
                    filterChip(category: category)
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.sm)
        }
    }

    private func filterChip(category: NotificationCategory) -> some View {
        let isSelected = viewModel.selectedCategory == category
        let chipColor = category.color

        return Button {
            HapticFeedback.light()
            // #7169 puis #8958 — la puce s'allume et la liste se redessine
            // TOUT DE SUITE, depuis ce qui est déjà chargé ; la page serveur
            // de la catégorie arrive ensuite, sans spinner (`select`).
            Task { await viewModel.select(category) }
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: category.icon)
                    .font(.system(size: MeeshyIconSize.xxs, weight: .bold))
                Text(category.label)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
            }
            .foregroundColor(isSelected ? .white : Color(hex: chipColor))
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.xsPlus)
            .background(
                Capsule()
                    .fill(isSelected ? Color(hex: chipColor) : Color(hex: chipColor).opacity(MeeshyOpacity.light))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - List

    private var filteredNotifications: [APINotification] {
        viewModel.filteredNotifications
    }

    private var notificationList: some View {
        Group {
            if viewModel.isLoading && viewModel.notifications.isEmpty {
                NotificationListSkeleton()
            } else if viewModel.loadDidFail && viewModel.notifications.isEmpty {
                // La panne AVANT le vide : sans cet ordre, une erreur réseau
                // se lit « Aucune notification ».
                NotificationListErrorState(brandColor: brandColor) {
                    Task { await viewModel.loadInitial() }
                }
            } else if filteredNotifications.isEmpty {
                emptyState
            } else {
                List {
                    // Le lecteur de décalage du chemin iOS 16–17 : une ligne de
                    // hauteur nulle, en tête.
                    GeometryReader { geo in
                        Color.clear.preference(
                            key: ScrollOffsetPreferenceKey.self,
                            value: geo.frame(in: .named("scroll")).minY
                        )
                    }
                    .frame(height: 0)
                    .notificationListRow()

                    ForEach(filteredNotifications) { notification in
                        notificationRow(notification)
                    }

                    if viewModel.hasMore {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding()
                            .notificationListRow()
                            .onAppear {
                                Task { await viewModel.loadMore() }
                            }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .environment(\.defaultMinListRowHeight, 0)
                .animation(.easeInOut(duration: 0.25), value: filteredNotifications.map(\.id))
                .coordinateSpace(name: "scroll")
                .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }   // iOS 16–17
                .trackScrollContentOffset { scrollRelay.offset = -$0 }                            // iOS 18+ (preference path is dead there)
                .refreshable {
                    await viewModel.loadInitial()
                }
            }
        }
    }

    private func notificationRow(_ notification: APINotification) -> some View {
        NotificationRowView(
            notification: notification,
            onTap: {
                Task { await viewModel.markRead(notification) }
                onNotificationTap?(notification)
            },
            onMarkRead: {
                Task { await viewModel.markRead(notification) }
            },
            onDelete: {
                Task { await viewModel.deleteNotification(notification) }
            },
            onQuickAction: onQuickAction.map { perform in
                { action in runQuickAction(action, on: notification, perform: perform) }
            },
            isConnectRequested: notification.senderId.map(connectRequestedIds.contains) ?? false,
            isFriend: notification.senderId.map { FriendshipCache.shared.isFriend($0) } ?? false
        )
        .equatable()
        .notificationListRow()
        // #8958 — le glissement vers la gauche VIDE la ligne.
        // Il vit ici et non dans la rangée : `.swipeActions` n'a
        // d'effet que dans une `List`.
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                Task { await viewModel.deleteNotification(notification) }
            } label: {
                Label(
                    String(localized: "notifications.swipe.delete", defaultValue: "Supprimer", bundle: .module),
                    systemImage: "trash.fill"
                )
            }
            if !notification.isRead {
                Button {
                    Task { await viewModel.markRead(notification) }
                } label: {
                    Label(
                        String(localized: "notifications.swipe.read", defaultValue: "Lu", bundle: .module),
                        systemImage: "envelope.open.fill"
                    )
                }
                .tint(brandColor)
            }
        }
    }

    // MARK: - States
    //
    // Le squelette et l'état d'erreur vivent dans `NotificationListStates.swift`
    // — voir son en-tête pour ce qu'ils remplacent (un spinner sur cache vide,
    // et une panne qui se lisait « Aucune notification »).

    private var emptyState: some View {
        let category = viewModel.selectedCategory
        let emptyMessage: String = {
            switch category {
            case .all: return String(localized: "notifications.empty.all", defaultValue: "Aucune notification", bundle: .module)
            case .unread: return String(localized: "notifications.empty.unread", defaultValue: "Aucune notification non lue", bundle: .module)
            case .messages: return String(localized: "notifications.empty.messages", defaultValue: "Aucune notification de message", bundle: .module)
            case .reactions: return String(localized: "notifications.empty.reactions", defaultValue: "Aucune reaction", bundle: .module)
            case .mentions: return String(localized: "notifications.empty.mentions", defaultValue: "Aucune mention", bundle: .module)
            case .social: return String(localized: "notifications.empty.social", defaultValue: "Aucune notification sociale", bundle: .module)
            case .engagement: return String(localized: "notifications.empty.engagement", defaultValue: "Aucun engagement", bundle: .module)
            case .contacts: return String(localized: "notifications.empty.contacts", defaultValue: "Aucune notification de contact", bundle: .module)
            case .groups: return String(localized: "notifications.empty.groups", defaultValue: "Aucune notification de groupe", bundle: .module)
            case .calls: return String(localized: "notifications.empty.calls", defaultValue: "Aucun appel manqué", bundle: .module)
            case .translations: return String(localized: "notifications.empty.translations", defaultValue: "Aucune traduction", bundle: .module)
            case .system: return String(localized: "notifications.empty.system", defaultValue: "Aucune notification système", bundle: .module)
            }
        }()

        return VStack(spacing: MeeshySpacing.lg) {
            Spacer()
            Image(systemName: category.icon)
                .font(.system(size: MeeshyIconSize.hero))
                .foregroundColor(Color(hex: category.color).opacity(0.4))

            Text(emptyMessage)
                .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Text(String(localized: "notifications.empty.subtitle", defaultValue: "Vos notifications apparaîtront ici", bundle: .module))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                .foregroundColor(theme.textMuted)
            Spacer()
        }
    }
}

private extension View {
    /// Une ligne de la cloche dans la `List` : bord à bord, sans séparateur ni
    /// fond de cellule — la rangée dessine elle-même son fond de non-lu.
    func notificationListRow() -> some View {
        listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }
}
