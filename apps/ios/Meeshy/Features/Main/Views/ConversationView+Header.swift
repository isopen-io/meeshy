// MARK: - Extracted from ConversationView.swift
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// MARK: - Header, Background & Navigation
extension ConversationView {

    // MARK: - Conversation Background
    var conversationBackground: ConversationBackgroundLayer {
        let model = viewModel
        return ConversationBackgroundLayer(
            conversationId: conversation?.id ?? "",
            initialAppearance: liveConversation?.userState.appearance,
            signature: ConversationBackgroundConfig(
                conversationType: conversation?.type ?? .direct,
                isEncrypted: conversation?.encryptionMode != nil,
                isE2EEncrypted: conversation?.encryptionMode == "e2ee",
                memberCount: conversation?.memberCount ?? 2,
                accentHex: accentColor,
                secondaryHex: secondaryColor,
                isDarkMode: isDark
            ),
            knownAttachment: { id in model.messages.lazy.flatMap(\.attachments).first { $0.id == id } },
            viewModel: model,
            deviceTranslationEnabled: !previewMode && anonymousSession == nil,
            encryptionMode: liveConversation?.encryptionMode,
            onPeerUpdate: { admitPeerUpdate($0) },
            onAppearanceChange: { admitAppearance($0) }
        )
    }

    /// Seul un changement de ce qui se voit écrit l'override : l'écho d'un choix déjà
    /// appliqué ne redessine rien.
    func admitAppearance(_ note: Notification) {
        guard let live = liveConversation,
              let changed = ConversationAppearanceChange.appearance(in: note, for: live.id) else { return }
        admitRepainted(live.adoptingAppearance(changed))
    }

    // MARK: - Header Avatar (thin wrapper → extracted struct to avoid PAC crashes)
    var headerAvatarView: ConversationHeaderAvatarView {
        ConversationHeaderAvatarView(
            composerState: $composerState,
            headerState: $headerState,
            // La bande d'avatars est le SEUL endroit de l'en-tête que les
            // réglages peuvent changer sous les yeux du lecteur (titre →
            // `name`, avatar → `avatarURL`). Elle reçoit donc la conversation
            // VIVANTE : l'override serveur remonté par la feuille d'info après
            // un enregistrement, sinon la valeur figée de la navigation. Tous
            // ses autres champs (`type`, `participantUserId`,
            // `participantAvatarURL`) sortent inchangés de la fusion serveur
            // (`MeeshyConversation.mergingMetadata` ne reporte QUE les
            // métadonnées du conteneur), donc une seule source ici suffit.
            conversation: liveConversation,
            topActiveMembers: topActiveMembers,
            accentColor: accentColor,
            secondaryColor: secondaryColor,
            headerMoodEmoji: headerMoodEmoji,
            headerPresenceState: headerPresenceState,
            showsIdentity: headerLayout.avatarShowsIdentity,
            isPreview: previewMode,
            door: headerAvatarDoor,
            onSetExpanded: { setHeaderExpanded($0) },
            onDismissFlame: { dismissHeaderFlame() },
            onNavigateToDM: { userId, name in
                Task { await self.navigateToDM(with: userId, name: name) }
            },
            onViewProfile: {
                if let conv = conversation, let profileUser = ProfileSheetUser.from(conversation: conv) {
                    router.deepLinkProfileUser = profileUser
                }
            },
            onViewMemberProfile: { user in
                router.openProfile(user, inConversation: conversation?.id)
            }
        )
    }

    /// Ce que le toucher de l'avatar de l'en-tête ouvre (#10300) — lu sur la
    /// conversation VIVANTE, comme la bande d'avatars.
    var headerAvatarDoor: ConversationHeaderAvatarDoor {
        .resolve(
            isDirect: liveConversation?.type == .direct,
            isGuest: anonymousSession != nil,
            peerUserId: liveConversation?.participantUserId,
            hasConversation: liveConversation != nil
        )
    }

