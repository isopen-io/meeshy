import SwiftUI
import Combine
import MeeshySDK
import os
import MeeshyUI

// MARK: - PaginatedParticipant convenience (uses SDK type directly)

// MARK: - ConversationInfoSheet

struct ConversationInfoSheet: View {
    let conversation: Conversation
    let accentColor: String
    let messages: [Message]
    /// Remonte à l'hôte la conversation FUSIONNÉE que `ConversationSettingsView`
    /// vient de recevoir du serveur. Sans ce relais, l'écran déjà ouvert reste
    /// sur la valeur figée capturée à la navigation : le titre et l'avatar
    /// d'AVANT l'édition, alors que le serveur a confirmé les nouveaux.
    var onConversationUpdated: ((Conversation) -> Void)? = nil
    /// #8103 — ce que l'hôte fait d'un élément de l'onglet Médias (galerie,
    /// « aller au message »). L'onglet lit l'INDEX de la conversation, jamais
    /// `messages` : depuis la liste des conversations, ce tableau est vide.
    let mediaHubActions: ConversationMediaHubActions
    /// Dérivés UNE fois de `messages` (un `let`) — relus jusqu'à quatre fois par rendu avant.
    let pinnedMessages: [Message]

    init(conversation: Conversation, accentColor: String, messages: [Message],
         mediaHubActions: ConversationMediaHubActions = .none,
         onConversationUpdated: ((Conversation) -> Void)? = nil) {
        self.conversation = conversation
        self.accentColor = accentColor
        self.messages = messages
        self.mediaHubActions = mediaHubActions
        self.onConversationUpdated = onConversationUpdated
        pinnedMessages = messages.filter { $0.pinnedAt != nil }
            .sorted { ($0.pinnedAt ?? .distantPast) > ($1.pinnedAt ?? .distantPast) }
    }

    @Environment(\.dismiss) var dismiss
    @Environment(\.colorScheme) private var colorScheme
    var isDark: Bool { colorScheme == .dark }
    var theme: ThemeManager { ThemeManager.shared }
    // Lecture directe sans @ObservedObject — évite que chaque event presence force
    // un re-render complet de la fiche conversation.
    var presenceManager: PresenceManager { PresenceManager.shared }
    // Feuille : hérite des EnvironmentValues, PAS des EnvironmentObject.
    // Cf. SocialChromeEnvironment.swift.
    @Environment(\.meeshyMoodEmojiResolver) var moodEmojiResolver
    @Environment(\.meeshyMoodTapResolver) var moodTapResolver

    @State var participants: [PaginatedParticipant] = []
    @State var isLoadingParticipants = false
    @State var isLoadingMoreParticipants = false
    @State var hasMoreParticipants = true
    @State var appearAnimation = false
    @State private var selectedTab: InfoTab = .members
    @State var showBlockConfirm = false
    @State var isBlocking = false
    @State var isCreatingShareLink = false
    @State var memberSearchQuery: String = ""

    /// Freshly minted join link awaiting the system share sheet. Presenting it
    /// through `.sheet(item:)` lets SwiftUI own the presentation — the previous
    /// hand-rolled `UIActivityViewController` + window-hierarchy walk anchored
    /// the iPad popover at `CGRect.zero` (top-left corner) and picked a scene
    /// out of the *unordered* `connectedScenes` set. Replaces the former
    /// `createdShareLinkId` / `showShareSheet` pair, which was written but
    /// never read.
    @State var shareableLink: ShareableLink?
    @State var showLeaveConfirmation = false
    @State private var showSecurityVerification = false

    static let logger = MeeshyLog.logger(.conversationInfo)

    @State var showAllPinnedMessages = false
    /// #17907 — le défilement de la fiche, lu par l'en-tête, la barre compacte et les onglets
    /// seulement (`ScrollOffsetReader`) : la racine ne se re-rend pas à chaque image.
    @State private var scrollRelay = ScrollOffsetRelay()

    enum InfoTab: CaseIterable {
        case members, media, plus, preferences
    }

    var accent: Color { Color(hex: accentColor) }
    var isDirect: Bool { conversation.type == .direct }
    var otherUserId: String? { conversation.participantUserId }

    var canManageMembers: Bool {
        guard let role = conversation.currentUserRole?.lowercased() else { return false }
        return ["creator", "admin", "moderator"].contains(role)
    }

    // MARK: - Body

    private var resolvedUserRole: MemberRole {
        MemberRole(rawValue: conversation.currentUserRole?.lowercased() ?? "member") ?? .member
    }

    /// La rangée de sécurité : l'autre tête-à-tête de la paire s'ouvre par son id (#12966).
    private var securityRow: ConversationInfoSecurityRow {
        ConversationInfoSecurityRow(
            conversationId: conversation.id,
            accentColor: accentColor,
            isDirect: isDirect,
            encryptionMode: conversation.encryptionMode,
            isDark: isDark,
            appearAnimation: appearAnimation,
            onVerifySafetyNumber: { showSecurityVerification = true },
            peer: otherUserId.map { ConversationEncryptionPeer(userId: $0, name: conversation.name) },
            onOpenConversation: { id in
                dismiss()
                NotificationCenter.default.post(name: .meeshyNavigateToConversation, object: id)
            }
        )
    }

