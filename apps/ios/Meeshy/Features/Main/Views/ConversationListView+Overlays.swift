import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from ConversationListView.swift

extension ConversationListView {

    // MARK: - Context Menu
    @ViewBuilder
    func conversationContextMenu(for conversation: Conversation) -> some View {
        // Pin/Unpin
        Button {
            HapticFeedback.medium()
            Task { await conversationViewModel.togglePin(for: conversation.id) }
        } label: {
            Label(
                conversation.userState.isPinned
                    ? String(localized: "context.unpin", defaultValue: "D\u{00e9}s\u{00e9}pingler")
                    : String(localized: "context.pin", defaultValue: "\u{00c9}pingler"),
                systemImage: conversation.userState.isPinned ? "pin.slash.fill" : "pin.fill"
            )
        }

        // Mute/Unmute
        Button {
            HapticFeedback.light()
            Task { await conversationViewModel.toggleMute(for: conversation.id) }
        } label: {
            Label(
                conversation.userState.isMuted
                    ? String(localized: "context.unmute", defaultValue: "R\u{00e9}activer les notifications")
                    : String(localized: "context.mute", defaultValue: "Mettre en silence"),
                systemImage: conversation.userState.isMuted ? "bell.fill" : "bell.slash.fill"
            )
        }

        Divider()

        // Mark as read/unread
        if conversation.userState.unreadCount > 0 {
            Button {
                HapticFeedback.light()
                Task { await conversationViewModel.markAsRead(conversationId: conversation.id) }
            } label: {
                Label(String(localized: "context.mark_read", defaultValue: "Marquer comme lu"), systemImage: "envelope.open.fill")
            }
        } else {
            Button {
                HapticFeedback.light()
                Task { await conversationViewModel.markAsUnread(conversationId: conversation.id) }
            } label: {
                Label(String(localized: "context.mark_unread", defaultValue: "Marquer comme non lu"), systemImage: "envelope.badge.fill")
            }
        }

        // Détails
        Button {
            HapticFeedback.light()
            conversationInfoConversation = conversation
        } label: {
            Label(String(localized: "context.details", defaultValue: "Détails"), systemImage: "info.circle.fill")
        }

        // Favorite with emoji
        Menu {
            ForEach(["⭐️", "❤️", "🔥", "💎", "🎯", "✨", "🏆", "💡"], id: \.self) { emoji in
                Button {
                    HapticFeedback.light()
                    Task { await conversationViewModel.setFavoriteReaction(conversationId: conversation.id, emoji: emoji) }
                } label: {
                    Text(emoji)
                }
            }
            if conversation.userState.reaction != nil {
                Divider()
                Button(role: .destructive) {
                    HapticFeedback.light()
                    Task { await conversationViewModel.setFavoriteReaction(conversationId: conversation.id, emoji: nil) }
                } label: {
                    Label(String(localized: "context.remove_favorite", defaultValue: "Retirer le favori"), systemImage: "star.slash")
                }
            }
        } label: {
            Label(
                conversation.userState.reaction != nil
                    ? String(localized: "context.favorite_active", defaultValue: "Favori \(conversation.userState.reaction ?? "")")
                    : String(localized: "context.favorite", defaultValue: "Favori"),
                systemImage: conversation.userState.reaction != nil ? "star.fill" : "star"
            )
        }

        // Move to category
        Menu {
            ForEach(conversationViewModel.userCategories) { category in
                let isCurrentCategory = conversation.userState.sectionId == category.id
                Button {
                    HapticFeedback.light()
                    if isCurrentCategory {
                        conversationViewModel.moveToSection(conversationId: conversation.id, sectionId: "")
                    } else {
                        conversationViewModel.moveToSection(conversationId: conversation.id, sectionId: category.id)
                    }
                } label: {
                    if isCurrentCategory {
                        Label("\(category.name) \u{2713}", systemImage: category.icon)
                    } else {
                        Label(category.name, systemImage: category.icon)
                    }
                }
            }
            if !conversationViewModel.userCategories.isEmpty {
                Divider()
            }
            Button {
                HapticFeedback.light()
                conversationViewModel.moveToSection(conversationId: conversation.id, sectionId: "")
            } label: {
                Label(String(localized: "context.my_conversations", defaultValue: "Mes conversations"), systemImage: "tray.fill")
            }
        } label: {
            Label(String(localized: "context.move_to", defaultValue: "D\u{00e9}placer vers..."), systemImage: "folder.fill")
        }

        Divider()

        // Secondary actions — grouped to keep top-level count ≤8 so iOS renders
        // the compact popup style where Label icons are visible.
        Menu {
            // Inviter — ouvrir le sheet d'invitation si droits suffisants
            if canCreateShareLink(for: conversation) {
                Button {
                    HapticFeedback.medium()
                    inviteSheetConversation = conversation
                } label: {
                    Label(String(localized: "context.invite_friends", defaultValue: "Inviter mes amis"), systemImage: "person.badge.plus")
                }
            }

            // Lock/Unlock
            let isLockedCtx = ConversationLockManager.shared.isLocked(conversation.id)
            Button {
                HapticFeedback.medium()
                if isLockedCtx {
                    lockSheetMode = .unlockConversation
                    lockSheetConversation = conversation
                } else if ConversationLockManager.shared.masterPinConfigured {
                    lockSheetMode = .lockConversation
                    lockSheetConversation = conversation
                } else {
                    showNoMasterPinAlert = true
                }
            } label: {
                Label(
                    isLockedCtx
                        ? String(localized: "context.unlock", defaultValue: "Déverrouiller")
                        : String(localized: "context.lock", defaultValue: "Verrouiller"),
                    systemImage: isLockedCtx ? "lock.open.fill" : "lock.fill"
                )
            }

            // Archive / Unarchive — always offered so an archived conversation can
            // always be unarchived (including blocked DMs, which previously hid this
            // button and left them stuck in the Archived filter).
            // Per-user archive state — same source the list filter (`.archived`) and
            // the `.setArchived` mutation read. NOT `conversation.isActive`, which is
            // the server-side conversation lifecycle flag and is never toggled by
            // archiving. `userState.isArchived` is folded into `renderFingerprint`,
            // so the row re-evaluates and this closure stays fresh.
            let isArchivedConv = conversation.userState.isArchived
            Button {
                HapticFeedback.medium()
                if isArchivedConv {
                    Task { await conversationViewModel.unarchiveConversation(conversationId: conversation.id) }
                } else {
                    Task { await conversationViewModel.archiveConversation(conversationId: conversation.id) }
                }
            } label: {
                Label(
                    isArchivedConv
                        ? String(localized: "context.unarchive", defaultValue: "Désarchiver")
                        : String(localized: "context.archive", defaultValue: "Archiver"),
                    systemImage: isArchivedConv ? "tray.and.arrow.up.fill" : "archivebox.fill"
                )
            }

            // Block / Unblock (DM only)
            if conversation.type == .direct, let userId = conversation.participantUserId {
                let isBlockedCtx = BlockService.shared.isBlocked(userId: userId)
                Divider()
                if isBlockedCtx {
                    Button {
                        HapticFeedback.heavy()
                        Task {
                            await BlockActionCoordinator.shared.unblock(userId: userId)
                            await MainActor.run { HapticFeedback.success() }
                        }
                    } label: {
                        Label(
                            String(localized: "context.unblock", defaultValue: "Débloquer"),
                            systemImage: "hand.raised.slash.fill"
                        )
                    }
                } else {
                    Button(role: .destructive) {
                        HapticFeedback.heavy()
                        blockTargetConversation = conversation
                        showBlockConfirmation = true
                    } label: {
                        Label(
                            String(localized: "context.block", defaultValue: "Bloquer"),
                            systemImage: "hand.raised.fill"
                        )
                    }
                }
            }
        } label: {
            Label(String(localized: "context.more_options", defaultValue: "Plus d'options"), systemImage: "ellipsis.circle.fill")
        }

        Divider()

        // Delete (destructive -- soft delete for user only)
        Button(role: .destructive) {
            HapticFeedback.heavy()
            Task { await conversationViewModel.deleteConversation(conversationId: conversation.id) }
        } label: {
            Label(String(localized: "context.delete", defaultValue: "Supprimer"), systemImage: "trash.fill")
        }
    }

