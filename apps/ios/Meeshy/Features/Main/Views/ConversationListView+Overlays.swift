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
    // → `onLongPress`). Les DEUX chemins parcourent le MÊME catalogue
    // (`rowMenuCatalog(for:)`, #11230) et appellent les MÊMES gestes ; la
    // suppression arme toujours `sheetTargets.deleteTarget` (confirmation
    // système — invariants `ConversationMenuSystemDesignGuardTests`).

    // MARK: - Le catalogue de la rangée (#11230)

    /// Ce que le menu de CETTE rangée offre, dans quel ordre et sous quel mot :
    /// les verdicts de la loi partagée (`rowMenuCapabilities`, #11215) et
    /// l'état de la rangée, lus UNE fois pour les deux chemins d'OS.
    func rowMenuCatalog(for conversation: Conversation) -> ConversationMenuCatalog {
        ConversationMenuCatalog.make(ConversationMenuCatalog.Input(
            capabilities: rowMenuCapabilities(for: conversation),
            isPinned: conversation.userState.isPinned,
            isMuted: conversation.userState.isMuted,
            hasUnread: conversation.userState.unreadCount > 0,
            isLocked: ConversationLockManager.shared.isLocked(conversation.id),
            isArchived: conversation.userState.isArchived,
            // Global d'un mineur reste aux archives : aucune bascule (#9929).
            canToggleArchive: !conversation.isArchiveImposed,
            isPeerBlocked: conversation.type == .direct
                ? conversation.participantUserId.map { BlockService.shared.isBlocked(userId: $0) }
                : nil,
            windowsAvailable: DetachedWindowOpener.shared.isAvailable,
            // Drapeau OFF ou modes de lecture coupés (#6482) ⇒ pas de
            // sous-menu : un mode choisi ici serait ignoré à l'ouverture.
            offersReadingModes: LentilleFeatureFlag.isLentilleListEnabled && LentilleFeatureFlag.isReadingModesEnabled
        ))
    }

    /// Le sous-menu « Mode de lecture » (LWS-8/I-072), l'une des DEUX portes d'UNE
    /// préférence avec l'encoche I-071 ; `onSelected` ferme le menu custom.
    func readingModeSubmenu(for conversation: Conversation, onSelected: @escaping () -> Void = {}) -> LentilleReadingModeSubmenu {
        LentilleReadingModeSubmenu(
            conversation: conversation,
            isAnonymous: ConversationListReaderAnonymity.isAnonymous(currentUser: AuthManager.shared.currentUser),
            onSelected: onSelected
        )
    }

    /// « Paramètres du groupe » : les réglages de la conversation, derrière la
    /// même porte que la fiche — une conversation verrouillée passe le PIN.
    func presentSettings(of conversation: Conversation) {
        guard ConversationOpenRoute.mayShowInfo(conversation.id) else {
            return openConversation(conversation)
        }
        sheetTargets.settings = conversation
    }

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
        let catalog = rowMenuCatalog(for: conversation)
        let actions = ConversationRowMenuActions.make(for: conversation, in: self)

        // LA séquence de groupes que le menu custom parcourt aussi.
        ForEach(catalog.groups) { group in
            if group.section.opensWithDivider { Divider() }
            nativeGroup(group, of: conversation, actions: actions)
        }
    }

    /// Une section du catalogue en menu natif : la tête en `ControlGroup` (rangée
    /// compacte dès iOS 26, seul OS de ce chemin), « Plus d'options » en sous-menu.
    @ViewBuilder
    private func nativeGroup(_ group: ConversationMenuGroup, of conversation: Conversation, actions: ConversationRowMenuActions) -> some View {
        switch group.section {
        case .header:
            ControlGroup {
                nativeMenuItems(group.entries, of: conversation, actions: actions)
            }
        case .more:
            Menu {
                nativeMenuItems(group.entries, of: conversation, actions: actions)
            } label: {
                Label(ConversationMenuCatalog.moreLabel, systemImage: ConversationMenuCatalog.moreSymbol)
            }
        case .reach, .organize, .departure:
            // Le départ arme une confirmation, jamais l'effet.
            nativeMenuItems(group.entries, of: conversation, actions: actions)
        }
    }

    @ViewBuilder
    private func nativeMenuItems(
        _ entries: [ConversationMenuEntry],
        of conversation: Conversation,
        actions: ConversationRowMenuActions
    ) -> some View {
        ForEach(entries, id: \.self) { entry in
            nativeMenuItem(entry, of: conversation, actions: actions)
        }
    }

    /// Une entrée du catalogue en menu natif : les sous-menus portent leur
    /// liste, les autres entrées agissent par `actions.perform(_:)`.
    @ViewBuilder
    private func nativeMenuItem(
        _ entry: ConversationMenuEntry,
        of conversation: Conversation,
        actions: ConversationRowMenuActions
    ) -> some View {
        switch entry {
        case .readingMode:
            readingModeSubmenu(for: conversation)
        case .favorite:
            Menu {
                nativeFavoriteItems(of: conversation, actions: actions)
            } label: {
                Label(entry.label, systemImage: entry.displayedSymbol(hasFavorite: conversation.userState.reaction != nil))
            }
        case .move:
            // Catalogue PARTAGÉ avec l'encoche de la carte de focus
            // (voir `ConversationMoveToSectionMenuItems`).
            Menu {
                ConversationMoveToSectionMenuItems(
                    categories: conversationViewModel.userCategories,
                    currentSectionId: conversation.userState.sectionId,
                    onMove: { sectionId in
                        HapticFeedback.light()
                        actions.onMove(sectionId)
                    }
                )
            } label: {
                Label(entry.label, systemImage: entry.symbol)
            }
        default:
            Button(role: entry.isDestructive ? .destructive : nil) {
                ConversationRowMenuActions.feel(entry)
                actions.perform(entry)
            } label: {
                Label(entry.label, systemImage: entry.symbol)
            }
        }
    }

    /// Le sous-menu « Favori » : huit emojis, puis le retrait du favori posé.
    @ViewBuilder
    private func nativeFavoriteItems(of conversation: Conversation, actions: ConversationRowMenuActions) -> some View {
        ForEach(["⭐️", "❤️", "🔥", "💎", "🎯", "✨", "🏆", "💡"], id: \.self) { emoji in
            Button {
                HapticFeedback.light()
                actions.onSetFavorite(emoji)
            } label: {
                Text(emoji)
            }
        }
        if conversation.userState.reaction != nil {
            Divider()
            Button(role: .destructive) {
                HapticFeedback.light()
                actions.onRemoveFavorite()
            } label: {
                Label(
                    String(localized: "context.remove_favorite", defaultValue: "Retirer le favori", bundle: .main),
                    systemImage: "star.slash"
                )
            }
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
        let reduceMotion = ConversationPreviewEntranceMotion.isReducedNow
        withAnimation(ConversationPreviewEntranceMotion.exit(reduceMotion: reduceMotion)) {
            previewScale = reduceMotion ? previewScale : min(previewScale, 0.7)
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

    /// Émergence de l'aperçu depuis la ligne pressée — tick 1 : la carte se
    /// pose, invisible, d'où elle part ; tick 2 : elle rejoint sa place, menu
    /// et flou du fond dans la même transaction (`ConversationPreviewEntranceMotion`).
    func runContextMenuEmergence(reduceMotion: Bool = ConversationPreviewEntranceMotion.isReducedNow) {
        DispatchQueue.main.async {
            var placement = Transaction()
            placement.disablesAnimations = true
            withTransaction(placement) {
                let start = ConversationPreviewEntranceMotion.placement(
                    source: contextMenuSourceFrame, rest: previewRestFrame, reduceMotion: reduceMotion
                )
                previewScale = start.scale
                previewEmergeOffset = start.offset
            }
            DispatchQueue.main.async {
                withAnimation(ConversationPreviewEntranceMotion.entrance(reduceMotion: reduceMotion)) {
                    contextMenuAppeared = true
                    previewScale = 1.0
                    previewEmergeOffset = 0
                }
            }
        }
    }

    /// L'appel de l'en-tête de l'aperçu : le verdict ET le chemin de l'entrée
    /// « Appeler » (ni soi-même, ni conversation terminée, ni invité).
    func previewCallAction(for conversation: Conversation) -> (() -> Void)? {
        guard rowMenuCatalog(for: conversation).reach.contains(.call) else { return nil }
        return {
            dismissContextMenu()
            ConversationRowMenuActions.startCall(to: conversation, isVideo: false)
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
            ConversationPreviewMotionReader { reduceMotion in
                ZStack {
                    // Le voile commun de l'appui long (#11222) : il s'EFFACE
                    // pendant le morph drag, la liste réapparaît sous la carte
                    // devenue chip draggable.
                    LongPressVeil(visibility: contextMenuAppeared ? Double(1 - dragMorphProgress) : 0,
                                  onDismiss: { dismissContextMenu() })

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
                            readingMode: LentilleReadingModeContext.listPreviewMode(for: conversation),
                            onCall: previewCallAction(for: conversation),
                            onSearch: { dismissContextMenu(); openConversation(conversation, searching: true) },
                            onInfo: { dismissContextMenu(); presentInfo(of: conversation) },
                            onProfileInfo: { dismissContextMenu(); handleProfileView(conversation) }
                        )
                        // Preview STATIQUE (parité `.contextMenu` natif) : le
                        // ScrollView interne des messages interceptait le pan et
                        // volait le drag du geste de repli/morph ci-dessous — le
                        // contenu défilait dans la carte au lieu de la déplacer
                        // (vérifié frame par frame 2026-07-03).
                        .scrollDisabled(true)
                        // Toucher la carte ouvre la conversation, par la porte du verrou.
                        .contentShape(Rectangle())
                        .onTapGesture {
                            dismissContextMenu()
                            openConversation(conversation)
                        }
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
                        .blur(radius: ConversationPreviewEntranceMotion.blurRadius(previewScale: previewScale, reduceMotion: reduceMotion))
                        .gesture(previewCollapseGesture)

                        ConversationContextMenuView(
                            accentHex: conversation.accentColor,
                            catalog: rowMenuCatalog(for: conversation),
                            currentReaction: conversation.userState.reaction,
                            categories: conversationViewModel.userCategories.map {
                                ConversationMenuCategory(id: $0.id, name: $0.name, icon: $0.icon)
                            },
                            currentSectionId: conversation.userState.sectionId,
                            actions: ConversationRowMenuActions.make(for: conversation, in: self),
                            readingModeMenu: readingModeSubmenu(for: conversation, onSelected: { dismissContextMenu() }),
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
                        .offset(y: contextMenuAppeared ? 40 * dragMorphProgress : ConversationPreviewEntranceMotion.menuRestOffset(reduceMotion: reduceMotion))
                        .opacity(contextMenuAppeared ? Double(1 - dragMorphProgress) : 0)
                        .blur(radius: contextMenuAppeared ? 6 * dragMorphProgress : ConversationPreviewEntranceMotion.menuRestBlur(reduceMotion: reduceMotion))
                    }
                    .padding(.horizontal, MeeshySpacing.xl)
                }
                .onAppear {
                    // Émergence depuis la ligne pressée : placement invisible sur
                    // la ligne (tick 1, frame de repos mesurée) puis départ lent,
                    // accélération et rebond vers la position finale (tick 2).
                    dragOffsetY = 0
                    dragOffsetX = 0
                    runContextMenuEmergence(reduceMotion: reduceMotion)
                }
            }
            .zIndex(300)
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

// MARK: - L'entrée de l'aperçu sous Réduire les animations (#11213)

/// Le mouvement de l'aperçu < iOS 26 : la carte ÉMERGE de la ligne pressée —
/// départ lent, accélération à mi-course, rebond (overshoot 1.3, le rebond
/// appartient au long-press, pas au swipe des lignes — feedback 2026-07-03) et
/// flou progressif. Sous Réduire les animations, un FONDU sur place, sans
/// overshoot ni flou. Les deux moitiés du réglage (système et app) se lisent
/// par `MeeshyMotion.shouldReduce`.
enum ConversationPreviewEntranceMotion {
    static let fadeDuration: Double = 0.18

    /// Lecture ponctuelle, hors d'une vue (réouverture rapide, fermeture) : le
    /// corps de l'overlay, lui, lit l'environnement (`ConversationPreviewMotionReader`).
    static var isReducedNow: Bool {
        MeeshyMotion.shouldReduce(
            system: UIAccessibility.isReduceMotionEnabled,
            userForced: MeeshyAccessibilityPreferences.shared.reduceMotion
        )
    }

    static func emergesFromRow(reduceMotion: Bool) -> Bool {
        !reduceMotion
    }

    /// D'où la carte part : SUR la ligne pressée (scale ≈ hauteur ligne /
    /// hauteur carte, ancre `.bottom` — l'offset aligne le centre visuel de la
    /// carte réduite, à maxY - scale·H/2, sur celui de la ligne), zoom centré
    /// 0.7 quand la ligne n'est pas connue (rotor), à sa place sous Réduire les
    /// animations.
    static func placement(source: CGRect?, rest: CGRect, reduceMotion: Bool) -> (scale: CGFloat, offset: CGFloat) {
        guard emergesFromRow(reduceMotion: reduceMotion) else { return (1.0, 0) }
        guard let source, rest.height > 0 else { return (0.7, 0) }
        let scale = max(0.22, min(0.7, source.height / rest.height))
        return (scale, source.midY - (rest.maxY - scale * rest.height / 2))
    }

    static func entrance(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeOut(duration: fadeDuration) : .timingCurve(0.5, 0.0, 0.15, 1.3, duration: 0.55)
    }

    static func exit(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeOut(duration: fadeDuration) : .spring(response: 0.32, dampingFraction: 0.78)
    }

    /// Le flou suit l'échelle de la carte — net à 1.0, jusqu'à 3 repliée ;
    /// jamais négatif quand le rebond dépasse 1.0 ; nul sous Réduire les
    /// animations.
    static func blurRadius(previewScale: CGFloat, reduceMotion: Bool) -> CGFloat {
        reduceMotion ? 0 : 3.0 * max(0, 1.0 - previewScale)
    }

    /// Le menu remonte de 70 pt à l'ouverture ; sous Réduire les animations,
    /// il apparaît à sa place.
    static func menuRestOffset(reduceMotion: Bool) -> CGFloat {
        reduceMotion ? 0 : 70
    }

    static func menuRestBlur(reduceMotion: Bool) -> CGFloat {
        reduceMotion ? 0 : 6
    }
}

/// Lit Réduire les animations dans l'environnement — ses deux moitiés — pour
/// l'overlay de `ConversationListView`, une extension qui ne peut pas déclarer
/// de propriété `@Environment`.
struct ConversationPreviewMotionReader<Content: View>: View {
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @ViewBuilder let content: (Bool) -> Content

    var body: some View {
        content(MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion))
    }
}

// MARK: - Les gestes du menu d'une rangée, construits par la liste (#11215)

extension ConversationRowMenuActions {

    /// Les gestes que la liste offre pour `conversation` — le MÊME jeu pour le
    /// menu natif et le menu custom. Supprimer, Quitter et Bloquer arment une
    /// confirmation (dialog attaché dans ConversationListView.body), jamais l'effet.
    static func make(for conversation: Conversation, in list: ConversationListView) -> ConversationRowMenuActions {
        let viewModel = list.conversationViewModel
        let id = conversation.id
        return ConversationRowMenuActions(
            onPin: { Task { await viewModel.togglePin(for: id) } },
            onMute: { Task { await viewModel.toggleMute(for: id) } },
            onMarkReadToggle: {
                let unread = conversation.userState.unreadCount > 0
                Task {
                    if unread { await viewModel.markAsRead(conversationId: id) } else { await viewModel.markAsUnread(conversationId: id) }
                }
            },
            onDetails: { list.presentInfo(of: conversation) },
            onRename: {
                list.renameText = conversation.name
                list.sheetTargets.rename = conversation
            },
            onSetFavorite: { emoji in Task { await viewModel.setFavoriteReaction(conversationId: id, emoji: emoji) } },
            onRemoveFavorite: { Task { await viewModel.setFavoriteReaction(conversationId: id, emoji: nil) } },
            onMove: { sectionId in viewModel.moveToSection(conversationId: id, sectionId: sectionId) },
            onInvite: { list.sheetTargets.inviteSheet = conversation },
            onLock: { requestLockToggle(for: conversation, in: list) },
            onArchive: {
                let archived = conversation.userState.isArchived
                Task {
                    if archived { await viewModel.unarchiveConversation(conversationId: id) } else { await viewModel.archiveConversation(conversationId: id) }
                }
            },
            onBlock: { requestBlockToggle(for: conversation, in: list) },
            onDelete: {
                list.sheetTargets.deleteTarget = conversation
            },
            onLeave: { list.sheetTargets.leaveTarget = conversation },
            onReport: { list.sheetTargets.reportTarget = conversation },
            onOpenAdmin: { openAdminConsole(for: conversation) },
            onDetach: { DetachedWindowOpener.shared.open(.conversation(id: conversation.id)) },
            // MÊME chemin que la loupe de l'aperçu : la porte du verrou
            // (`openConversation`, après le PIN) arme `pendingOpenSearch`.
            onSearch: { list.openConversation(conversation, searching: true) },
            onCall: { startCall(to: conversation, isVideo: false) },
            onVideoCall: { startCall(to: conversation, isVideo: true) },
            onGroupSettings: { list.presentSettings(of: conversation) },
            // La fiche s'ouvre sur son onglet Membres (`ConversationInfoSheet.InfoTab`),
            // derrière la même porte du verrou que « Détails ».
            onManageMembers: { list.presentInfo(of: conversation) }
        )
    }

    /// Appeler le pair d'un direct : `requestPermissionsThenStartCall` tranche
    /// micro et caméra AVANT de composer — `startCall` brut connecterait un
    /// appel muet.
    static func startCall(to conversation: Conversation, isVideo: Bool) {
        guard let calleeId = conversation.participantUserId else { return }
        Task {
            await CallManager.shared.requestPermissionsThenStartCall(
                conversationId: conversation.id,
                userId: calleeId,
                displayName: conversation.name,
                isVideo: isVideo
            )
        }
    }

    /// La fiche de la conversation dans la console d'administration web.
    static func openAdminConsole(for conversation: Conversation) {
        guard let url = ConversationRowMenuCapabilities.adminConsoleURL(
            conversationId: conversation.id,
            webOrigin: MeeshyConfig.shared.webOrigin
        ) else { return }
        UIApplication.shared.open(url)
    }

    /// Verrouiller passe par le PIN maître ; sans lui, l'alerte qui l'explique.
    private static func requestLockToggle(for conversation: Conversation, in list: ConversationListView) {
        if ConversationLockManager.shared.isLocked(conversation.id) {
            list.lockSheetMode = .unlockConversation
            list.sheetTargets.lockSheet = conversation
        } else if ConversationLockManager.shared.masterPinConfigured {
            list.lockSheetMode = .lockConversation
            list.sheetTargets.lockSheet = conversation
        } else {
            list.showNoMasterPinAlert = true
        }
    }

    /// Débloquer est immédiat ; bloquer demande confirmation.
    private static func requestBlockToggle(for conversation: Conversation, in list: ConversationListView) {
        guard let uid = conversation.participantUserId, BlockService.shared.isBlocked(userId: uid) else {
            list.sheetTargets.blockTarget = conversation
            list.showBlockConfirmation = true
            return
        }
        Task {
            await BlockActionCoordinator.shared.unblock(userId: uid)
            await MainActor.run { HapticFeedback.success() }
        }
    }
}