    /// Middle slot of the header band (between back button and avatar).
    /// Frontière NOMINALE — `ConversationHeaderMidContent` (#6194) : c'est le
    /// getter de ce maillon que la trace du crash désignait, sous
    /// `__swift_instantiateConcreteTypeFromMangledNameV2`. Quand l'avatar ouvre
    /// une fiche (#10300), la bascule de l'en-tête passe à la zone libre de la bande.
    var expandedHeaderMidContent: some View {
        ConversationHeaderMidContent(
            layout: headerLayout,
            titleAndTags: { expandedHeaderTitleAndTags },
            actionButtons: { headerButtonsCluster },
            onToggleBand: headerAvatarDoor.bandToggles(isPreview: previewMode)
                ? { setHeaderExpanded(!composerState.showOptions) }
                : nil
        )
    }

    // MARK: - L'aperçu tiré de la bannière (#8822)

    /// Ce que la bande d'en-tête montre : l'aperçu porte l'en-tête COMPLET dans
    /// son bloc de verre, sans chevron retour (`ConversationHeaderLayout`).
    var headerLayout: ConversationHeaderLayout {
        ConversationHeaderLayout.resolve(previewMode: previewMode, showOptions: composerState.showOptions)
    }

    /// L'emplacement de la recherche : la loupe, ou — dans l'aperçu — la porte
    /// vers la conversation complète.
    var headerSearchSlot: ConversationHeaderSearchSlot {
        ConversationHeaderSearchSlot(
            previewMode: previewMode,
            accentColor: accentColor,
            secondaryColor: secondaryColor,
            onOpenFull: { onOpenFullConversation?() },
            onSearch: { openHeaderSearch() }
        )
    }