    // MARK: - Custom Context Menu Overlay (icônes garanties iOS 26)

    func dismissContextMenu() {
        // Zoom-out : anime la sortie (aperçu rétrécit, menu redescend) puis
        // retire réellement l'overlay après la durée du spring. Purge annulable :
        // si l'utilisateur rouvre un menu avant la fin du zoom-out, `onLongPress`
        // annule ce work item, sinon il effacerait le menu fraîchement rouvert.
        chipAutoScrollDriver.stop()
        contextMenuDismissWork?.cancel()
        // min() : ne jamais RE-déplier une carte repliée par le drag vers le
        // haut (0.0 → 0.7 ferait flasher l'aperçu pendant le fondu de sortie).
        // Le shrink est ANIMÉ dans la même transaction que le fondu : la carte
        // se résorbe (zoom-out + blur progressif lié au scale) pendant que le
        // menu redescend et se dissout — miroir du zoom d'ouverture.
        withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
            previewScale = min(previewScale, 0.7)
            if !chipModeLatched && dragOffsetY <= 110 {
                // Fermeture normale : la carte revient en place en fondant.
                // Fermeture depuis le morph drag (chip relâchée) : la carte
                // fond SUR PLACE sous le doigt — la faire remonter au centre
                // pendant le fondu serait un aller-retour parasite.
                dragOffsetY = 0
                dragOffsetX = 0
            }
            contextMenuAppeared = false
        }
        let work = DispatchWorkItem {
            contextMenuConversation = nil
            previewScale = 1.0
            previewEmergeOffset = 0
            dragOffsetY = 0
            dragOffsetX = 0
            chipModeLatched = false
            contextMenuSourceFrame = nil
        }
        contextMenuDismissWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.26, execute: work)
    }

    /// Progression du morph drag-n-drop pendant le drag vers le bas sur la
    /// carte (0 = menu ouvert, 1 = carte devenue chip draggable) : le blur du
    /// fond s'efface, le menu se dissout, la carte rétrécit et suit le doigt.
    /// Tout dérive de `dragOffsetY` — le snap-back du geste restaure tout.
    /// Une fois LATCHÉE (`chipModeLatched`), la chip reste chip même si le
    /// doigt remonte (pour viser un header de section au-dessus).
    var dragMorphProgress: CGFloat {
        chipModeLatched ? 1 : min(1, max(0, dragOffsetY / 140))
    }

    /// Émergence de l'aperçu depuis la ligne pressée. Tick 1 : la frame de
    /// repos de la carte vient d'être mesurée (layout au repos, overlay
    /// invisible) — placer la carte SUR la ligne source, sans animation.
    /// Tick 2 : animer vers la position/taille finales avec un départ LENT,
    /// une accélération à mi-course et un léger rebond (timingCurve à
    /// overshoot) ; le menu remonte et le fond se floute dans la même
    /// transaction (coordonné).
    func runContextMenuEmergence() {
        DispatchQueue.main.async {
            var placement = Transaction()
            placement.disablesAnimations = true
            withTransaction(placement) {
                if let source = contextMenuSourceFrame, previewRestFrame.height > 0 {
                    let scale = max(0.22, min(0.7, source.height / previewRestFrame.height))
                    previewScale = scale
                    // scaleEffect est ancré .bottom : le centre visuel de la
                    // carte réduite est à maxY - scale·H/2 — l'offset aligne
                    // ce centre sur celui de la ligne pressée.
                    previewEmergeOffset = source.midY
                        - (previewRestFrame.maxY - scale * previewRestFrame.height / 2)
                } else {
                    previewScale = 0.7
                    previewEmergeOffset = 0
                }
            }
            DispatchQueue.main.async {
                // Overshoot 1.3 : rebond nettement perceptible à l'arrivée de
                // la carte (le rebond appartient au long-press/preview, pas
                // au swipe des lignes — feedback user 2026-07-03).
                withAnimation(.timingCurve(0.5, 0.0, 0.15, 1.3, duration: 0.55)) {
                    contextMenuAppeared = true
                    previewScale = 1.0
                    previewEmergeOffset = 0
                }
            }
        }
    }

    /// Capture de la frame de REPOS de la carte — uniquement hors
    /// transformation (avant l'émergence : overlay invisible, scale 1,
    /// offsets nuls), sinon la mesure inclurait scale/offset en vol.
    func capturePreviewRestFrameIfIdle(_ frame: CGRect) {
        guard !contextMenuAppeared,
              previewScale == 1.0,
              previewEmergeOffset == 0,
              dragOffsetY == 0
        else { return }
        previewRestFrame = frame
    }

    @ViewBuilder
    var conversationContextMenuOverlay: some View {
        if let conversation = contextMenuConversation {
            ZStack {
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .ignoresSafeArea()
                    .overlay(Color.black.opacity(0.12).ignoresSafeArea())
                    .contentShape(Rectangle())
                    .onTapGesture { dismissContextMenu() }
                    // Le blur du fond s'EFFACE pendant le morph drag : la
                    // liste réapparaît sous la carte devenue chip draggable.
                    .opacity(contextMenuAppeared ? Double(1 - dragMorphProgress) : 0)

                VStack(spacing: 16) {
                    ConversationPreviewView(
                        conversation: conversation,
                        cachedMessages: conversationViewModel.previewMessages[conversation.id] ?? [],
                        bannerURL: (conversation.type == .direct ? conversation.participantBanner : conversation.banner).flatMap { MeeshyConfig.resolveMediaURL($0) },
                        avatarURL: conversation.type == .direct ? conversation.participantAvatarURL : conversation.avatar,
                        storyState: storyRingState(for: conversation),
                        moodEmoji: conversationMoodStatus(for: conversation)?.moodEmoji,
                        presenceState: conversation.type == .direct
                            ? PresenceManager.shared.presenceState(for: conversation.participantUserId ?? "")
                            : nil,
                        isDirect: conversation.type == .direct,
                        onCall: (conversation.type == .direct && conversation.participantUserId != nil) ? {
                            dismissContextMenu()
                            if let uid = conversation.participantUserId {
                                CallManager.shared.startCall(
                                    conversationId: conversation.id,
                                    userId: uid,
                                    displayName: conversation.name,
                                    isVideo: false
                                )
                            }
                        } : nil,
                        onSearch: {
                            dismissContextMenu()
                            router.pendingOpenSearch = true
                            onSelect(conversation)
                        },
                        onInfo: { dismissContextMenu(); conversationInfoConversation = conversation },
                        onProfileInfo: { dismissContextMenu(); handleProfileView(conversation) }
                    )
                    // Preview STATIQUE (parité `.contextMenu` natif) : le
                    // ScrollView interne des messages interceptait le pan et
                    // volait le drag du geste de repli/morph ci-dessous — le
                    // contenu défilait dans la carte au lieu de la déplacer
                    // (vérifié frame par frame 2026-07-03).
                    .scrollDisabled(true)
                    .frame(width: 340)
                    // Frame de repos de la carte (mesurée overlay invisible,
                    // hors transformation) — point d'arrivée de l'émergence.
                    .background(
                        GeometryReader { geo in
                            Color.clear
                                .onAppear { capturePreviewRestFrameIfIdle(geo.frame(in: .global)) }
                                .adaptiveOnChange(of: geo.frame(in: .global)) { _, frame in
                                    capturePreviewRestFrameIfIdle(frame)
                                }
                        }
                    )
                    // Aperçu : émerge DEPUIS la ligne pressée (placement par
                    // `runContextMenuEmergence` : scale ≈ hauteur ligne /
                    // hauteur carte + offset vers la ligne) puis rejoint sa
                    // position finale — départ lent, accélération, rebond.
                    // Pendant le morph drag vers le bas, la carte rétrécit en
                    // chip (multiplicateur dragMorphProgress) et suit le doigt.
                    // Glisser vers le haut replie la carte (previewScale → 0,
                    // ancre .bottom : elle se résorbe vers le menu) pour donner
                    // toute la place au menu ; glisser vers le bas au-delà du
                    // seuil ferme l'overlay (parité contextMenu natif). Ce
                    // geste vit ICI et jamais sur les lignes de la liste : un
                    // DragGesture plein-ligne entrait en contention avec le pan
                    // du ScrollView et figeait le scroll (régression ff5d5649).
                    .scaleEffect(previewScale * (1 - 0.45 * dragMorphProgress), anchor: .bottom)
                    .offset(x: dragOffsetX, y: dragOffsetY + previewEmergeOffset)
                    .opacity(contextMenuAppeared ? 1 : 0)
                    // Blur PROGRESSIF lié au scale (continu, sans saut au
                    // franchissement d'un seuil) : net à 1.0, flouté au départ
                    // de l'émergence, jusqu'à 3.0 carte repliée — la carte se
                    // matérialise à l'ouverture et se dissout au repli/
                    // fermeture. max(0,…) : l'overshoot du rebond dépasse 1.0,
                    // le radius ne doit jamais être négatif.
                    .blur(radius: 3.0 * max(0, 1.0 - previewScale))
                    .gesture(previewCollapseGesture)

                    ConversationContextMenuView(
                        accentHex: conversation.accentColor,
                        isPinned: conversation.userState.isPinned,
                        isMuted: conversation.userState.isMuted,
                        hasUnread: conversation.userState.unreadCount > 0,
                        currentReaction: conversation.userState.reaction,
                        categories: conversationViewModel.userCategories.map {
                            ConversationMenuCategory(id: $0.id, name: $0.name, icon: $0.icon)
                        },
                        currentSectionId: conversation.userState.sectionId,
                        canInvite: canCreateShareLink(for: conversation),
                        isLocked: ConversationLockManager.shared.isLocked(conversation.id),
                        isArchived: conversation.userState.isArchived,
                        isBlockableDM: conversation.type == .direct && conversation.participantUserId != nil,
                        isBlocked: conversation.participantUserId.map { BlockService.shared.isBlocked(userId: $0) } ?? false,
                        canRename: conversation.type != .direct,
                        onPin: { Task { await conversationViewModel.togglePin(for: conversation.id) } },
                        onMute: { Task { await conversationViewModel.toggleMute(for: conversation.id) } },
                        onMarkReadToggle: {
                            Task {
                                if conversation.userState.unreadCount > 0 {
                                    await conversationViewModel.markAsRead(conversationId: conversation.id)
                                } else {
                                    await conversationViewModel.markAsUnread(conversationId: conversation.id)
                                }
                            }
                        },
                        onDetails: { conversationInfoConversation = conversation },
                        onRename: {
                            renameText = conversation.name
                            renameTarget = conversation
                        },
                        onSetFavorite: { emoji in
                            Task { await conversationViewModel.setFavoriteReaction(conversationId: conversation.id, emoji: emoji) }
                        },
                        onRemoveFavorite: {
                            Task { await conversationViewModel.setFavoriteReaction(conversationId: conversation.id, emoji: nil) }
                        },
                        onMove: { sectionId in
                            conversationViewModel.moveToSection(conversationId: conversation.id, sectionId: sectionId)
                        },
                        onInvite: { inviteSheetConversation = conversation },
                        onLock: {
                            if ConversationLockManager.shared.isLocked(conversation.id) {
                                lockSheetMode = .unlockConversation
                                lockSheetConversation = conversation
                            } else if ConversationLockManager.shared.masterPinConfigured {
                                lockSheetMode = .lockConversation
                                lockSheetConversation = conversation
                            } else {
                                showNoMasterPinAlert = true
                            }
                        },
                        onArchive: {
                            Task {
                                if conversation.userState.isArchived {
                                    await conversationViewModel.unarchiveConversation(conversationId: conversation.id)
                                } else {
                                    await conversationViewModel.archiveConversation(conversationId: conversation.id)
                                }
                            }
                        },
                        onBlock: {
                            if let uid = conversation.participantUserId, BlockService.shared.isBlocked(userId: uid) {
                                Task {
                                    await BlockActionCoordinator.shared.unblock(userId: uid)
                                    await MainActor.run { HapticFeedback.success() }
                                }
                            } else {
                                blockTargetConversation = conversation
                                showBlockConfirmation = true
                            }
                        },
                        onDelete: {
                            Task { await conversationViewModel.deleteConversation(conversationId: conversation.id) }
                        },
                        onDismiss: { dismissContextMenu() }
                    )
                    // Menu : slide-up 70 pt + fondu + dé-blur, dans la MÊME
                    // transaction que l'émergence de l'aperçu — le menu
                    // remonte pendant que la carte rejoint sa place
                    // (coordonné), et redescend en se dissolvant (blur) à la
                    // fermeture. Pendant le morph drag, il glisse vers le bas
                    // et se dissout (opacité + blur ∝ dragMorphProgress).
                    // L'ancienne formule `70 * (1 - previewScale)` valait 0
                    // au montage (previewScale démarrait à 1.0) : le slide-up
                    // était inerte.
                    .offset(y: contextMenuAppeared ? 40 * dragMorphProgress : 70)
                    .opacity(contextMenuAppeared ? Double(1 - dragMorphProgress) : 0)
                    .blur(radius: contextMenuAppeared ? 6 * dragMorphProgress : 6)
                }
                .padding(.horizontal, 20)
            }
            .zIndex(300)
            .onAppear {
                // Émergence depuis la ligne pressée : placement invisible sur
                // la ligne (tick 1, frame de repos mesurée) puis départ lent,
                // accélération et rebond vers la position finale (tick 2).
                dragOffsetY = 0
                dragOffsetX = 0
                runContextMenuEmergence()
            }
        }
    }

    /// Geste de repli / morph de l'aperçu (feature « shrink preview » de
    /// a98b93a7, rebranchée au bon étage).
    /// Vers le HAUT : repli progressif (100 pt = replié) qui donne toute la
    /// place au menu ; au lâcher sous 0.45 la carte reste repliée jusqu'à la
    /// fermeture (`dismissContextMenu` restaure 1.0).
    /// Vers le BAS : morph drag-n-drop — la carte suit le doigt 1:1 (x et y),
    /// rétrécit en chip, le blur du fond s'efface et le menu se dissout
    /// (`dragMorphProgress`). Au lâcher au-delà de 110 pt le menu se ferme
    /// (la chip fond sur place) ; en deçà, snap-back complet en 0.30 s.
    /// Drop de la chip sur une section (déplacement) : Phase 2 — le
    /// `SectionDropDelegate` dormant sera rebranché à ce geste.
    /// Les lignes de la liste ne portent AUCUN DragGesture : ici le
    /// ScrollView est masqué par l'overlay, zéro contention de scroll
    /// possible.
    private var previewCollapseGesture: some Gesture {
        DragGesture(coordinateSpace: .global)
            .onChanged { value in
                let translation = value.translation.height
                if chipModeLatched {
                    // Chip libre : suit le doigt sur les deux axes, y compris
                    // vers le haut pour viser un header de section.
                    dragOffsetY = translation
                    dragOffsetX = value.translation.width
                    updateChipDropTarget(at: value.location)
                    chipAutoScrollDriver.update(fingerLocation: value.location)
                } else if translation < 0 {
                    previewScale = max(0, 1.0 + translation / 100)
                    dragOffsetY = 0
                    dragOffsetX = 0
                } else {
                    dragOffsetY = translation
                    dragOffsetX = value.translation.width * dragMorphProgress
                    if dragMorphProgress >= 1 {
                        // Morph complet → verrouille le mode chip (drag n drop
                        // engagé tant que le doigt reste posé). L'auto-scroll
                        // de bord s'arme ici : stationner près d'un bord fait
                        // défiler la liste vers les headers hors écran.
                        chipModeLatched = true
                        HapticFeedback.light()
                        updateChipDropTarget(at: value.location)
                        chipAutoScrollDriver.onScrollTick = { location in
                            updateChipDropTarget(at: location)
                        }
                        chipAutoScrollDriver.update(fingerLocation: value.location)
                    }
                }
            }
            .onEnded { value in
                if chipModeLatched {
                    chipAutoScrollDriver.stop()
                    handleChipDrop(at: value.location)
                    return
                }
                if value.translation.height > 110 {
                    dismissContextMenu()
                    return
                }
                let collapsed = previewScale < 0.45
                // Faster, bouncier snap-back: (0.35, 0.8) → (0.30, 0.72)
                // Creates snappier feel when preview collapses or re-expands
                withAnimation(.spring(response: 0.30, dampingFraction: 0.72)) {
                    previewScale = collapsed ? 0 : 1.0
                    dragOffsetY = 0
                    dragOffsetX = 0
                }
            }
    }

    /// Surligne le header de section sous le doigt pendant le drag de la chip
    /// (réutilise l'affordance `isDropTarget` du `SectionDropDelegate`
    /// historique). "Épingles" est une cible LIVE uniquement si la
    /// conversation n'est pas déjà épinglée (drop = épingler ; le retrait
    /// reste l'action dédiée du menu). N'écrit l'état QUE sur changement —
    /// le registre est hit-testé à chaque tick mais la liste n'est invalidée
    /// qu'aux franchissements de frontière.
    private func updateChipDropTarget(at location: CGPoint) {
        let hovered = sectionFrameRegistry.frames
            .first(where: { $0.value.contains(location) })?
            .key
        let pinnedIsLive = contextMenuConversation?.userState.isPinned == false
        let target = (hovered == "pinned" && !pinnedIsLive) ? nil : hovered
        if dropTargetSection != target {
            withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
                dropTargetSection = target
            }
            if target != nil { HapticFeedback.light() }
        }
    }

    /// Relâchement de la chip : « Épingles » épingle la conversation (no-op
    /// si déjà épinglée), un header de section la déplace ("other" =
    /// « Mes conversations » = sectionId vide, ids de catégorie sinon),
    /// hors cible la chip fond sur place (annulation, parité drag n drop
    /// natif). Décision : `ChipDropResolver`.
    private func handleChipDrop(at location: CGPoint) {
        defer {
            withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
                dropTargetSection = nil
            }
            dismissContextMenu()
        }
        guard let conversation = contextMenuConversation else { return }
        let hovered = sectionFrameRegistry.frames
            .first(where: { $0.value.contains(location) })?
            .key
        switch ChipDropResolver.action(
            droppedOn: hovered,
            isPinned: conversation.userState.isPinned,
            currentSectionId: conversation.userState.sectionId ?? "",
            isAutoScrolling: chipAutoScrollDriver.isActivelyScrolling
        ) {
        case .none:
            return
        case .pin:
            HapticFeedback.success()
            Task { await conversationViewModel.togglePin(for: conversation.id) }
        case .move(let targetId):
            HapticFeedback.success()
            conversationViewModel.moveToSection(conversationId: conversation.id, sectionId: targetId)
        }
    }
}