    var body: some View {
        NavigationStack {
            collapsibleLayout
                .navigationBarHidden(true)
            .navigationDestination(for: String.self) { destination in
                if destination == "settings" {
                    ConversationSettingsView(
                        conversation: conversation,
                        currentUserRole: resolvedUserRole,
                        onUpdated: { updated in
                            onConversationUpdated?(updated)
                            dismiss()
                        },
                        onLeft: { dismiss() }
                    )
                }
            }
        }
        .presentationDragIndicator(.visible)
        .task {
            await loadParticipants()
        }
        .repaintingPeers($participants)
        .alert(String(localized: "conversation.info.block.title", defaultValue: "Bloquer cet utilisateur", bundle: .main), isPresented: $showBlockConfirm) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) { }
            Button(String(localized: "conversation.info.block.confirm", defaultValue: "Bloquer", bundle: .main), role: .destructive) {
                blockOtherUser()
            }
        } message: {
            Text(String(format: String(localized: "conversation.info.block.message", defaultValue: "Plus aucun message de %@ ; débloquable dans les réglages.", bundle: .main), conversation.name))
        }
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                appearAnimation = true
            }
        }
        .alert(String(localized: "conversation.info.leave.title", defaultValue: "Quitter la conversation", bundle: .main), isPresented: $showLeaveConfirmation) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            Button(String(localized: "conversation.info.leave.confirm", defaultValue: "Quitter", bundle: .main), role: .destructive) {
                Task { await leaveConversation() }
            }
        } message: {
            Text(String(localized: "conversation.info.leave.message", defaultValue: "Vous ne recevrez plus de messages ; votre historique reste lisible.", bundle: .main))
        }
        .sheet(isPresented: $showSecurityVerification) {
            SecurityVerificationView(
                conversationName: conversation.name,
                safetyNumber: nil
            )
        }
        .sheet(isPresented: $showAllPinnedMessages) {
            allPinnedMessagesSheet
        }
        .sheet(item: $shareableLink) { link in
            ShareSheet(activityItems: [link.url])
        }
        .withStatusBubble().closesForConversationOpening(.sheet)
    }

    // MARK: - Sheet Background

    private var sheetBackground: some View {
        ZStack {
            theme.backgroundPrimary
                .ignoresSafeArea()

            Circle()
                .fill(accent.opacity(isDark ? 0.06 : 0.04))
                .frame(width: 300, height: 300)
                .blur(radius: 80)
                .offset(x: -60, y: -120)
                .ignoresSafeArea()

            Circle()
                .fill(accent.opacity(isDark ? 0.04 : 0.02))
                .frame(width: 200, height: 200)
                .blur(radius: 60)
                .offset(x: 100, y: 80)
                .ignoresSafeArea()
        }
    }

    // MARK: - Collapsible layout (#17907)

    /// Un seul défilement, comme la fiche profil (`UserProfileSheet.collapsibleLayout`) :
    /// l'en-tête, les actions, la sécurité et les épinglés s'en vont avec le contenu, la
    /// barre d'onglets s'épingle en haut et la barre compacte prend le relais de l'en-tête.
    private var collapsibleLayout: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                GeometryReader { geo in
                    Color.clear.preference(
                        key: ScrollOffsetPreferenceKey.self,
                        value: geo.frame(in: .named(Self.scrollSpace)).minY
                    )
                }
                .frame(height: 0)

                LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                    ScrollOffsetReader(relay: scrollRelay) { offset in
                        collapsibleHeader(offset: offset)
                    }
                    if isDirect, otherUserId != nil {
                        blockUserButton
                    }
                    actionButtons
                    securityRow
                    pinnedPreview

                    Section {
                        tabContent
                    } header: {
                        ScrollOffsetReader(relay: scrollRelay) { offset in
                            pinnedTabBar(offset: offset)
                        }
                    }
                }
            }
        }
        .coordinateSpace(name: Self.scrollSpace)
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }
        .trackScrollContentOffset { scrollRelay.offset = -$0 }
        .scrollDismissesKeyboard(.interactively)
        .background(sheetBackground)
        .ignoresSafeArea(edges: .top)
        .overlay(alignment: .top) {
            ScrollOffsetReader(relay: scrollRelay) { offset in
                let progress = ProfileHeaderMetrics.progress(offset: offset)
                compactPinnedBar
                    .opacity(Double(progress))
                    .allowsHitTesting(progress > 0.5)
                    .accessibilityHidden(progress <= 0.5)
            }
        }
        .overlay(alignment: .topLeading) { closeButton }
        .overlay(alignment: .topTrailing) { settingsButton }
    }

    private static let scrollSpace = "conversationInfoScroll"

    // MARK: - Floating controls (Liquid Glass, like the profile sheet)

    private var closeButton: some View {
        MeeshyGlassButton(
            systemImage: "xmark",
            label: String(localized: "common.close", defaultValue: "Fermer", bundle: .main),
            size: .s36
        ) {
            dismiss()
        }
        .padding(floatingControlInsets(leading: true))
    }

    @ViewBuilder
    private var settingsButton: some View {
        if canManageMembers && !isDirect {
            NavigationLink(value: "settings") {
                MeeshyGlassButtonFace(systemImage: "gearshape.fill", size: .s36)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .meeshyTapTarget()
            .padding(floatingControlInsets(leading: false))
            .accessibilityLabel(String(localized: "conversation.info.settings-a11y", defaultValue: "Réglages de la conversation", bundle: .main))
        }
    }

    private func floatingControlInsets(leading: Bool) -> EdgeInsets {
        let side = MeeshySpacing.lg
        return EdgeInsets(top: MeeshySpacing.mdPlus, leading: leading ? side : 0, bottom: 0, trailing: leading ? 0 : side)
    }

    // MARK: - Collapsible header

    /// L'en-tête s'efface en défilant, comme celui du profil ; la barre compacte prend le relais.
    private func collapsibleHeader(offset: CGFloat) -> some View {
        let progress = ProfileHeaderMetrics.progress(offset: offset)
        return heroConversationHeader
            .scaleEffect(1 - 0.12 * progress, anchor: .top)
            .opacity(appearAnimation ? 1 - Double(progress) : 0)
            .offset(y: appearAnimation ? 0 : 10)
            .accessibilityHidden(progress > 0.5)
    }


    // MARK: - Pinned tab bar (section header — pins on scroll, like the profile sheet)

    private func pinnedTabBar(offset: CGFloat) -> some View {
        let progress = ProfileHeaderMetrics.progress(offset: offset)
        return VStack(spacing: 0) {
            HStack(spacing: 0) {
                ForEach(InfoTab.allCases, id: \.self) { tab in
                    tabButton(tab)
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.md)

            Divider()
                .opacity(MeeshyOpacity.medium)
        }
        // Le fond AVANT le décalage : la bande de la barre compacte reste hors du toucher (cf. fiche profil).
        .background(theme.backgroundPrimary)
        .padding(.top, ProfileHeaderMetrics.collapsedBar * progress)
        .opacity(appearAnimation ? 1 : 0)
    }

    private func tabButton(_ tab: InfoTab) -> some View {
        let isSelected = selectedTab == tab
        return Button {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                selectedTab = tab
            }
        } label: {
            VStack(spacing: MeeshySpacing.xs) {
                HStack(spacing: MeeshySpacing.xs) {
                    Image(systemName: tabIcon(for: tab))
                        .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                    Text(tabLabel(for: tab))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                .foregroundStyle(isSelected ? accent : theme.textMuted)
                .padding(.vertical, MeeshySpacing.smPlus)

                Rectangle()
                    .fill(isSelected ? accent : Color.clear)
                    .frame(height: 2)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(tabLabel(for: tab))
        // L'onglet actif ne se dit pas qu'à la couleur (WCAG 1.4.1).
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    // MARK: - Tab Content

    @ViewBuilder
    private var tabContent: some View {
        Group {
            switch selectedTab {
            case .members:
                membersSection
            case .media:
                ConversationMediaHubView(conversationId: conversation.id, accentColor: accentColor, actions: mediaHubActions)
            case .plus:
                ConversationDashboardView(
                    conversationId: conversation.id,
                    messages: messages,
                    accentColor: accentColor
                )
            case .preferences:
                ConversationPreferencesTab(conversation: conversation, accentColor: accentColor)
            }
        }
        .padding(.top, MeeshySpacing.sm)
        .animation(.easeInOut(duration: 0.2), value: selectedTab)
    }

    // MARK: - Helpers

    private func tabLabel(for tab: InfoTab) -> String {
        switch tab {
        case .members: return String(localized: "conversation.info.tab.members", defaultValue: "Membres", bundle: .main)
        case .media: return String(localized: "conversation.info.tab.media", defaultValue: "Médias", bundle: .main)
        case .plus: return String(localized: "conversation.info.tab.stats", defaultValue: "Stats", bundle: .main)
        case .preferences: return String(localized: "conversation.info.tab.options", defaultValue: "Options", bundle: .main)
        }
    }

    private func tabIcon(for tab: InfoTab) -> String {
        switch tab {
        case .members: return "person.2.fill"
        case .media: return "photo.on.rectangle.angled"
        case .plus: return "chart.bar.fill"
        case .preferences: return "slider.horizontal.3"
        }
    }

    func attachmentIcon(_ type: MessageAttachment.AttachmentType) -> String {
        switch type {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "location.fill"
        }
    }

    func attachmentLabel(_ type: MessageAttachment.AttachmentType) -> String {
        MediaKindLabel.name(MediaKindLabel.kind(for: type))
    }
}
