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

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    var isDark: Bool { colorScheme == .dark }
    var theme: ThemeManager { ThemeManager.shared }
    // Lecture directe sans @ObservedObject — évite que chaque event presence force
    // un re-render complet de la fiche conversation.
    private var presenceManager: PresenceManager { PresenceManager.shared }
    // Feuille : hérite des EnvironmentValues, PAS des EnvironmentObject.
    // Cf. SocialChromeEnvironment.swift.
    @Environment(\.meeshyMoodEmojiResolver) private var moodEmojiResolver
    @Environment(\.meeshyMoodTapResolver) private var moodTapResolver

    @State private var participants: [PaginatedParticipant] = []
    @State private var isLoadingParticipants = false
    @State private var isLoadingMoreParticipants = false
    @State private var hasMoreParticipants = true
    @State var appearAnimation = false
    @State private var selectedTab: InfoTab = .members
    @State private var showBlockConfirm = false
    @State private var isBlocking = false
    @State private var isCreatingShareLink = false

    /// Freshly minted join link awaiting the system share sheet. Presenting it
    /// through `.sheet(item:)` lets SwiftUI own the presentation — the previous
    /// hand-rolled `UIActivityViewController` + window-hierarchy walk anchored
    /// the iPad popover at `CGRect.zero` (top-left corner) and picked a scene
    /// out of the *unordered* `connectedScenes` set. Replaces the former
    /// `createdShareLinkId` / `showShareSheet` pair, which was written but
    /// never read.
    @State private var shareableLink: ShareableLink?
    @State private var showLeaveConfirmation = false
    @State private var showSecurityVerification = false

    private static let logger = MeeshyLog.logger(.conversationInfo)

    @State var showAllPinnedMessages = false

    enum InfoTab: CaseIterable {
        case members, media, plus, preferences
    }

    var accent: Color { Color(hex: accentColor) }
    private var isDirect: Bool { conversation.type == .direct }
    private var otherUserId: String? { conversation.participantUserId }

    private var canManageMembers: Bool {
        guard let role = conversation.currentUserRole?.lowercased() else { return false }
        return ["creator", "admin", "moderator"].contains(role)
    }

    // MARK: - Body

    private var resolvedUserRole: MemberRole {
        MemberRole(rawValue: conversation.currentUserRole?.lowercased() ?? "member") ?? .member
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                headerBar
                    .zIndex(1)
                conversationHeader
                if isDirect, otherUserId != nil {
                    blockUserButton
                }
                actionButtons
                ConversationInfoSecurityRow(
                    conversationId: conversation.id,
                    accentColor: accentColor,
                    isDirect: isDirect,
                    encryptionMode: conversation.encryptionMode,
                    isDark: isDark,
                    appearAnimation: appearAnimation,
                    onVerifySafetyNumber: { showSecurityVerification = true }
                )
                pinnedPreview
                tabSelector
                tabContent
            }
            .background(sheetBackground)
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
            Text(String(format: String(localized: "conversation.info.block.message", defaultValue: "Vous ne recevrez plus de messages de %@. Vous pourrez le débloquer dans les réglages.", bundle: .main), conversation.name))
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
            Text(String(localized: "conversation.info.leave.message", defaultValue: "Vous ne recevrez plus de messages. Votre historique restera lisible.", bundle: .main))
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

    // MARK: - Header Bar

    private var headerBar: some View {
        HStack {
            Text(String(localized: "conversation.info.header", defaultValue: "Conversation", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Spacer()

            if canManageMembers && !isDirect {
                NavigationLink(value: "settings") {
                    Image(systemName: "gearshape.fill")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(theme.textMuted.opacity(MeeshyOpacity.light)))
                }
                .accessibilityLabel(String(localized: "conversation.info.settings-a11y", defaultValue: "Réglages de la conversation", bundle: .main))
            }

            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(theme.textMuted.opacity(MeeshyOpacity.light)))
            }
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.sm)
    }

    // MARK: - Conversation Header

    private var conversationHeader: some View {
        Group {
            if isDirect {
                directConversationHeader
            } else {
                heroConversationHeader
            }
        }
        .opacity(appearAnimation ? 1 : 0)
        .offset(y: appearAnimation ? 0 : 10)
    }

    // MARK: - Direct Conversation Header (unchanged)

    private var directConversationHeader: some View {
        VStack(spacing: MeeshySpacing.md) {
            LivePresence { MeeshyAvatar(
                name: conversation.name,
                context: .profileSheet,
                accentColor: accentColor,
                avatarURL: conversation.participantAvatarURL,
                moodEmoji: otherUserId.flatMap { moodEmojiResolver?($0) },
                presenceState: otherUserId.map { presenceManager.presenceState(for: $0) },
                isHere: otherUserId.map { presenceManager.here(userId: $0, conversationId: conversation.id) } ?? .absent,
                ring: conversation.participantRing,
                onMoodTap: otherUserId.flatMap { moodTapResolver?($0) }
            ) }

            Text(conversation.name)
                .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .lineLimit(2)
                .multilineTextAlignment(.center)

            conversationInfoRow

            muteIndicator

            Text(String(format: String(localized: "conversation.info.created-on", defaultValue: "Créé le %@", bundle: .main), conversation.createdAt.formatted(.dateTime.day().month().year())))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.bottom, MeeshySpacing.lg)
    }

    // MARK: - Hero Conversation Header (group/public/global)

    private var heroConversationHeader: some View {
        VStack(spacing: 0) {
            Color.clear
                .frame(height: 140)
                .overlay { heroBannerImage.allowsHitTesting(false).accessibilityHidden(true) }
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xl))
                .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.xl))
                .padding(.horizontal, MeeshySpacing.lg)

            // Avatar overlapping banner
            MeeshyAvatar(
                name: conversation.name,
                context: .profileBanner,
                kind: .entity,
                accentColor: accentColor,
                avatarURL: conversation.avatar
            )
            .overlay(
                Circle()
                    .stroke(theme.backgroundPrimary, lineWidth: 4)
            )
            .offset(y: -40)
            .padding(.bottom, -40)

            // Name
            Text(conversation.name)
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .padding(.top, MeeshySpacing.smPlus)

            // Info row
            conversationInfoRow
                .padding(.top, MeeshySpacing.sm)

            muteIndicator
                .padding(.top, MeeshySpacing.xsPlus)

            Text(String(format: String(localized: "conversation.info.created-on", defaultValue: "Créé le %@", bundle: .main), conversation.createdAt.formatted(.dateTime.day().month().year())))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textMuted)
                .padding(.top, MeeshySpacing.xsPlus)
        }
        .padding(.horizontal, MeeshySpacing.xs)
        .padding(.bottom, MeeshySpacing.lg)
    }

    @ViewBuilder
    private var heroBannerImage: some View {
        if let bannerURL = conversation.banner, !bannerURL.isEmpty {
            // CachedAsyncImage (vs raw AsyncImage) caches the banner so reopening
            // the info sheet doesn't re-download it, and decodes it at the 140-pt
            // banner size rather than full resolution.
            // showsStatusOverlays: false — echec silencieux vers le gradient
            // deja fourni ; pas de bouton retry sur une banniere decorative.
            CachedAsyncImage(
                url: bannerURL,
                targetSize: CGSize(width: 400, height: 140),
                showsStatusOverlays: false
            ) {
                heroBannerPlaceholder
            }
            .aspectRatio(contentMode: .fill)
        } else {
            heroBannerPlaceholder
        }
    }

    private var heroBannerPlaceholder: some View {
        LinearGradient(
            colors: [
                accent.opacity(0.4),
                accent.opacity(MeeshyOpacity.light),
                accent.opacity(MeeshyOpacity.medium)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Shared Info Sub-views

    private var conversationInfoRow: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: conversationTypeIcon)
                .font(MeeshyFont.relative(11, weight: .semibold))
                .foregroundColor(accent)

            Text(conversation.type.displayName)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                .foregroundColor(theme.textSecondary)

            if conversation.memberCount > 0 {
                MetaSeparator()
                    .foregroundColor(theme.textMuted)
                Image(systemName: "person.2.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.xxs))
                    .foregroundColor(theme.textMuted)
                Text(conversation.memberCountDisplay)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .foregroundColor(theme.textSecondary)
            }
        }
    }

    @ViewBuilder
    private var muteIndicator: some View {
        if conversation.userState.isMuted {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: "bell.slash.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.xxs))
                Text(String(localized: "conversation.info.muted", defaultValue: "Notifications désactivées", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
            }
            .foregroundColor(theme.textMuted)
            .padding(.horizontal, MeeshySpacing.smPlus)
            .padding(.vertical, MeeshySpacing.xs)
            .background(Capsule().fill(theme.textMuted.opacity(MeeshyOpacity.subtle)))
        }
    }

    // MARK: - Tab Selector

    private var tabSelector: some View {
        HStack(spacing: 0) {
            ForEach(InfoTab.allCases, id: \.self) { tab in
                let isSelected = selectedTab == tab
                let label = tabCountLabel(for: tab)

                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        selectedTab = tab
                    }
                    HapticFeedback.light()
                } label: {
                    VStack(spacing: MeeshySpacing.xsPlus) {
                        HStack(spacing: MeeshySpacing.xs) {
                            Text(tabLabel(for: tab))
                                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: isSelected ? .bold : .medium))

                            if let label {
                                Text(label)
                                    // Compteur numérique compact dans une pastille capsule — gardé
                                    // hors Dynamic Type pour que la pill reste « tight » (cf. 53i).
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(isSelected ? .white : theme.textMuted)
                                    .padding(.horizontal, MeeshySpacing.xs)
                                    .padding(.vertical, 1)
                                    .background(
                                        Capsule().fill(isSelected ? accent : theme.textMuted.opacity(MeeshyOpacity.light))
                                    )
                            }
                        }
                        .foregroundColor(isSelected ? theme.textPrimary : theme.textMuted)

                        Rectangle()
                            .fill(isSelected ? accent : Color.clear)
                            .frame(height: 2)
                            .clipShape(RoundedRectangle(cornerRadius: 1))
                    }
                }
                .frame(maxWidth: .infinity)
                // Selected tab is otherwise signalled by weight/color + the
                // underline bar alone — expose it to VoiceOver via the trait so
                // non-sighted users know which tab is active (HIG: never rely on
                // color to convey state; WCAG 1.4.1). Localised by iOS, 0 key.
                .accessibilityAddTraits(isSelected ? [.isSelected] : [])
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .opacity(appearAnimation ? 1 : 0)
        .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.05), value: appearAnimation)
    }

    // MARK: - Tab Content

    @ViewBuilder
    private var tabContent: some View {
        ScrollView(.vertical, showsIndicators: false) {
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
        .animation(.easeInOut(duration: 0.2), value: selectedTab)
    }

    // MARK: - Members Section

    @State private var memberSearchQuery: String = ""

    private var filteredMembers: [PaginatedParticipant] {
        let q = memberSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !q.isEmpty else { return participants }
        return participants.filter { p in
            p.name.lowercased().contains(q) ||
            (p.username?.lowercased().contains(q) ?? false)
        }
    }

    private var membersSection: some View {
        VStack(spacing: 0) {
            if conversation.type != .direct, canManageMembers {
                manageMembersButton
            }

            // Member count
            HStack {
                Text(MembersCountLabel.text(participants.count))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold, design: .rounded))
                    .foregroundColor(theme.textMuted)
                Spacer()
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.top, MeeshySpacing.md)
            .padding(.bottom, MeeshySpacing.xs)

            // Search field
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "magnifyingglass")
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundColor(theme.textMuted)
                TextField(String(localized: "conversation.info.member-search", defaultValue: "Rechercher un membre…", bundle: .main), text: $memberSearchQuery)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize))
                    .foregroundColor(theme.textPrimary)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                if !memberSearchQuery.isEmpty {
                    Button {
                        memberSearchQuery = ""
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(MeeshyFont.relative(MeeshyIconSize.sm))
                            .foregroundColor(theme.textMuted)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(String(localized: "common.clear-search", defaultValue: "Effacer la recherche", bundle: .main))
                }
            }
            .padding(MeeshySpacing.smPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                    .fill(MeeshyColors.surfaceFill(isDark: isDark))
            )
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                    .strokeBorder(theme.textMuted.opacity(MeeshyOpacity.light), lineWidth: 1)
            )
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.bottom, MeeshySpacing.sm)

            if isLoadingParticipants {
                VStack(spacing: MeeshySpacing.md) {
                    ForEach(0..<3, id: \.self) { _ in
                        ConversationInfoMemberSkeletonRow()
                    }
                }
                .padding(.horizontal, MeeshySpacing.xl)
                .padding(.top, MeeshySpacing.lg)
            } else if filteredMembers.isEmpty {
                emptyState(icon: "person.2.slash", text: memberSearchQuery.isEmpty ? String(localized: "conversation.info.no-members", defaultValue: "Aucun membre", bundle: .main) : String(localized: "common.no-results", defaultValue: "Aucun résultat", bundle: .main))
            } else {
                LazyVStack(spacing: 0) {
                    ForEach(filteredMembers) { participant in
                        ConversationInfoMemberRow(participant: participant, conversationId: conversation.id)
                            .onAppear {
                                if participant.id == participants.last?.id {
                                    Task { await loadMoreParticipants() }
                                }
                            }
                    }
                    if isLoadingMoreParticipants {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, MeeshySpacing.md)
                    }
                }
                .padding(.top, MeeshySpacing.sm)
            }
        }
        .padding(.bottom, MeeshySpacing.xxxl)
    }

    private var manageMembersButton: some View {
        NavigationLink(value: "settings") {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "person.2.badge.gearshape")
                    .font(MeeshyFont.relative(13, weight: .semibold))
                Text(String(localized: "conversation.info.manage_members", defaultValue: "Gérer les membres", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                Spacer()
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(11, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }
            .foregroundColor(accent)
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.md)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                    .fill(accent.opacity(isDark ? 0.12 : 0.08))
            )
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.md)
        .accessibilityLabel(String(localized: "conversation.info.manage_members.a11y", defaultValue: "Gérer les membres du groupe", bundle: .main))
    }

    // MARK: - Empty State

    private func emptyState(icon: String, text: String) -> some View {
        VStack(spacing: MeeshySpacing.md) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(32, weight: .light))
                .foregroundColor(theme.textMuted.opacity(0.4))

            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack(spacing: MeeshySpacing.md) {
            actionButton(
                icon: "link.badge.plus",
                label: String(localized: "common.share", defaultValue: "Partager", bundle: .main),
                color: MeeshyColors.shareAccentHex,
                isLoading: isCreatingShareLink
            ) {
                Task { await createShareLink() }
            }

            actionButton(
                icon: "rectangle.portrait.and.arrow.right",
                label: String(localized: "conversation.info.leave.confirm", defaultValue: "Quitter", bundle: .main),
                color: MeeshyColors.errorHex
            ) {
                showLeaveConfirmation = true
            }
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.vertical, MeeshySpacing.md)
        .opacity(appearAnimation ? 1 : 0)
        .animation(.spring(response: 0.5, dampingFraction: 0.8).delay(0.03), value: appearAnimation)
    }

    private func actionButton(
        icon: String,
        label: String,
        color: String,
        isLoading: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: MeeshySpacing.sm) {
                if isLoading {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(Color(hex: color))
                } else {
                    Image(systemName: icon)
                        .font(MeeshyFont.relative(13, weight: .semibold))
                }
                Text(label)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
            }
            .foregroundColor(Color(hex: color))
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.smPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .fill(Color(hex: color).opacity(isDark ? 0.12 : 0.08))
            )
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                    .strokeBorder(Color(hex: color).opacity(MeeshyOpacity.light), lineWidth: 1)
            )
        }
        .disabled(isLoading)
    }

    // MARK: - Share Link Actions

    private func createShareLink() async {
        isCreatingShareLink = true
        defer { isCreatingShareLink = false }

        do {
            let request = CreateShareLinkRequest(
                conversationId: conversation.id,
                name: conversation.name,
                allowAnonymousMessages: true
            )
            let result = try await ShareLinkService.shared.createShareLink(request: request)
            guard let shareURL = URL(string: result.joinUrl) else {
                throw URLError(.badURL)
            }
            shareableLink = ShareableLink(url: shareURL)
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "conversation.info.share.error", defaultValue: "Erreur lors de la création du lien", bundle: .main))
        }
    }

    private func leaveConversation() async {
        do {
            try await ConversationService.shared.leave(conversationId: conversation.id)
            dismiss()
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "conversation.info.leave.error", defaultValue: "Erreur lors du départ de la conversation", bundle: .main))
        }
    }

    // MARK: - Helpers

    private var conversationTypeIcon: String {
        switch conversation.type {
        case .direct: return "person.fill"
        case .group: return "person.3.fill"
        case .public, .global, .broadcast: return "globe"
        case .community: return "building.2.fill"
        case .channel: return "megaphone.fill"
        case .bot: return "cpu.fill"
        }
    }

    private func tabLabel(for tab: InfoTab) -> String {
        switch tab {
        case .members: return String(localized: "conversation.info.tab.members", defaultValue: "Membres", bundle: .main)
        case .media: return String(localized: "conversation.info.tab.media", defaultValue: "Médias", bundle: .main)
        case .plus: return String(localized: "conversation.info.tab.stats", defaultValue: "Stats", bundle: .main)
        case .preferences: return String(localized: "conversation.info.tab.options", defaultValue: "Options", bundle: .main)
        }
    }

    private func tabCountLabel(for tab: InfoTab) -> String? {
        switch tab {
        case .members:
            return nil
        case .media:
            return nil
        case .plus:
            return nil
        case .preferences:
            return nil
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

    func relativeTime(from date: Date) -> String {
        RelativeTimeFormatter.longString(for: date)
    }

    // MARK: - Block Button

    private var blockUserButton: some View {
        Button {
            HapticFeedback.medium()
            showBlockConfirm = true
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                if isBlocking {
                    ProgressView()
                        .tint(MeeshyColors.error)
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "exclamationmark.shield")
                        .font(MeeshyFont.relative(13, weight: .semibold))
                }
                Text(String(localized: "conversation.info.block.title", defaultValue: "Bloquer cet utilisateur", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
            }
            .foregroundColor(MeeshyColors.error)
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.smPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                    .fill(MeeshyColors.error.opacity(isDark ? 0.12 : 0.08))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                            .stroke(MeeshyColors.error.opacity(MeeshyOpacity.light), lineWidth: 1)
                    )
            )
        }
        .disabled(isBlocking)
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.bottom, MeeshySpacing.md)
        .accessibilityLabel(String(format: String(localized: "conversation.info.block.a11y", defaultValue: "Bloquer %@", bundle: .main), conversation.name))
    }

    // MARK: - Block Action

    private func blockOtherUser() {
        guard let userId = otherUserId else { return }
        isBlocking = true
        Task { [weak blockService = BlockService.shared] in
            do {
                try await blockService?.blockUser(userId: userId)
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(String(localized: "conversation.info.block.success", defaultValue: "Utilisateur bloqué", bundle: .main))
                dismiss()
            } catch {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(String(localized: "conversation.info.block.error", defaultValue: "Erreur lors du blocage", bundle: .main))
                Self.logger.error("Failed to block user: \(error.localizedDescription)")
            }
            isBlocking = false
        }
    }

    // MARK: - API

    private func loadParticipants() async {
        isLoadingParticipants = true
        defer { isLoadingParticipants = false }

        do {
            let fetched = try await ParticipantService.shared.loadFirstPage(
                for: conversation.id
            )
            participants = fetched
            hasMoreParticipants = await ParticipantService.shared.hasMore(for: conversation.id)
        } catch {
            Self.logger.error("Failed to load participants: \(error.localizedDescription)")
        }
    }

    private func loadMoreParticipants() async {
        guard hasMoreParticipants, !isLoadingMoreParticipants else { return }
        isLoadingMoreParticipants = true
        defer { isLoadingMoreParticipants = false }

        do {
            let allFetched = try await ParticipantService.shared.loadNextPage(for: conversation.id)
            participants = allFetched
            hasMoreParticipants = await ParticipantService.shared.hasMore(for: conversation.id)
        } catch {
            Self.logger.error("Failed to load more participants: \(error.localizedDescription)")
        }
    }
}