// MARK: - Chip Drop Resolver

/// Décision du drop de la chip : « Épingles » épingle la conversation si
/// elle ne l'est pas déjà — jamais de dés-épinglage par drop, l'action
/// dédiée Pin/Unpin du menu reste le seul chemin de retrait ; une section
/// la déplace sauf no-op (même section) ; hors cible = annulation. Fonction
/// pure — testée dans `ConversationChipDropResolverTests`.
enum ChipDropAction: Equatable {
    case pin
    case move(sectionId: String)
    case none
}

enum ChipDropResolver {
    /// `isAutoScrolling` : un header qui DÉFILE sous le doigt stationnaire
    /// (auto-scroll de bord en mouvement à l'instant du relâchement) ne doit
    /// pas capter le drop — à 415-900 pt/s la cible attrapée est une loterie
    /// et le relâchement en plein défilement est une intention d'abandon
    /// (épinglage/déplacement accidentels vécus en test 2026-07-05). Au
    /// CLAMP (liste en butée, headers au repos), le flag retombe et les
    /// drops en zone de bord restent légitimes.
    static func action(
        droppedOn sectionId: String?,
        isPinned: Bool,
        currentSectionId: String,
        isAutoScrolling: Bool = false
    ) -> ChipDropAction {
        guard !isAutoScrolling else { return .none }
        guard let sectionId else { return .none }
        if sectionId == "pinned" { return isPinned ? .none : .pin }
        let targetId = sectionId == "other" ? "" : sectionId
        return targetId == currentSectionId ? .none : .move(sectionId: targetId)
    }
}