    func openHeaderSearch() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { headerState.showSearch = true }
        isSearchFocused = true
    }

    /// La barre qui remplace l'en-tête pendant la frappe (extraite de `ConversationView.swift`,
    /// hors budget). Son avatar porte, comme l'en-tête déplié, le contour du pair et le point
    /// « ici » d'une directe (#10946, #10956).
    var typingHeaderBar: some View {
        let isDirect = liveConversation?.type == .direct
        let peerHere: ConversationHere = {
            guard isDirect, let live = liveConversation, let peer = live.participantUserId else { return .absent }
            return PresenceManager.shared.here(userId: peer, conversationId: live.id)
        }()
        return HStack(spacing: MeeshySpacing.sm) {
            ThemedBackButton(color: accentColor, unreadCount: viewModel.otherConversationsUnread) { HapticFeedback.light(); router.pop() }
            Spacer()
            ThemedAvatarButton(
                name: liveConversation?.name ?? "?", color: accentColor, secondaryColor: secondaryColor,
                isExpanded: false, storyState: headerStoryRingState,
                avatarURL: isDirect ? liveConversation?.participantAvatarURL : liveConversation?.avatar,
                presenceState: headerPresenceState,
                moodEmoji: headerMoodEmoji,
                isHere: peerHere,
                ring: isDirect ? liveConversation?.participantRing : nil
            ) {
                isTyping = false
                setHeaderExpanded(true)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
        .transition(.opacity)
    }

    // MARK: - La mémoire de l'en-tête (#9031)

    /// Déplie ou replie l'en-tête par le GESTE du lecteur, et le retient pour
    /// cette conversation. Déplier ramène aussi la flamme du jour qu'il avait
    /// touchée (`HeaderFlameVisibility`). Les replis automatiques (frappe, menu
    /// d'appui long) ne passent pas ici : ils ne disent rien de sa préférence.
    func setHeaderExpanded(_ expanded: Bool) {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            composerState.showOptions = expanded
        }
        guard !previewMode, let conversationId = conversation?.id else { return }
        headerMemory.setExpanded(expanded, for: conversationId)
        let dismissed = HeaderFlameVisibility.dismissed(afterHeaderExpanded: expanded, wasDismissed: headerState.flameDismissed)
        guard dismissed != headerState.flameDismissed else { return }
        headerState.flameDismissed = dismissed
        headerMemory.setFlameDismissed(dismissed, for: conversationId)
    }

    /// Relit ce que l'en-tête de cette conversation avait retenu. L'aperçu tiré
    /// d'une bannière a sa propre disposition et ne lit rien.
    func restoreHeaderMemory() {
        guard !previewMode, let conversationId = conversation?.id else { return }
        composerState.showOptions = headerMemory.isExpanded(conversationId)
        headerState.flameDismissed = headerMemory.isFlameDismissed(conversationId)
    }

    func dismissHeaderFlame() {
        HapticFeedback.light()
        headerState.flameDismissed = true
        guard let conversationId = conversation?.id else { return }
        headerMemory.setFlameDismissed(true, for: conversationId)
    }

    var headerMemory: ConversationHeaderMemoryProviding { ConversationHeaderMemory.shared }


    // MARK: - Header Call Buttons (audio + video)

    /// Frontière NOMINALE du bouton d'appel : l'emplacement lit un instantané
    /// `Equatable` de l'état d'appel (`CallHeaderSnapshotStore`) et ne construit
    /// pas la pile d'appel.
    var headerCallButtons: ConversationHeaderCallSlot {
        let entry = HeaderCallEntry.resolve(
            conversation: conversation,
            viewerPlatformRole: AuthManager.shared.currentUser?.role,
            viewerIsGuest: anonymousSession != nil
        )
        return ConversationHeaderCallSlot(
            entry: entry,
            conversationId: conversation?.id ?? "",
            calleeName: headerCalleeName(for: entry),
            accentColor: accentColor,
            secondaryColor: secondaryColor,
            engagementConversationId: liveConversation?.id
        )
    }

    /// #3585 — un groupe s'appelle depuis le MÊME bouton qu'un contact : la
    /// poignée de l'appel est la conversation, son nom le titre du groupe.
    private func headerCalleeName(for entry: HeaderCallEntry?) -> String {
        guard let entry else { return "" }
        switch entry.callee {
        case .conversation: return conversation?.displayName ?? ""
        case .peer: return resolvedCalleeName
        }
    }

    /// Resolves the callee display name for DM calls.
    /// Prefers: conversation title (display name) > participantUsername > "Inconnu"
    /// Guards against ObjectId/UUID strings leaking as the displayed name.
    private var resolvedCalleeName: String {
        let candidates: [String?] = [
            conversation?.title,
            conversation?.participantUsername
        ]
        for candidate in candidates {
            if let name = candidate, !name.isEmpty, !looksLikeObjectId(name) {
                return name
            }
        }
        return "Inconnu"
    }

    /// Returns true if the string looks like a MongoDB ObjectId (24-char hex) or UUID.
    private func looksLikeObjectId(_ value: String) -> Bool {
        if value.count == 24, value.allSatisfy(\.isHexDigit) { return true }
        if UUID(uuidString: value) != nil { return true }
        return false
    }

    // MARK: - Header Tags Row (category first, then colored tags, horizontally scrollable)
    var headerTagsRow: ConversationHeaderTagsRow {
        ConversationHeaderTagsRow(
            conversation: liveConversation,
            section: conversationSection,
            showsEngagement: !headerLayout.showsActions,
            accentColor: accentColor,
            successColor: theme.success
        )
    }

    // MARK: - Navigate to DM

    func navigateToDM(with userId: String, name: String) async {
        // Check if a DM already exists in the loaded conversation list
        if let existing = conversationListViewModel?.conversations.first(where: {
            $0.type == .direct && $0.participantUserId == userId
        }) {
            router.navigateToConversation(existing)
            return
        }

        // P4.1: the network call lives in `ConversationCreator` so the
        // view doesn't have to know about APIClient.shared, the body
        // encoding, or the conversion to the local `Conversation` model.
        // Errors are intentionally swallowed here (preserved behaviour) —
        // the call is fire-and-forget from a user gesture; if it fails
        // the user can re-tap.
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        do {
            let newConv = try await ConversationCreator().createDirectConversation(
                with: userId,
                currentUserId: currentUserId
            )
            await conversationListViewModel?.refresh()
            router.navigateToConversation(newConv)
        } catch {
            Logger.network.error("createDirectConversation failed: \(error.localizedDescription)")
        }
    }
}

// MARK: - Ce que l'en-tête offre pour appeler (#10207)

