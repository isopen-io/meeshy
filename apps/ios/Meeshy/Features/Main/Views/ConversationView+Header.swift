// MARK: - Extracted from ConversationView.swift
import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI
import os

// MARK: - Header, Background & Navigation
extension ConversationView {

    // MARK: - Conversation Background
    var conversationBackground: some View {
        ConversationAnimatedBackground(
            config: ConversationBackgroundConfig(
                conversationType: conversation?.type ?? .direct,
                isEncrypted: conversation?.encryptionMode != nil,
                isE2EEncrypted: conversation?.encryptionMode == "e2ee",
                memberCount: conversation?.memberCount ?? 2,
                accentHex: accentColor,
                secondaryHex: secondaryColor,
                isDarkMode: isDark
            )
        )
        // Le fond vit toute la vie de l'écran : c'est là qu'il écoute le pair
        // d'un direct (#9359). Seule une annonce qui CHANGE le pair affiché
        // écrit l'état — les autres ne redessinent rien.
        .onReceive(MessageSocketManager.shared.userUpdated.receive(on: DispatchQueue.main)) { event in
            admitPeerUpdate(event)
        }
        // Traduction sur l'appareil (#9899) : le fond vit aussi longtemps que
        // l'écran, et la couche n'y peint rien.
        .deviceTranslationLayer(
            viewModel: viewModel,
            isEnabled: !previewMode && anonymousSession == nil,
            encryptionMode: liveConversation?.encryptionMode
        )
    }