// MARK: - Chip Auto-Scroll (Phase 3 du morph drag-n-drop)

/// Loi de vitesse de l'auto-scroll pendant le drag de la chip : le doigt qui
/// stationne dans une zone de bord du viewport fait défiler la liste pour
/// rendre atteignables les headers de section hors écran. Rampe linéaire
/// (bord = pleine vitesse, sortie de zone = 0) et clamp de l'offset aux
/// bornes réelles du contenu. Fonctions pures — testées dans
/// `ConversationChipAutoScrollTests`.
enum ChipAutoScroll {
    /// Profondeur (pt) des zones de déclenchement en haut/bas du viewport.
    static let zoneHeight: CGFloat = 130
    /// Vitesse de défilement (pt/s) au bord même du viewport.
    static let maxSpeed: CGFloat = 900

    /// Vitesse signée pour une position de doigt donnée (coordonnées fenêtre) :
    /// négative = défile vers le haut (révèle les sections au-dessus),
    /// positive = vers le bas, 0 hors des zones de bord.
    static func speed(fingerY: CGFloat, viewportMinY: CGFloat, viewportMaxY: CGFloat) -> CGFloat {
        let topDepth = (viewportMinY + zoneHeight - fingerY) / zoneHeight
        if topDepth > 0 { return -min(1, topDepth) * maxSpeed }
        let bottomDepth = (fingerY - (viewportMaxY - zoneHeight)) / zoneHeight
        if bottomDepth > 0 { return min(1, bottomDepth) * maxSpeed }
        return 0
    }