/// Qui l'en-tête appelle, et si le lecteur peut LANCER cet appel. La
/// permission est la loi unique du SDK (`CallPermission.canStartCall`, miroir
/// de `packages/shared/utils/call-permission.ts`) ; ce type n'y ajoute que la
/// FORME de l'appel que l'app sait passer : un pair pour un direct, la
/// conversation pour un groupe ou une public.
///
/// `nil` : aucun bouton d'appel — invité sans compte, conversation `global`,
/// ou type que l'app n'appelle pas. Une `public` dont le lecteur n'est ni
/// créateur ni administrateur garde l'entrée avec `canStart == false` : il ne
/// lance rien, mais rejoint l'appel déjà en cours.
struct HeaderCallEntry: Equatable {

    enum Callee: Equatable {
        case peer(userId: String)
        case conversation
    }

    let callee: Callee
    let canStart: Bool

    static func resolve(conversation: Conversation?, viewerPlatformRole: String?, viewerIsGuest: Bool) -> HeaderCallEntry? {
        guard let conversation, !viewerIsGuest, conversation.type != .global else { return nil }
        let canStart = CallPermission.canStartCall(CallPermission.Context(
            conversationType: conversation.type.rawValue,
            viewerIsCreator: conversation.currentUserRole?.lowercased() == MemberRole.creator.rawValue,
            viewerConversationRole: conversation.currentUserRole,
            viewerPlatformRole: viewerPlatformRole,
            viewerIsGuest: viewerIsGuest
        ))
        switch conversation.type {
        case .direct:
            guard let peer = conversation.participantUserId, !peer.isEmpty else { return nil }
            return HeaderCallEntry(callee: .peer(userId: peer), canStart: canStart)
        case .group, .public:
            guard !conversation.id.isEmpty else { return nil }
            return HeaderCallEntry(callee: .conversation, canStart: canStart)
        default:
            return nil
        }
    }
}

// MARK: - Conversation Header Avatar View
// Extracted struct to avoid PAC (Pointer Authentication Code) crashes on ARM64e:
// @ViewBuilder computed properties capturing @EnvironmentObject + @State in @escaping closures
// cause EXC_BAD_ACCESS in swift_retain. Using a dedicated struct gives SwiftUI proper ownership.

struct ConversationHeaderAvatarView: View {
    @Binding var composerState: ConversationComposerState
    @Binding var headerState: ConversationHeaderState

    let conversation: Conversation?
    let topActiveMembers: [ConversationActiveMember]
    let accentColor: String
    let secondaryColor: String
    let headerMoodEmoji: String?
    let headerPresenceState: PresenceState
    /// L'IDENTITÉ — pile des plus actifs puis interlocuteur ou groupe — plutôt
    /// que l'avatar replié (`ConversationHeaderLayout.avatarShowsIdentity`).
    let showsIdentity: Bool
    /// Dans l'aperçu, il n'y a rien à replier.
    let isPreview: Bool
    /// Ce que le toucher de l'avatar ouvre (#10300).
    let door: ConversationHeaderAvatarDoor
    var onSetExpanded: (Bool) -> Void
    var onDismissFlame: () -> Void
    var onNavigateToDM: (String, String) -> Void
    var onViewProfile: (() -> Void)?
    var onViewMemberProfile: (ProfileSheetUser) -> Void

    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel
    /// Signal débouncé de `PresenceManager` (jamais le manager lui-même) :
    /// l'arrivée ou le départ d'un pair (#8892) repeint les points de l'en-tête.
    @ObservedObject private var presencePulse: PresenceRefreshSignal = PresenceManager.shared.refreshSignal

    private var isDirect: Bool { conversation?.type == .direct }

    /// La pastille de l'interlocuteur, RELUE à chaque battement de `presencePulse`
    /// (#11412) : `headerPresenceState` est résolu par `ConversationView`, qui
    /// n'observe pas la présence — passé tel quel, il figeait le point replié.
    private var livePresenceState: PresenceState {
        guard isDirect, let userId = conversation?.participantUserId else { return headerPresenceState }
        return PresenceManager.shared.presenceState(for: userId)
    }

    /// Le pair a l'écran de CETTE conversation ouvert (#8892), et y est
    /// peut-être actif (#9061).
    private func isHere(_ userId: String?) -> ConversationHere {
        guard let userId, let conversationId = conversation?.id else { return .absent }
        return PresenceManager.shared.here(userId: userId, conversationId: conversationId)
    }