    // MARK: - Header Avatar (thin wrapper → extracted struct to avoid PAC crashes)
    var headerAvatarView: AnyView {
        AnyView(ConversationHeaderAvatarView(
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
        ))
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
    var expandedHeaderMidContent: AnyView {
        AnyView(ConversationHeaderMidContent(
            layout: headerLayout,
            titleAndTags: { AnyView(expandedHeaderTitleAndTags) },
            actionButtons: { headerButtonsCluster },
            onToggleBand: headerAvatarDoor.bandToggles(isPreview: previewMode)
                ? { setHeaderExpanded(!composerState.showOptions) }
                : nil
        ))
    }

    // MARK: - L'aperçu tiré de la bannière (#8822)

    /// Ce que la bande d'en-tête montre : l'aperçu porte l'en-tête COMPLET dans
    /// son bloc de verre, sans chevron retour (`ConversationHeaderLayout`).
    var headerLayout: ConversationHeaderLayout {
        ConversationHeaderLayout.resolve(previewMode: previewMode, showOptions: composerState.showOptions)
    }

    /// LA PORTE VERS LA CONVERSATION COMPLÈTE, dans l'aperçu. Elle remplace le
    /// calque transparent posé sur tout le fil, qui l'ouvrait au toucher — et
    /// volait ainsi le DÉFILEMENT à la liste.
    var openFullConversationButton: AnyView {
        AnyView(Button {
            HapticFeedback.light()
            onOpenFullConversation?()
        } label: {
            HeaderOpenFullGlyph(accentColor: accentColor)
        }
        .accessibilityLabel(String(localized: "conversation.preview.openFull", defaultValue: "Ouvrir la conversation", bundle: .main))
        .accessibilityIdentifier("conversation.preview.openFull"))
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

    // AnyView : dernier maillon nu de la chaîne du header (voir les
    // commentaires d'érasure sur `headerButtonsCluster`/
    // `readingModeAffordanceCluster` dans ConversationView.swift, même
    // débordement de pile au décodage de mangled name, 2026-08-17).
    var headerCallButtons: AnyView {
        AnyView(headerCallButtonsOnly
        .task(id: liveConversation?.id) {
            await ConversationEngagementStore.shared.revalidate(liveConversation?.id ?? "")
        })
    }

    // MARK: - « 🔥 série · total » (#8906, #9044)

    /// Ce que le lecteur a gagné dans CETTE conversation. Elle ne se lit que
    /// sous le titre de l'en-tête DÉPLIÉ : replié ou en aperçu, c'est la flamme
    /// du jour sous l'avatar qui parle.
    var headerEngagementBadge: some View {
        ConversationEngagementBadge(
            conversationId: liveConversation?.id ?? "",
            seed: liveConversation?.viewerEngagement,
            accentColor: accentColor
        )
    }

    private var headerCallButtonsOnly: AnyView {
        guard let entry = HeaderCallEntry.resolve(
            conversation: conversation,
            viewerPlatformRole: AuthManager.shared.currentUser?.role,
            viewerIsGuest: anonymousSession != nil
        ) else { return AnyView(EmptyView()) }
        switch entry.callee {
        case .conversation:
            // #3585 — un groupe s'appelle depuis le MÊME bouton qu'un contact : la
            // poignée de l'appel est la conversation, son nom le titre du groupe.
            let groupId = conversation?.id ?? ""
            return AnyView(HeaderCallButtonsView(
                conversationId: groupId,
                userId: groupId,
                calleeName: conversation?.displayName ?? "",
                accentColor: accentColor,
                secondaryColor: secondaryColor,
                isGroup: true,
                canStart: entry.canStart
            ))
        case .peer(let userId):
            // §7.6 — the start-call buttons are owned by a dedicated subview that
            // observes CallManager, so during an active call they swap to a
            // "tap to return" indicator (preventing a 2nd call from the header)
            // without forcing the whole ConversationView to observe the singleton.
            return AnyView(HeaderCallButtonsView(
                conversationId: conversation?.id ?? "",
                userId: userId,
                calleeName: resolvedCalleeName,
                accentColor: accentColor,
                secondaryColor: secondaryColor,
                canStart: entry.canStart
            ))
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
    @ViewBuilder
    var headerTagsRow: some View {
        // F11 (revue adversariale 2026-08-25) : `encryptionMode`/`tags`
        // lisent la conversation VIVANTE — un réglage (changement de mode de
        // chiffrement, ajout/retrait d'un tag) doit se refléter sur CETTE
        // bande sans réouverture, exactement comme la bande d'avatars juste
        // au-dessus dans le même en-tête.
        let isEncrypted = liveConversation?.encryptionMode != nil
        let hasTags = conversationSection != nil || !(liveConversation?.tags.isEmpty ?? true) || isEncrypted
        let showsEngagement = !headerLayout.showsActions
        if hasTags {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.xs) {
                    if showsEngagement {
                        headerEngagementBadge
                    }

                    // Lock icon (encryption only, no text)
                    if isEncrypted {
                        Image(systemName: "lock.fill")
                            .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
                            .foregroundColor(theme.success)
                            .accessibilityLabel(String(localized: "conversation.encrypted", defaultValue: "Conversation chiffrée", bundle: .main))
                    }

                    // Category tag
                    if let section = conversationSection {
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
                        .background(
                            Capsule()
                                .fill(Color(hex: section.color).opacity(MeeshyOpacity.light))
                                .overlay(
                                    Capsule()
                                        .stroke(Color(hex: section.color).opacity(MeeshyOpacity.medium), lineWidth: MeeshyBorder.hairline)
                                )
                        )
                    }

                    if let conv = liveConversation {
                        ForEach(conv.tags) { tag in
                            Text(tag.name)
                                .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .semibold))
                                .foregroundColor(Color(hex: tag.color))
                                .padding(.horizontal, MeeshySpacing.xs)
                                .padding(.vertical, MeeshySpacing.xxs)
                                .background(
                                    Capsule()
                                        .fill(Color(hex: tag.color).opacity(MeeshyOpacity.light))
                                        .overlay(
                                            Capsule()
                                                .stroke(Color(hex: tag.color).opacity(MeeshyOpacity.medium), lineWidth: MeeshyBorder.hairline)
                                        )
                                )
                        }
                    }
                }
            }
        } else if showsEngagement {
            headerEngagementBadge
        }
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

// MARK: - Header Call Buttons (§7.6)
// Owns the CallManager observation so the header reacts to call state without
// the whole ConversationView subscribing. Idle → audio + video start buttons;
// active call → a green "tap to return" indicator (blocks starting a 2nd call,
// gives one-tap return to the in-progress call).

private struct HeaderCallButtonsView: View {
    let conversationId: String
    let userId: String
    let calleeName: String
    let accentColor: String
    let secondaryColor: String
    /// #3585 — `userId` porte alors la conversation (poignée CallKit du groupe)
    /// et `calleeName` son titre.
    var isGroup = false
    /// `false` : le lecteur ne LANCE pas d'appel ici (#10207 — une `public`
    /// dont il n'est ni créateur ni administrateur) ; il rejoint seulement
    /// celui qui est déjà en cours.
    var canStart = true

    @ObservedObject private var callManager = CallManager.shared
    /// Set when the SERVER (not this device's own `CallManager`) reports an
    /// active call for this conversation — the case `callManager.callState`
    /// alone can't detect: this device's own session was lost (app relaunch,
    /// crash) while the call is still ongoing. User-requested 2026-07-11 —
    /// "il faut permettre... l'indicateur minuteur vert... doit être présent
    /// avec la possibilité au touché de rejoindre l'appel". Reconciliation
    /// itself (the REST call) is an SDK atom (`ActiveCallService`); deciding
    /// WHEN to call it and how it changes this button is app orchestration.
    @State private var reconciledActiveCall: ActiveCallSession?

    var body: some View {
        Group {
            if callManager.callState.isActive {
                // 2026-08-13 — un appel actif ne doit apparaître dans le header
                // QUE de la conversation qui l'héberge, jamais dans toutes les
                // conversations ouvertes pendant qu'un appel tourne ailleurs.
                // `callManager.callState.isActive` seul (avant ce fix) ne
                // distinguait pas — cette pastille "revenir à l'appel" sortait
                // identique dans n'importe quelle conversation directe.
                if isActiveCallForThisConversation {
                    returnToCallIndicator
                }
            } else if let activeCall = reconciledActiveCall {
                rejoinCallIndicator(activeCall)
            } else if canStart {
                startCallButtons
            }
        }
        // Re-reconciles when the conversation changes OR when the local call
        // starts/stops (#9111 — after leaving a group call that goes on, the
        // pill must come back as « Rejoindre ») — never on every callState tick.
        .task(id: HeaderCallReconcileKey(conversationId: conversationId, isLocalCallActive: callManager.callState.isActive)) {
            await reconcileActiveCall()
        }
        // Invalidation temps réel : le gateway fanout `call:ended` jusqu'aux
        // user-rooms de TOUS les membres de la conversation
        // (resolveCallEndedRooms) — un viewer non-participant le reçoit donc
        // aussi. Sans ça, la pill « Rejoindre » (posée une seule fois au
        // .task ci-dessus) resterait pointée sur un appel mort jusqu'au
        // prochain passage dans la conversation, et un tap déclencherait un
        // call:join rejeté « This call has already ended ». Match par callId :
        // un appel qui finit dans une AUTRE conversation ne doit pas effacer
        // la pill de celle-ci. Hop main obligatoire : le publisher émet
        // depuis la queue du socket (classe SIGTRAP connue des surfaces
        // d'appel).
        .onReceive(MessageSocketManager.shared.callEnded.receive(on: DispatchQueue.main)) { event in
            if reconciledActiveCall?.id == event.callId {
                reconciledActiveCall = nil
            }
        }
    }

    /// `true` quand l'appel actif localement (`CallManager.shared`) appartient
    /// à CETTE conversation. `callManager.conversationId` peut être `nil` pour
    /// un appel entrant réveillé par VoIP push sans ce champ dans le payload
    /// (cf. doc sur `CallManager.conversationId`) — dans ce cas précis on
    /// dégrade en affichant quand même la pastille plutôt que de la masquer
    /// partout, pour ne jamais priver l'utilisateur d'un chemin de retour
    /// vers son propre appel.
    private var isActiveCallForThisConversation: Bool {
        guard let activeConversationId = callManager.conversationId else { return true }
        return activeConversationId == conversationId
    }

    private var returnToCallIndicator: some View {
        Button {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.75)) {
                callManager.displayMode = .fullScreen
            }
            HapticFeedback.medium()
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Circle()
                    .fill(MeeshyColors.success)
                    .frame(width: 7, height: 7)
                Image(systemName: "phone.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
                CallDurationClock {
                    Text(callManager.formattedDuration)
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold, design: .monospaced))
                }
            }
            .foregroundColor(MeeshyColors.success)
            .padding(.horizontal, MeeshySpacing.smPlus)
            .padding(.vertical, MeeshySpacing.xs)
            .background(
                Capsule()
                    .fill(MeeshyColors.success.opacity(MeeshyOpacity.light))
                    .overlay(Capsule().stroke(MeeshyColors.success.opacity(MeeshyOpacity.medium), lineWidth: MeeshyBorder.hairline))
            )
        }
        .accessibilityLabel(String(localized: "call.header.return", defaultValue: "Appel en cours, toucher pour revenir", bundle: .main))
    }

    /// Same visual family as `returnToCallIndicator` (green pill, same glyph)
    /// but no live duration — this device hasn't rejoined the media session
    /// yet, so there's nothing ticking to show. Tapping calls
    /// `CallManager.rejoinActiveCall`, which resumes the WebRTC session
    /// directly into `.connecting` — once that lands, `callManager.callState.isActive`
    /// flips true and this view naturally swaps to `returnToCallIndicator`.
    private func rejoinCallIndicator(_ activeCall: ActiveCallSession) -> some View {
        Button {
            // Rejoindre un groupe en cours : les membres présents offrent à
            // l'arrivant, et le premier qui offre devient le pair principal.
            if isGroup { GroupCallMeshCoordinator.shared.markGroupConversation(conversationId, title: calleeName) }
            callManager.rejoinActiveCall(
                callId: activeCall.id,
                conversationId: conversationId,
                remoteUserId: userId,
                remoteUsername: calleeName,
                isVideo: activeCall.isVideo
            )
            HapticFeedback.medium()
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Circle()
                    .fill(MeeshyColors.success)
                    .frame(width: 7, height: 7)
                Image(systemName: "phone.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .semibold))
                Text(String(localized: "call.header.rejoin", defaultValue: "Rejoindre", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            }
            .foregroundColor(MeeshyColors.success)
            .padding(.horizontal, MeeshySpacing.smPlus)
            .padding(.vertical, MeeshySpacing.xs)
            .background(
                Capsule()
                    .fill(MeeshyColors.success.opacity(MeeshyOpacity.light))
                    .overlay(Capsule().stroke(MeeshyColors.success.opacity(MeeshyOpacity.medium), lineWidth: MeeshyBorder.hairline))
            )
        }
        .accessibilityLabel(String(localized: "call.header.rejoin.a11y", defaultValue: "Appel en cours, toucher pour rejoindre", bundle: .main))
    }

    /// Reconciles with the server on every conversation open — this
    /// device's own `callManager.callState` can't tell the difference
    /// between "no call" and "a call is active but this session lost it".
    /// Skipped when `callManager` already knows locally (no need to hit the
    /// network, and avoids a race that could momentarily contradict local
    /// state) or for non-direct conversations (no single peer to rejoin).
    private func reconcileActiveCall() async {
        guard !callManager.callState.isActive else { return }
        // try? flattens the throws+Optional combination (SE-0230) — a
        // network error and "no active call" both collapse to nil here,
        // which is the right behavior: reconciliation is best-effort and
        // silent, never surfaced as an error to the user.
        let session = try? await ActiveCallService.shared.activeCall(conversationId: conversationId)
        reconciledActiveCall = session?.conversationId == conversationId ? session : nil
    }

    /// Bouton d'appel unique : un `Menu` qui laisse choisir vocal ou vidéo via un
    /// menu contextuel (au lieu de deux boutons séparés). Le glyphe adopte le verre
    /// adaptatif (Liquid Glass iOS 26, repli `.ultraThinMaterial` en deçà) teinté à
    /// la couleur d'accent de la conversation.
    private var startCallButtons: some View {
        Menu {
            Button {
                startCall(isVideo: false)
            } label: {
                Label(String(localized: "call.start.audio", defaultValue: "Appel vocal", bundle: .main), systemImage: "phone.fill")
            }
            Button {
                startCall(isVideo: true)
            } label: {
                Label(String(localized: "call.start.video", defaultValue: "Appel video", bundle: .main), systemImage: "video.fill")
            }
        } label: {
            callGlyph("phone.fill")
                .meeshyTapTarget()
        }
        .accessibilityLabel(isGroup
            ? String(localized: "call.group.start.menu", defaultValue: "Appeler le groupe", bundle: .main)
            : String(localized: "call.start.menu", defaultValue: "Appeler", bundle: .main))
        .accessibilityHint(isGroup
            ? String(localized: "call.group.start.menu.hint", defaultValue: "Appel vocal ou vidéo avec les membres du groupe, jusqu'à 6 personnes", bundle: .main)
            : String(localized: "call.start.menu.hint", defaultValue: "Choisir un appel vocal ou vidéo", bundle: .main))
    }

    private func startCall(isVideo: Bool) {
        let conversationId = conversationId
        let userId = userId
        let calleeName = calleeName
        guard isGroup else {
            Task { await CallManager.shared.requestPermissionsThenStartCall(conversationId: conversationId, userId: userId, displayName: calleeName, isVideo: isVideo) }
            return
        }
        Task { await CallManager.shared.startGroupCall(conversationId: conversationId, title: calleeName, isVideo: isVideo) }
    }

    private func callGlyph(_ systemName: String) -> some View {
        Image(systemName: systemName)
            .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
            .foregroundStyle(
                LinearGradient(
                    colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                )
            )
            // Matches expandedHeaderSearchButton's circle exactly (28×28,
            // font 13) — user-requested 2026-07-11: the two header buttons
            // must read as the same size. `.adaptiveGlass` MUST come before
            // `.meeshyTapTarget()`, not after (bug found 2026-07-11): glass
            // is a Circle sized to the CURRENT view bounds at that point in
            // the chain — applying it after meeshyTapTarget's `.frame(minWidth:
            // 44, minHeight: 44)` drew the visible circle at 44pt instead of
            // 28pt, even though both buttons declared identical numbers.
            // expandedHeaderSearchButton already has the correct order.
            .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
            .adaptiveGlass(in: Circle(), tint: Color(hex: accentColor).opacity(0.4), interactive: true)
            .meeshyTapTarget()
    }
}

// MARK: - Conversation Header Avatar View
// Extracted struct to avoid PAC (Pointer Authentication Code) crashes on ARM64e:
// @ViewBuilder computed properties capturing @EnvironmentObject + @State in @escaping closures
// cause EXC_BAD_ACCESS in swift_retain. Using a dedicated struct gives SwiftUI proper ownership.

private struct ConversationHeaderAvatarView: View {
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
        case .story: openStory(of: member.id)
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
                ) { openStory(of: member.id) }
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
                                let storyState = memberStoryState(for: member.id)
                                MeeshyAvatar(
                                    name: member.name,
                                    context: .conversationHeaderStacked,
                                    accentColor: member.color,
                                    avatarURL: member.avatarURL,
                                    storyState: storyState,
                                    moodEmoji: statusViewModel.statusForUser(userId: member.id)?.moodEmoji,
                                    presenceState: PresenceManager.shared.presenceState(for: member.id),
                                    isHere: isHere(member.viewingKey),
                                    onTap: { openMember(member, storyState: storyState) },
                                    onMoodTap: statusViewModel.moodTapHandler(for: member.id),
                                    contextMenuItems: memberContextMenu(for: member, storyState: storyState)
                                )
                            }
                        }
                    }

                    // Conversation avatar (always visible for groups)
                    MeeshyAvatar(
                        name: conversation?.name ?? "?",
                        context: .conversationHeaderExpanded,
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
                presenceState: headerPresenceState,
                isHere: isDirect ? isHere(conversation?.participantUserId) : .absent,
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
private struct HeaderOpenFullGlyph: View {
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