    /// Offset proposé, ramené dans [-topInset, fin de contenu] — l'auto-scroll
    /// ne doit jamais produire d'overscroll (qui armerait visuellement le
    /// pull-to-refresh ou ferait rebondir la liste sous la chip).
    static func clampedOffset(
        _ proposed: CGFloat,
        contentHeight: CGFloat,
        viewportHeight: CGFloat,
        topInset: CGFloat,
        bottomInset: CGFloat
    ) -> CGFloat {
        let minOffset = -topInset
        let maxOffset = max(minOffset, contentHeight + bottomInset - viewportHeight)
        return min(max(proposed, minOffset), maxOffset)
    }
}

/// Pilote l'auto-scroll : boîte de référence VOLONTAIREMENT hors du graphe
/// SwiftUI (même famille que `SectionFrameRegistry`) — le tick écrit
/// `contentOffset` directement sur l'UIScrollView hôte, donc aucune
/// invalidation de la liste ; les GeometryReader des headers republient leurs
/// frames dans le registre inerte à chaque frame défilée, et `onScrollTick`
/// re-hit-teste la cible sous le doigt STATIONNAIRE (le DragGesture ne
/// re-fire pas sans mouvement du doigt).
@MainActor
final class ChipAutoScrollDriver {
    weak var scrollView: UIScrollView?
    /// Rebranché à chaque verrouillage de la chip, relâché par `stop()` (le
    /// closure capture la View : le garder à demeure lierait le cycle
    /// State-box → driver → closure → View → State-box).
    var onScrollTick: ((CGPoint) -> Void)?
    /// true tant que le dernier tick a RÉELLEMENT déplacé l'offset — lu par
    /// `handleChipDrop` pour rendre le drop inerte pendant le défilement
    /// (voir `ChipDropResolver.action(isAutoScrolling:)`). Retombe à false
    /// dès que la liste est en butée ou le doigt hors zone.
    private(set) var isActivelyScrolling = false