    private func memberStoryState(for userId: String) -> StoryRingState {
        storyViewModel.storyRingState(forUserId: userId)
    }

    private func openStory(of userId: String) {
        headerState.storyUserIdForHeader = userId
        headerState.showStoryViewerFromHeader = true
    }

    // MARK: Participant actif (#7831)

    // La pile est une MISE EN AVANT des personnes : le toucher et l'appui long
    // se décident ici, sans `onViewStory`/`onViewProfile` passés à
    // `MeeshyAvatar`, dont le menu automatique placerait le profil AVANT la
    // story. Les libellés sont ceux de l'avatar des bulles (`BubbleFooter`).
    private func openMember(_ member: ConversationActiveMember, storyState: StoryRingState) {
        switch ConversationHeaderMemberTap.resolve(storyState: storyState) {
        case .story: openStory(of: member.viewingKey)
        case .profile: onViewMemberProfile(member.profile)
        }
    }

    private func memberContextMenu(for member: ConversationActiveMember, storyState: StoryRingState) -> [AvatarContextMenuItem] {
        ConversationHeaderMemberMenuEntry.entries(storyState: storyState).map { entry in
            switch entry {
            case .viewStory:
                return AvatarContextMenuItem(
                    label: String(localized: "bubble.avatar.viewStory", defaultValue: "Voir la story", bundle: .main),
                    icon: "play.circle.fill"
                ) { openStory(of: member.viewingKey) }
            case .viewProfile:
                return AvatarContextMenuItem(
                    label: String(localized: "bubble.avatar.viewProfile", defaultValue: "Voir le profil", bundle: .main),
                    icon: "person.circle.fill"
                ) { onViewMemberProfile(member.profile) }
            case .conversationDetails:
                return AvatarContextMenuItem(label: String(localized: "Conversation", bundle: .main), icon: "info.circle.fill") {
                    composerState.showConversationInfo = true
                }
            case .sendMessage:
                return AvatarContextMenuItem(label: String(localized: "Envoyer un message", bundle: .main), icon: "bubble.left.fill") {
                    onNavigateToDM(member.id, member.name)
                }
            }
        }
    }

    // MARK: Pair d'une conversation directe

    private func avatarContextMenu(for userId: String, name: String) -> [AvatarContextMenuItem] {
        // NB : l'entrée « Voir la story » est ajoutée automatiquement par
        // `MeeshyAvatar` dès qu'un `onViewStory` est fourni et qu'une story
        // existe (`storyState != .none`). On ne la duplique donc pas ici —
        // on n'ajoute que les entrées profil / conversation / message.
        var items: [AvatarContextMenuItem] = []
        if isDirect {
            // F10 (revue adversariale 2026-08-25) : clé app (`.main`) alors
            // que le pendant SDK (`MeeshyAvatar.swift`) réserve
            // `avatar.menu.view_profile` (`.module`) à ce même geste pour
            // que la dédup par LIBELLÉ ne divise jamais deux entrées
            // « profil ». Sans danger ICI UNIQUEMENT parce que ce site ne
            // passe jamais `onViewProfile` à `MeeshyAvatar` — sinon la dédup
            // casserait. Si `onViewProfile` est un jour câblé sur cet
            // avatar, basculer sur la clé SDK.
            items.append(AvatarContextMenuItem(label: String(localized: "Voir le profil", bundle: .main), icon: "person.circle.fill") {
                onViewProfile?()
            })
        }
        items.append(AvatarContextMenuItem(label: String(localized: "Conversation", bundle: .main), icon: "info.circle.fill") {
            composerState.showConversationInfo = true
        })
        if !isDirect {
            items.append(AvatarContextMenuItem(label: String(localized: "Envoyer un message", bundle: .main), icon: "bubble.left.fill") {
                onNavigateToDM(userId, name)
            })
        }
        return items
    }

    private var collapsedStoryState: StoryRingState {
        if isDirect, let userId = conversation?.participantUserId {
            return memberStoryState(for: userId)
        }
        return .none
    }

    private var directContextMenu: [AvatarContextMenuItem] {
        guard let userId = conversation?.participantUserId else { return [] }
        return avatarContextMenu(for: userId, name: conversation?.name ?? "Contact")
    }

