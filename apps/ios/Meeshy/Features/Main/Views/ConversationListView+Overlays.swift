import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from ConversationListView.swift

extension ConversationListView {

    // MARK: - Menu d'appui long — deux chemins par version d'OS
    //
    // iOS 26+ : menu contextuel NATIF `.contextMenu(menuItems:preview:)`
    // (rendu Liquid Glass système) — builder ci-dessous, attaché par
    // `ConversationRowItem`. < iOS 26 : overlay custom
    // (`ConversationContextMenuView`, déclenché par `RowPressBounceModifier`
    // → `onLongPress`). Les DEUX chemins doivent rester en parité d'actions ;
    // la suppression arme toujours `sheetTargets.deleteTarget` (confirmation
    // système — invariants `ConversationMenuSystemDesignGuardTests`).

    // MARK: - Native Context Menu (iOS 26 Liquid Glass)

    /// Box stable pour `ConversationRowItem.nativeContextMenu` : le menu est
    /// construit UNE fois par évaluation de `conversationRow` (pas à chaque
    /// body pass de la row) et seulement quand l'OS rend le menu natif.
    func nativeContextMenuView(for conversation: Conversation) -> AnyView {
        guard #available(iOS 26.0, *) else { return AnyView(EmptyView()) }
        return AnyView(conversationContextMenu(for: conversation))
    }