    private var timer: Timer?
    private var fingerLocation: CGPoint = .zero

    func update(fingerLocation location: CGPoint) {
        fingerLocation = location
        guard timer == nil else { return }
        let tick = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            // Timer main-runloop → déjà sur le main thread.
            MainActor.assumeIsolated { self?.tick() }
        }
        RunLoop.main.add(tick, forMode: .common)
        timer = tick
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        onScrollTick = nil
        isActivelyScrolling = false
    }

    private func tick() {
        guard let scrollView else { return }
        let viewport = scrollView.convert(scrollView.bounds, to: nil)
        let speed = ChipAutoScroll.speed(
            fingerY: fingerLocation.y,
            viewportMinY: viewport.minY,
            viewportMaxY: viewport.maxY
        )
        guard speed != 0 else {
            isActivelyScrolling = false
            return
        }
        let clamped = ChipAutoScroll.clampedOffset(
            scrollView.contentOffset.y + speed / 60.0,
            contentHeight: scrollView.contentSize.height,
            viewportHeight: scrollView.bounds.height,
            topInset: scrollView.adjustedContentInset.top,
            bottomInset: scrollView.adjustedContentInset.bottom
        )
        guard clamped != scrollView.contentOffset.y else {
            isActivelyScrolling = false
            return
        }
        isActivelyScrolling = true
        scrollView.contentOffset.y = clamped
        onScrollTick?(fingerLocation)
    }
}

/// UIView invisible plantée dans le contenu du scroll : remonte la hiérarchie
/// jusqu'à l'UIScrollView hôte et le confie au driver. Seul moyen sous
/// iOS 16 de piloter l'offset en continu — `ScrollViewReader.scrollTo` ne
/// sait pas défiler proportionnellement (et rate les ids non instanciés du
/// LazyVStack), `scrollPosition(y:)` est iOS 17+.
struct ChipAutoScrollGrabber: UIViewRepresentable {
    let driver: ChipAutoScrollDriver

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        // La chaîne de superviews n'est attachée qu'après le montage — hop
        // asynchrone pour marcher jusqu'au scroll hôte une fois en place.
        DispatchQueue.main.async { [weak driver] in
            var candidate: UIView? = uiView.superview
            while let current = candidate, !(current is UIScrollView) {
                candidate = current.superview
            }
            driver?.scrollView = candidate as? UIScrollView
        }
    }
}