    /// Le toucher de l'avatar (#10300) : il OUVRE LA FICHE — le profil du pair
    /// d'un direct, les détails de toute autre conversation, déplié comme replié
    /// et dans l'aperçu. Sans fiche à ouvrir (visiteur sans compte, #10205), il
    /// garde la bascule de l'en-tête, que la zone libre de la bande porte sinon.
    private func openDoor() {
        HapticFeedback.light()
        switch door {
        case .profile:
            onViewProfile?()
        case .details:
            composerState.showConversationInfo = true
        case .toggle:
            guard !isPreview else { return }
            onSetExpanded(!showsIdentity)
        }
    }

    private func toggleBand() {
        HapticFeedback.light()
        onSetExpanded(!showsIdentity)
    }

    private func doorAccessibility(menu: [AvatarContextMenuItem]) -> HeaderAvatarDoorAccessibility {
        HeaderAvatarDoorAccessibility(
            label: door.accessibilityLabel(name: conversation?.name ?? "?", expanded: showsIdentity),
            toggleLabel: door.bandToggles(isPreview: isPreview) ? ConversationHeaderAvatarDoor.toggleLabel(expanded: showsIdentity) : nil,
            menuItems: menu,
            onOpen: openDoor,
            onToggle: toggleBand
        )
    }

    /// Les entrées du pair d'un direct pour VoiceOver : la story (que
    /// `MeeshyAvatar` ajoute d'office à son menu) puis le menu d'appui long.
    private var directAccessibilityMenu: [AvatarContextMenuItem] {
        guard let userId = conversation?.participantUserId else { return [] }
        guard memberStoryState(for: userId) != .none else { return directContextMenu }
        let story = AvatarContextMenuItem(
            label: String(localized: "bubble.avatar.viewStory", defaultValue: "Voir la story", bundle: .main),
            icon: "play.circle.fill"
        ) { openStory(of: userId) }
        return [story] + directContextMenu
    }

    var body: some View {
        if showsIdentity {
            // Identity: participant avatar(s) — tap opens the profile (direct)
            // or the conversation details (#10300)
            if isDirect, let userId = conversation?.participantUserId {
                MeeshyAvatar(
                    name: conversation?.name ?? "?",
                    context: .conversationHeaderExpanded,
                    accentColor: accentColor,
                    secondaryColor: secondaryColor,
                    avatarURL: conversation?.participantAvatarURL,
                    storyState: memberStoryState(for: userId),
                    moodEmoji: statusViewModel.statusForUser(userId: userId)?.moodEmoji,
                    presenceState: PresenceManager.shared.presenceState(for: userId),
                    isHere: isHere(userId),
                    ring: conversation?.participantRing,
                    onTap: openDoor,
                    onViewStory: {
                        headerState.storyUserIdForHeader = userId
                        headerState.showStoryViewerFromHeader = true
                    },
                    onMoodTap: statusViewModel.moodTapHandler(for: userId),
                    contextMenuItems: directContextMenu
                )
                .modifier(doorAccessibility(menu: directAccessibilityMenu))
            } else {
                HStack(spacing: MeeshySpacing.xs) {
                    // Stacked active member avatars
                    if !topActiveMembers.isEmpty {
                        HStack(spacing: -6) {
                            ForEach(topActiveMembers) { member in
                                let storyState = memberStoryState(for: member.viewingKey)
                                MeeshyAvatar(
                                    name: member.name,
                                    context: .conversationHeaderStacked,
                                    accentColor: member.color,
                                    avatarURL: member.avatarURL,
                                    storyState: storyState,
                                    moodEmoji: statusViewModel.statusForUser(userId: member.viewingKey)?.moodEmoji,
                                    presenceState: PresenceManager.shared.presenceState(for: member.viewingKey),
                                    isHere: isHere(member.viewingKey),
                                    ring: member.ring,
                                    onTap: { openMember(member, storyState: storyState) },
                                    onMoodTap: statusViewModel.moodTapHandler(for: member.viewingKey),
                                    contextMenuItems: memberContextMenu(for: member, storyState: storyState)
                                )
                            }
                        }
                    }

                    // Conversation avatar (always visible for groups)
                    MeeshyAvatar(
                        name: conversation?.name ?? "?",
                        context: .conversationHeaderExpanded,
                        kind: .entity,
                        accentColor: accentColor,
                        secondaryColor: secondaryColor,
                        avatarURL: conversation?.avatar,
                        onTap: openDoor
                    )
                    .modifier(doorAccessibility(menu: []))
                }
            }
        } else {
            // Collapsed: tap opens the profile or the details (#10300) — the band's
            // free space expands it — long press shows the context menu
            MeeshyAvatar(
                name: conversation?.name ?? "?",
                context: .conversationHeaderCollapsed,
                accentColor: accentColor,
                secondaryColor: secondaryColor,
                avatarURL: conversation?.type == .direct ? conversation?.participantAvatarURL : conversation?.avatar,
                storyState: collapsedStoryState,
                moodEmoji: headerMoodEmoji,
                presenceState: livePresenceState,
                isHere: isDirect ? isHere(conversation?.participantUserId) : .absent,
                ring: isDirect ? conversation?.participantRing : nil,
                onTap: openDoor,
                onViewStory: isDirect ? {
                    if let userId = conversation?.participantUserId {
                        headerState.storyUserIdForHeader = userId
                        headerState.showStoryViewerFromHeader = true
                    }
                } : nil,
                onMoodTap: isDirect ? statusViewModel.moodTapHandler(for: conversation?.participantUserId ?? "", repliesInline: true) : nil,
                contextMenuItems: directContextMenu
            )
            .modifier(doorAccessibility(menu: isDirect ? directAccessibilityMenu : []))
            // La flamme du jour, sous l'avatar replié (#9031).
            .modifier(HeaderFlameDecoration(
                conversationId: conversation?.id ?? "",
                seed: conversation?.viewerEngagement,
                headerExpanded: showsIdentity,
                dismissed: headerState.flameDismissed,
                avatarDiameter: 44,
                onDismiss: onDismissFlame
            ))
        }
    }
}