    @ViewBuilder
    func conversationContextMenu(for conversation: Conversation) -> some View {
        // Sa propre fenêtre (iPad) : écrire à cette personne ou à ce groupe pendant qu'une autre conversation
        // reste ouverte dans la fenêtre principale.
        if DetachedWindowOpener.shared.isAvailable {
            Button {
                HapticFeedback.light()
                DetachedWindowOpener.shared.open(.conversation(id: conversation.id))
            } label: {
                Label(
                    String(localized: "window.detach.conversation", defaultValue: "Ouvrir dans une nouvelle fenêtre", bundle: .main),
                    systemImage: "macwindow.badge.plus"
                )
            }
        }

        // Pin/Unpin
        Button {
            HapticFeedback.medium()
            Task { await conversationViewModel.togglePin(for: conversation.id) }
        } label: {
            Label(
                conversation.userState.isPinned
                    ? String(localized: "context.unpin", defaultValue: "Désépingler", bundle: .main)
                    : String(localized: "context.pin", defaultValue: "Épingler", bundle: .main),
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
                    ? String(localized: "context.unmute", defaultValue: "Réactiver les notifications", bundle: .main)
                    : String(localized: "context.mute", defaultValue: "Mettre en silence", bundle: .main),
                systemImage: conversation.userState.isMuted ? "bell.fill" : "bell.slash.fill"
            )
        }

        // Rechercher dans la conversation — MÊME chemin que le bouton
        // « Rechercher » de l'aperçu du fallback custom (`onSearch`, SSOT) :
        // arme `pendingOpenSearch` puis ouvre la conversation, qui consomme le
        // flag et présente la recherche. Sur iOS 26+ l'aperçu natif est statique
        // (non cliquable) — l'action vit donc dans le menu (décision 2026-07-14).
        Button {
            HapticFeedback.light()
            router.pendingOpenSearch = true
            onSelect(conversation)
        } label: {
            Label(
                String(localized: "context.search", defaultValue: "Rechercher", bundle: .main),
                systemImage: "magnifyingglass"
            )
        }

        // Appeler — DM uniquement (participant résolu). MÊME chemin que le
        // bouton « Appeler » de l'aperçu custom (`onCall` → CallManager, audio).
        if conversation.type == .direct, let calleeId = conversation.participantUserId {
            Button {
                HapticFeedback.medium()
                Task {
                    await CallManager.shared.requestPermissionsThenStartCall(
                        conversationId: conversation.id,
                        userId: calleeId,
                        displayName: conversation.name,
                        isVideo: false
                    )
                }
            } label: {
                Label(
                    String(localized: "context.call", defaultValue: "Appeler", bundle: .main),
                    systemImage: "phone.fill"
                )
            }
        }

        Divider()

        // Marquer lu / non lu
        if conversation.userState.unreadCount > 0 {
            Button {
                HapticFeedback.light()
                Task { await conversationViewModel.markAsRead(conversationId: conversation.id) }
            } label: {
                Label(
                    String(localized: "context.mark_read", defaultValue: "Marquer comme lu", bundle: .main),
                    systemImage: "envelope.open.fill"
                )
            }
        } else {
            Button {
                HapticFeedback.light()
                Task { await conversationViewModel.markAsUnread(conversationId: conversation.id) }
            } label: {
                Label(
                    String(localized: "context.mark_unread", defaultValue: "Marquer comme non lu", bundle: .main),
                    systemImage: "envelope.badge.fill"
                )
            }
        }

        // Mode de lecture (contrat LWS-8/I-072) — sous-menu APRÈS « Marquer
        // lu », l'une des DEUX portes d'UNE préférence (encoche de la focus
        // card I-071, ce sous-menu — l'aperçu-menu `LentillePeekView` a été
        // supprimé le 2026-08-21 : l'aperçu montre les derniers messages).
        // Drapeau OFF ⇒ rien de plus ici : bit-à-bit identique au menu
        // d'aujourd'hui, comme partout ailleurs dans la Lentille. Modes de
        // lecture coupés (#6482) ⇒ pas de sous-menu non plus : un mode choisi
        // ici serait ignoré à l'ouverture, qui rend Script.
        if LentilleFeatureFlag.isLentilleListEnabled, LentilleFeatureFlag.isReadingModesEnabled {
            LentilleReadingModeSubmenu(
                conversation: conversation,
                isAnonymous: ConversationListReaderAnonymity.isAnonymous(currentUser: AuthManager.shared.currentUser)
            )
        }

        // Détails
        Button {
            HapticFeedback.light()
            sheetTargets.info = conversation
        } label: {
            Label(
                String(localized: "context.details", defaultValue: "Détails", bundle: .main),
                systemImage: "info.circle.fill"
            )
        }

        // Renommer — groupes/communautés uniquement (parité menu custom)
        if conversation.type != .direct {
            Button {
                HapticFeedback.light()
                renameText = conversation.name
                sheetTargets.rename = conversation
            } label: {
                Label(
                    String(localized: "context.rename", defaultValue: "Renommer", bundle: .main),
                    systemImage: "pencil"
                )
            }
        }

        // Favori (emoji)
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
                    Label(
                        String(localized: "context.remove_favorite", defaultValue: "Retirer le favori", bundle: .main),
                        systemImage: "star.slash"
                    )
                }
            }
        } label: {
            Label(
                String(localized: "context.favorite", defaultValue: "Favori", bundle: .main),
                systemImage: conversation.userState.reaction != nil ? "star.fill" : "star"
            )
        }

        // Déplacer vers une catégorie — catalogue PARTAGÉ avec l'encoche de
        // la carte de focus (voir `ConversationMoveToSectionMenuItems`).
        Menu {
            ConversationMoveToSectionMenuItems(
                categories: conversationViewModel.userCategories,
                currentSectionId: conversation.userState.sectionId,
                onMove: { sectionId in
                    HapticFeedback.light()
                    conversationViewModel.moveToSection(conversationId: conversation.id, sectionId: sectionId)
                }
            )
        } label: {
            Label(
                String(localized: "context.move_to", defaultValue: "Déplacer vers...", bundle: .main),
                systemImage: "folder.fill"
            )
        }

        Divider()

        // Actions secondaires — groupées pour garder ≤8 items top-level
        // (au-delà, iOS bascule sur le style liste où les icônes disparaissent).
        Menu {
            if canCreateShareLink(for: conversation) {
                Button {
                    HapticFeedback.medium()
                    sheetTargets.inviteSheet = conversation
                } label: {
                    Label(
                        String(localized: "context.invite_friends", defaultValue: "Inviter mes amis", bundle: .main),
                        systemImage: "person.badge.plus"
                    )
                }
            }

            // Verrouiller / Déverrouiller
            let isLockedCtx = ConversationLockManager.shared.isLocked(conversation.id)
            Button {
                HapticFeedback.medium()
                if isLockedCtx {
                    lockSheetMode = .unlockConversation
                    sheetTargets.lockSheet = conversation
                } else if ConversationLockManager.shared.masterPinConfigured {
                    lockSheetMode = .lockConversation
                    sheetTargets.lockSheet = conversation
                } else {
                    showNoMasterPinAlert = true
                }
            } label: {
                Label(
                    isLockedCtx
                        ? String(localized: "context.unlock", defaultValue: "Déverrouiller", bundle: .main)
                        : String(localized: "context.lock", defaultValue: "Verrouiller", bundle: .main),
                    systemImage: isLockedCtx ? "lock.open.fill" : "lock.fill"
                )
            }

            // Archiver / Désarchiver — état PAR UTILISATEUR (userState), jamais `isActive`.
            // Global d'un mineur reste aux archives : aucune bascule (#9929).
            let isArchivedConv = conversation.userState.isArchived
            if !conversation.isArchiveImposed { Button {
                HapticFeedback.medium()
                if isArchivedConv {
                    Task { await conversationViewModel.unarchiveConversation(conversationId: conversation.id) }
                } else {
                    Task { await conversationViewModel.archiveConversation(conversationId: conversation.id) }
                }
            } label: {
                Label(
                    isArchivedConv
                        ? String(localized: "context.unarchive", defaultValue: "Désarchiver", bundle: .main)
                        : String(localized: "context.archive", defaultValue: "Archiver", bundle: .main),
                    systemImage: isArchivedConv ? "tray.and.arrow.up.fill" : "archivebox.fill"
                )
            } }

            // RETRAIT FOCAL iOS (2026-08-18) : l'item « Focal (bêta) »
            // (I-075), qui forçait Focal pour une seule ouverture, est retiré
            // avec le mode — Script est le mode nominal.

            // Bloquer / Débloquer (DM uniquement)
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
                            String(localized: "context.unblock", defaultValue: "Débloquer", bundle: .main),
                            systemImage: "hand.raised.slash.fill"
                        )
                    }
                } else {
                    Button(role: .destructive) {
                        HapticFeedback.heavy()
                        sheetTargets.blockTarget = conversation
                        showBlockConfirmation = true
                    } label: {
                        Label(
                            String(localized: "context.block", defaultValue: "Bloquer", bundle: .main),
                            systemImage: "hand.raised.fill"
                        )
                    }
                }
            }
        } label: {
            Label(
                String(localized: "context.more_options", defaultValue: "Plus d'options", bundle: .main),
                systemImage: "ellipsis.circle.fill"
            )
        }

        Divider()

        // Supprimer — arme la confirmation système (jamais de delete direct).
        Button(role: .destructive) {
            HapticFeedback.heavy()
            sheetTargets.deleteTarget = conversation
        } label: {
            Label(
                String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main),
                systemImage: "trash"
            )
        }
    }

    // MARK: - Custom Context Menu Overlay (fallback < iOS 26)

    func dismissContextMenu() {
        // Zoom-out : anime la sortie (aperçu rétrécit, menu redescend) puis
        // retire réellement l'overlay après la durée du spring. Purge annulable :
        // si l'utilisateur rouvre un menu avant la fin du zoom-out, `onLongPress`
        // annule ce work item, sinon il effacerait le menu fraîchement rouvert.
        chipAutoScrollDriver.stop()
        contextMenuDismissSettle.cancel()
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
        contextMenuDismissSettle.arm(after: 0.26) {
            sheetTargets.contextMenu = nil
            previewScale = 1.0
            previewEmergeOffset = 0
            dragOffsetY = 0
            dragOffsetX = 0
            chipModeLatched = false
            contextMenuSourceFrame = nil
        }
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
        if let conversation = sheetTargets.contextMenu {
            ZStack {
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .ignoresSafeArea()
                    .overlay(Color.black.opacity(MeeshyOpacity.light).ignoresSafeArea())
                    .contentShape(Rectangle())
                    .onTapGesture { dismissContextMenu() }
                    // Le blur du fond s'EFFACE pendant le morph drag : la
                    // liste réapparaît sous la carte devenue chip draggable.
                    .opacity(contextMenuAppeared ? Double(1 - dragMorphProgress) : 0)

                VStack(spacing: MeeshySpacing.lg) {
                    // Aperçu d'appui long = la carte des DERNIERS MESSAGES
                    // (bannière, avatar/logo, titre, icônes d'en-tête, fil
                    // récent) — drapeau Lentille ON comme OFF (décision user
                    // 2026-08-21 : le menu des modes n'a rien à faire dans
                    // l'aperçu ; le choix de mode garde ses deux portes,
                    // l'encoche de la carte de focus et le sous-menu « Mode
                    // de lecture », monté plus haut dans ce fichier).
                    ConversationPreviewView(
                        conversation: conversation,
                        previewLoader: conversationViewModel.previewLoader,
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
                                Task {
                                    await CallManager.shared.requestPermissionsThenStartCall(
                                        conversationId: conversation.id,
                                        userId: uid,
                                        displayName: conversation.name,
                                        isVideo: false
                                    )
                                }
                            }
                        } : nil,
                        onSearch: {
                            dismissContextMenu()
                            router.pendingOpenSearch = true
                            onSelect(conversation)
                        },
                        onInfo: { dismissContextMenu(); sheetTargets.info = conversation },
                        onProfileInfo: { dismissContextMenu(); handleProfileView(conversation) }
                    )
                    // Preview STATIQUE (parité `.contextMenu` natif) : le
                    // ScrollView interne des messages interceptait le pan et
                    // volait le drag du geste de repli/morph ci-dessous — le
                    // contenu défilait dans la carte au lieu de la déplacer
                    // (vérifié frame par frame 2026-07-03).
                    .scrollDisabled(true)
                    // 340 pt au plus, et jamais plus large que la colonne (volet
                    // gauche iPad étroit) : la carte débordait de ses bords.
                    .frame(maxWidth: .infinity).frame(maxWidth: ConversationPreviewWidthLaw.maximum).padding(.horizontal, MeeshySpacing.md)
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
                        isArchived: conversation.userState.isArchived, canToggleArchive: !conversation.isArchiveImposed,
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
                        onDetails: { sheetTargets.info = conversation },
                        onRename: {
                            renameText = conversation.name
                            sheetTargets.rename = conversation
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
                        onInvite: { sheetTargets.inviteSheet = conversation },
                        onLock: {
                            if ConversationLockManager.shared.isLocked(conversation.id) {
                                lockSheetMode = .unlockConversation
                                sheetTargets.lockSheet = conversation
                            } else if ConversationLockManager.shared.masterPinConfigured {
                                lockSheetMode = .lockConversation
                                sheetTargets.lockSheet = conversation
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
                                sheetTargets.blockTarget = conversation
                                showBlockConfirmation = true
                            }
                        },
                        onDelete: {
                            // Destructif → confirmation système obligatoire
                            // (dialog attaché dans ConversationListView.body).
                            sheetTargets.deleteTarget = conversation
                        },
                        onOpenFocalBetaPreview: {
                            // RETRAIT FOCAL iOS (2026-08-18) : l'item n'est
                            // plus monté par ConversationContextMenuView —
                            // closure conservée pour l'API, inerte.
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
                .padding(.horizontal, MeeshySpacing.xl)
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
        let pinnedIsLive = sheetTargets.contextMenu?.userState.isPinned == false
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
        guard let conversation = sheetTargets.contextMenu else { return }
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