// MARK: - Header Overlay
// Extracted into a dedicated View struct so the deeply-nested collapsible
// header no longer composes into ConversationListView.body's type. That
// monolithic type was the root cause of a Swift type-metadata instantiation
// crash at launch on low-memory devices (iPhone XR / iOS 17.6).
struct ConversationListHeaderOverlay: View {
    /// SEUL abonné au relay d'offset : chaque tick de scroll re-rend ce
    /// header (voulu — il collapse en suivant le doigt) et RIEN d'autre.
    /// L'ancien `let scrollOffset: CGFloat` forçait le parent à porter
    /// l'offset dans un @State et ré-exécutait tout son body (~99 rows
    /// reconstruites + diff Equatable) à ~120 Hz pendant le scroll.
    @ObservedObject var scrollRelay: ScrollOffsetRelay
    let iPadFeedAction: (() -> Void)?
    let iPadNotificationCount: Int
    let onNotificationsTap: (() -> Void)?
    let onSettingsTap: (() -> Void)?
    let onNewConversation: (() -> Void)?
    @Binding var showShareLinkSheet: Bool
    /// Compact story trail injected into the header's accessory slot (rendered
    /// below the title/actions bar, inside the same header surface). Receives
    /// the live scroll offset from this header's own render pass.
    var accessory: ((CGFloat) -> AnyView)? = nil

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        CollapsibleHeader(
            title: "Meeshy Chats",
            scrollOffset: scrollRelay.offset,
            showBackButton: false,
            titleColor: theme.textPrimary,
            backArrowColor: MeeshyColors.indigo500,
            backgroundColor: theme.backgroundPrimary,
            leading: {
                if let iPadFeedAction {
                    Button {
                        HapticFeedback.light()
                        iPadFeedAction()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "square.stack.fill")
                                .font(MeeshyFont.relative(13, weight: .semibold))
                                .accessibilityHidden(true)
                            Text(String(localized: "conversation.list.feed", defaultValue: "Feed", bundle: .main))
                                .font(MeeshyFont.relative(13, weight: .semibold))
                        }
                        .foregroundStyle(
                            LinearGradient(colors: [MeeshyColors.indigo500, MeeshyColors.indigo700], startPoint: .leading, endPoint: .trailing)
                        )
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(
                            Capsule()
                                .fill(MeeshyColors.indigo100.opacity(theme.mode.isDark ? 0.15 : 1))
                        )
                    }
                }
            },
            titleView: {
                Text("Meeshy Chats")
                    .font(MeeshyFont.relative(28, weight: .bold, design: .rounded))
                    .foregroundStyle(
                        LinearGradient(colors: [MeeshyColors.indigo500, MeeshyColors.indigo700], startPoint: .leading, endPoint: .trailing)
                    )
                    .accessibilityAddTraits(.isHeader)
            },
            trailing: {
                // Header action glyphs (link/plus/bell/gear + notification badge) keep
                // fixed point sizes: two sit inside 40x40 glass circles and the row reads
                // as chrome — scaling them with Dynamic Type would break the toolbar grid.
                HStack(spacing: 12) {
                    // iOS 26 Liquid Glass for the two primary actions (share link +
                    // new conversation), grouped so the glass circles blend. Gating/
                    // fallback owned by the SDK Compatibility wrappers.
                    AdaptiveGlassContainer(spacing: 10) {
                        HStack(spacing: 12) {
                            Button {
                                showShareLinkSheet = true
                            } label: {
                                Image(systemName: "link.badge.plus")
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundColor(MeeshyColors.indigo500)
                                    .frame(width: 40, height: 40)
                                    .adaptiveGlass(in: Circle(), interactive: true)
                            }
                            .accessibilityLabel(String(localized: "conversation.list.create_share_link", defaultValue: "Creer un lien de partage", bundle: .main))

                            Button {
                                onNewConversation?()
                            } label: {
                                Image(systemName: "plus")
                                    .font(.system(size: 18, weight: .bold))
                                    .foregroundColor(MeeshyColors.indigo500)
                                    .frame(width: 40, height: 40)
                                    .adaptiveGlass(in: Circle(), interactive: true)
                            }
                            .accessibilityLabel(String(localized: "conversation.list.new_conversation", defaultValue: "Nouvelle conversation", bundle: .main))
                        }
                    }

                    if let onNotificationsTap {
                        Button {
                            HapticFeedback.light()
                            onNotificationsTap()
                        } label: {
                            ZStack(alignment: .topTrailing) {
                                Image(systemName: "bell.fill")
                                    .font(.system(size: 18, weight: .semibold))
                                    .foregroundColor(MeeshyColors.indigo500)

                                if iPadNotificationCount > 0 {
                                    Text("\(min(iPadNotificationCount, 99))")
                                        .font(.system(size: 9, weight: .bold))
                                        .foregroundColor(.white)
                                        .frame(width: 16, height: 16)
                                        .background(Circle().fill(MeeshyColors.error))
                                        .offset(x: 6, y: -6)
                                }
                            }
                        }
                        .accessibilityLabel(String(localized: "conversation.list.notifications", defaultValue: "Notifications", bundle: .main))
                    }

                    if let onSettingsTap {
                        Button {
                            HapticFeedback.light()
                            onSettingsTap()
                        } label: {
                            Image(systemName: "gearshape.fill")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundColor(MeeshyColors.indigo500)
                        }
                        .accessibilityLabel(String(localized: "conversation.list.settings", defaultValue: "Reglages", bundle: .main))
                    }
                }
            },
            // Adapte la closure paramétrée à la slot sans-argument du
            // CollapsibleHeader : l'offset capturé ici est celui du render
            // courant du header (seul abonné au relay), donc toujours frais.
            accessory: accessory.map { build in
                let offset = scrollRelay.offset
                return { build(offset) }
            }
        )
    }
}

// MARK: - Bottom Bar Overlay
// Search bar + communities carousel + category filters. Extracted into its
// own View struct for the same type-complexity reason as the header. Owns
// its `searchBounce` animation state locally.
struct ConversationListBottomBar: View {
    @Binding var showSearchOverlay: Bool
    var isSearching: FocusState<Bool>.Binding
    @Binding var showWidgetPreview: Bool
    @Binding var showGlobalSearch: Bool
    let userCommunities: [MeeshyCommunity]

    @EnvironmentObject var conversationViewModel: ConversationListViewModel
    @EnvironmentObject var router: Router

    @State private var searchBounce = false