/// Le disque de verre de la porte de l'aperçu — la forme de la loupe
/// (`HeaderSearchGlyph`), type NOMINAL pour borner la chaîne de types de l'en-tête.
struct HeaderOpenFullGlyph: View {
    let accentColor: String

    var body: some View {
        Image(systemName: "arrow.up.left.and.arrow.down.right")
            .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
            .foregroundStyle(Color(hex: accentColor))
            .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
            .adaptiveGlass(in: Circle(), tint: Color(hex: accentColor).opacity(MeeshyOpacity.medium))
            .meeshyTapTarget()
    }
}

// MARK: - Le fond de la conversation, en type NOMINAL

/// Le fond vit toute la vie de l'écran : c'est là qu'il écoute le pair d'un
/// direct (#9359) — seule une annonce qui CHANGE le pair affiché écrit l'état —
/// et l'accent personnel choisi ou rétabli (#10631), qui repeint le fil, ses
/// bulles, son composeur et son en-tête sans relecture réseau. La traduction
/// sur l'appareil (#9899) y vit aussi : la couche n'y peint rien.
struct ConversationBackgroundLayer: View {
    let conversationId: String
    let initialAppearance: ConversationAppearance?
    let signature: ConversationBackgroundConfig
    let knownAttachment: (String) -> MeeshyMessageAttachment?
    let viewModel: ConversationViewModel
    let deviceTranslationEnabled: Bool
    let encryptionMode: String?
    let onPeerUpdate: (UserUpdatedEvent) -> Void
    let onAppearanceChange: (Notification) -> Void

    var body: some View {
        ConversationBackgroundView(
            conversationId: conversationId,
            initialAppearance: initialAppearance,
            signature: signature,
            knownAttachment: knownAttachment
        )
        .onReceive(MessageSocketManager.shared.userUpdated.receive(on: DispatchQueue.main)) { event in
            onPeerUpdate(event)
        }
        .onReceive(NotificationCenter.default.publisher(for: ConversationAppearanceChange.notification).receive(on: DispatchQueue.main)) { note in
            onAppearanceChange(note)
        }
        .deviceTranslationLayer(
            viewModel: viewModel,
            isEnabled: deviceTranslationEnabled,
            encryptionMode: encryptionMode
        )
    }
}