    private var theme: ThemeManager { ThemeManager.shared }
    private var isActive: Bool { isSearching.wrappedValue || showSearchOverlay }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Communities carousel + category filters — shown together inside
            // a glass panel when the search overlay is open (loupe tap). The
            // `.ultraThinMaterial` fill adapts to dark/light automatically and
            // keeps the conversation list behind it legible; the theme-aware
            // `inputBorder` stroke defines the panel edge in both modes.
            if showSearchOverlay {
                VStack(spacing: 0) {
                    communitiesSection
                        .padding(.vertical, 10)
                    categoryFilters
                }
                .padding(.top, 6)
                .padding(.bottom, 4)
                .background(
                    RoundedRectangle(cornerRadius: 24)
                        .fill(.ultraThinMaterial)
                        .overlay(
                            RoundedRectangle(cornerRadius: 24)
                                .stroke(theme.inputBorder, lineWidth: 1)
                        )
                        .shadow(color: Color.black.opacity(0.12), radius: 14, y: 6)
                )
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }

            // Search bar - always visible (unless scrolled away)
            themedSearchBar
        }
    }

    // MARK: - Communities Section
    private var communitiesSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(String(localized: "communities.title", defaultValue: "Communaut\u{00e9}s"))
                    .font(MeeshyFont.relative(16, weight: .bold))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.error, MeeshyColors.indigo300],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .accessibilityAddTraits(.isHeader)
                Spacer()

                HStack(spacing: 12) {
                    Button {
                        router.push(.communityList)
                    } label: {
                        Text(String(localized: "action.see_all", defaultValue: "Voir tout"))
                            .font(MeeshyFont.relative(12, weight: .semibold))
                            .foregroundColor(MeeshyColors.indigo300)
                    }
                    .accessibilityLabel(String(localized: "accessibility.see_all_communities", defaultValue: "Voir toutes les communautes"))

                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showSearchOverlay = false
                        }
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(MeeshyFont.relative(18))
                            .foregroundStyle(
                                LinearGradient(
                                    colors: [MeeshyColors.error, MeeshyColors.error.opacity(0.7)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                    }
                    .accessibilityLabel(String(localized: "accessibility.close_communities", defaultValue: "Fermer les communautes"))
                }
            }
            .padding(.horizontal, 16)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(userCommunities, id: \.id) { community in
                        ThemedCommunityCard(community: community) {
                            HapticFeedback.light()
                            router.push(.communityDetail(community.id))
                        }
                        .equatable()
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // MARK: - Category Filters
    private var categoryFilters: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(ConversationFilter.allCases) { filter in
                    ThemedFilterChip(
                        title: filter.rawValue,
                        color: filter.color,
                        isSelected: conversationViewModel.selectedFilter == filter
                    ) {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            conversationViewModel.selectedFilter = filter
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    // MARK: - Themed Search Bar
    private var themedSearchBar: some View {
        HStack(spacing: 12) {
            // Magnifying glass: tappable to toggle search overlay (communities + filters)
            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showSearchOverlay.toggle()
                    if showSearchOverlay {
                        isSearching.wrappedValue = true
                    }
                }
            } label: {
                Image(systemName: "magnifyingglass")
                    .font(MeeshyFont.relative(16, weight: .medium))
                    .foregroundStyle(
                        isActive ?
                        AnyShapeStyle(LinearGradient(colors: [MeeshyColors.error, MeeshyColors.indigo300], startPoint: .leading, endPoint: .trailing)) :
                        AnyShapeStyle(theme.textMuted)
                    )
                    .scaleEffect(isActive ? 1.15 : 1.0)
                    .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isActive)
            }
            .accessibilityLabel(String(localized: "accessibility.search", defaultValue: "Rechercher"))
            .accessibilityHint(String(localized: "accessibility.search.hint", defaultValue: "Ouvre les filtres et la recherche de conversations"))

            TextField(String(localized: "search.placeholder", defaultValue: "Rechercher..."), text: $conversationViewModel.searchText)
                .focused(isSearching)
                .foregroundColor(theme.textPrimary)
                .font(MeeshyFont.relative(15))
                .accessibilityLabel(String(localized: "conversation.list.search_conversations", defaultValue: "Rechercher des conversations", bundle: .main))

            if !conversationViewModel.searchText.isEmpty {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { conversationViewModel.searchText = "" }
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(MeeshyColors.error)
                        .scaleEffect(1.0)
                }
                .accessibilityLabel(String(localized: "accessibility.clear_search", defaultValue: "Effacer la recherche"))
                .transition(.scale.combined(with: .opacity))
            }

            // Dashboard / widget button
            Button {
                HapticFeedback.medium()
                showWidgetPreview = true
            } label: {
                Image(systemName: "square.grid.2x2")
                    .font(MeeshyFont.relative(16, weight: .medium))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.warning, MeeshyColors.indigo500],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }
            .accessibilityLabel(String(localized: "accessibility.dashboard", defaultValue: "Tableau de bord"))
            .accessibilityHint(String(localized: "accessibility.dashboard.hint", defaultValue: "Ouvre le tableau de bord avec les widgets"))

            // Global search button
            Button {
                HapticFeedback.medium()
                showGlobalSearch = true
            } label: {
                Image(systemName: "text.magnifyingglass")
                    .font(MeeshyFont.relative(16, weight: .medium))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.indigo600, MeeshyColors.indigo300],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }
            .accessibilityLabel(String(localized: "accessibility.global_search", defaultValue: "Recherche globale"))
            .accessibilityHint(String(localized: "accessibility.global_search.hint", defaultValue: "Rechercher dans tous les messages, conversations et utilisateurs"))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(
                            isActive ?
                            AnyShapeStyle(LinearGradient(colors: [MeeshyColors.error, MeeshyColors.indigo300], startPoint: .leading, endPoint: .trailing)) :
                            AnyShapeStyle(theme.inputBorder),
                            lineWidth: isActive ? 2 : 1
                        )
                )
                .shadow(color: isActive ? MeeshyColors.indigo300.opacity(0.25) : .clear, radius: 12, y: 5)
        )
        .scaleEffect(searchBounce ? 1.02 : 1.0)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: conversationViewModel.searchText.isEmpty)
        .adaptiveOnChange(of: isSearching.wrappedValue) { _, newValue in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                searchBounce = newValue
            }
            if newValue && !showSearchOverlay {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showSearchOverlay = true
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
    }
}
