import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from ConversationListView.swift

extension ConversationListView {

    // MARK: - Menu d'appui long — deux chemins
    //
    // iPhone, toutes versions d'iOS (#17242) : l'aperçu personnalisé
    // `ConversationLongPressPeek` — grande carte, menu compact qu'on tire vers
    // le haut — déclenché par `RowPressBounceModifier` → `onLongPress`. iPad
    // sous iOS 26 : le menu contextuel NATIF `.contextMenu(menuItems:preview:)`
    // (builder ci-dessous), le seul qui coexiste avec le glisser système.
    // `ConversationRowMenuRoute` tranche. Les DEUX chemins parcourent le MÊME
    // catalogue (`rowMenuCatalog(for:)`, #11230) et appellent les MÊMES gestes ;
    // la suppression arme toujours `sheetTargets.deleteTarget` (confirmation
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

    // MARK: - Native Context Menu (iPad sous iOS 26, Liquid Glass)

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

    // MARK: - Aperçu d'appui long personnalisé (iPhone, toutes versions — #17242)

    func dismissContextMenu() {
        // La carte redevient la ligne ou fond sur place, puis l'overlay part et
        // la rangée revient dans la même image. Purge annulable : une réouverture
        // l'annule (`onLongPress`), sinon elle effacerait le menu rouvert.
        chipAutoScrollDriver.stop()
        contextMenuDismissSettle.cancel()
        let reduceMotion = ConversationPreviewEntranceMotion.isReducedNow
        let exit = ConversationPreviewMorph.exit(hasSource: contextMenuSourceFrame != nil, reduceMotion: reduceMotion, chipLatched: chipModeLatched,
                                                 pulledPastDismiss: dragOffsetY > ConversationPeekPullDown.dismissDistance)
        ConversationPreviewEntranceMotion.animateExit(reduceMotion: reduceMotion) {
            if exit == .morphToRow { previewMorphProgress = 0 }
            if !chipModeLatched && dragOffsetY <= ConversationPeekPullDown.dismissDistance {
                // Fermeture normale : la carte revient en place. Fermeture
                // depuis le morph drag (chip relâchée) : la carte fond SUR
                // PLACE sous le doigt — la faire remonter pendant le fondu
                // serait un aller-retour parasite.
                dragOffsetY = 0
                dragOffsetX = 0
            }
            contextMenuAppeared = false
        }
        contextMenuDismissSettle.arm(after: ConversationPreviewEntranceMotion.exitSettle) {
            sheetTargets.contextMenu = nil
            ConversationPreviewSourceRow.shared.conceal(nil)
            previewMorphProgress = 1
            dragOffsetY = 0
            dragOffsetX = 0
            chipModeLatched = false
            contextMenuSourceFrame = nil
        }
    }

    /// Progression de la traction (0 = aperçu, 1 = ligne déplaçable, #18724) :
    /// voile et menu s'effacent, la carte se comprime en résistant. Décrochée
    /// (`chipModeLatched`), la ligne le reste même si le doigt remonte.
    var dragMorphProgress: CGFloat {
        ConversationPeekPullDown.stage(translation: dragOffsetY, velocity: 0, isLatched: chipModeLatched).progress
    }

    /// L'aperçu naît de la ligne pressée (#18722) — tick 1 : la carte se pose
    /// SUR la ligne, qui se vide dans la même image ; tick 2 : une seule
    /// progression animée l'étend jusqu'à sa place, voile et menu dans la même
    /// transaction. Sans ligne connue ou sous Réduire les animations, elle
    /// apparaît en fondu à sa place et la rangée reste visible.
    func runContextMenuEmergence(reduceMotion: Bool = ConversationPreviewEntranceMotion.isReducedNow) {
        DispatchQueue.main.async {
            let hasSource = contextMenuSourceFrame != nil
            var placement = Transaction()
            placement.disablesAnimations = true
            withTransaction(placement) {
                previewMorphProgress = ConversationPreviewMorph.startProgress(hasSource: hasSource, reduceMotion: reduceMotion)
            }
            let morphs = ConversationPreviewMorph.morphsFromRow(hasSource: hasSource, reduceMotion: reduceMotion)
            ConversationPreviewSourceRow.shared.conceal(morphs ? sheetTargets.contextMenu?.id : nil)
            DispatchQueue.main.async {
                ConversationPreviewEntranceMotion.animateEntrance(reduceMotion: reduceMotion) {
                    contextMenuAppeared = true
                    previewMorphProgress = 1
                }
            }
        }
    }

    @ViewBuilder
    var conversationContextMenuOverlay: some View {
        if let conversation = sheetTargets.contextMenu {
            ConversationPreviewMotionReader { reduceMotion in
                ZStack {
                    // Le voile commun de l'appui long (#11222) : il s'EFFACE
                    // pendant le morph drag, la liste réapparaît sous la carte
                    // devenue chip draggable.
                    LongPressVeil(visibility: contextMenuAppeared ? Double(1 - dragMorphProgress) : 0, weight: ConversationPeekVeil.weight,
                                  onDismiss: { handlePeekTouch(.veil, on: conversation) })
                    // L'aperçu d'appui long (#17242) : grande carte, menu
                    // COMPACT qu'on tire vers le haut. La progression vit dans
                    // `ConversationLongPressPeek` : le geste ne ré-évalue pas
                    // la liste.
                    ConversationLongPressPeek(
                        isVisible: contextMenuAppeared,
                        reduceMotion: reduceMotion,
                        menuChrome: peekMenuChrome(),
                        morphProgress: previewMorphProgress,
                        card: { heights in peekCard(for: conversation, heights: heights, reduceMotion: reduceMotion) },
                        menu: peekMenu(for: conversation),
                        onChipDragChanged: { handleCardChipDrag($0) },
                        onChipDragEnded: { endCardChipDrag($0) },
                        onDismiss: { dismissContextMenu() }
                    )
                }
                .onAppear {
                    // L'aperçu naît de la ligne pressée : posé sur elle (tick 1),
                    // puis étendu jusqu'à sa place (tick 2).
                    dragOffsetY = 0
                    dragOffsetX = 0
                    runContextMenuEmergence(reduceMotion: reduceMotion)
                }
                // Filet : quel que soit le chemin qui retire l'overlay, la
                // rangée source revient.
                .onDisappear { ConversationPreviewSourceRow.shared.conceal(nil) }
            }
            .zIndex(300)
        }
    }

    /// La carte de l'aperçu d'appui long (#18722) : elle NAÎT du cadre de la
    /// rangée pressée et s'étend jusqu'à la carte des DERNIERS MESSAGES —
    /// face de la rangée sur la première moitié, aperçu fondu dans la seconde
    /// (`ConversationPreviewMorphCard`). Tirée vers le bas, elle résiste, se
    /// comprime en ligne, puis décroche et suit le doigt (`dragMorphProgress`).
    func peekCard(for conversation: Conversation, heights: ConversationPeekCardHeights, reduceMotion: Bool) -> some View {
        let isDark = theme.mode.isDark
        let accentColor = conversation.displayPalette(isDark: isDark).primary
        return ConversationPreviewMorphCard(
            progress: previewMorphProgress,
            detach: dragMorphProgress,
            grab: chipGrabPoint,
            source: contextMenuSourceFrame,
            accent: Color(hex: accentColor),
            surface: MeeshyColors.backgroundSecondary(isDark: isDark),
            rowFace: peekRowFace(for: conversation),
            preview: peekPreview(for: conversation, heights: heights)
        )
        // Toucher la carte ouvre la conversation, par la porte du verrou.
        .contentShape(Rectangle())
        .onTapGesture { handlePeekTouch(.card, on: conversation) }
        .accessibilityAction(named: Text(String(localized: "conversation.preview.openFull", bundle: .main))) { handlePeekTouch(.card, on: conversation) }
        .modifier(ConversationPeekCardDrag(offset: CGSize(width: dragOffsetX, height: dragOffsetY), isLatched: chipModeLatched, reduceMotion: reduceMotion))
        .opacity(ConversationPreviewMorph.cardOpacity(isAppeared: contextMenuAppeared, progress: previewMorphProgress))
    }

    /// L'aperçu complet = la carte des DERNIERS MESSAGES, drapeau Lentille ON
    /// comme OFF (le mode garde ses deux portes : encoche et sous-menu).
    private func peekPreview(for conversation: Conversation, heights: ConversationPeekCardHeights) -> some View {
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
            peekHeights: heights
        )
        // Preview STATIQUE : le ScrollView interne des messages volerait le
        // glissement qui tire le menu ou morphe la carte en pastille.
        .scrollDisabled(true)
    }

    /// La face de départ : la rangée telle que la liste la montre, pour que
    /// l'œil ne voie qu'UNE ligne qui se transforme (`ConversationPeekRowFace`).
    @ViewBuilder
    private func peekRowFace(for conversation: Conversation) -> some View {
        if let source = contextMenuSourceFrame {
            ConversationPeekRowFace(
                conversation: conversation,
                community: ConversationRowItem.community(of: conversation, lookup: userCommunityLookup, all: userCommunities),
                width: source.width,
                presenceState: PresenceManager.shared.presenceState(for: conversation.participantUserId ?? ""),
                isPeerHere: peerIsHere(in: conversation),
                isDark: theme.mode.isDark,
                storyRingState: storyRingState(for: conversation),
                moodStatus: conversationMoodStatus(for: conversation),
                typingUsername: conversationViewModel.typingUsernames[conversation.id],
                draftSummary: conversationViewModel.draftSummaries[conversation.id],
                preferredContentLanguages: ReaderPrism.resolve(for: AuthManager.shared.currentUser),
                deviceText: conversationViewModel.endToEndTexts.text(for: conversation.id)
            )
        }
    }

    func handlePeekTouch(_ touch: ConversationPeekTouch, on conversation: Conversation) { dismissContextMenu(); if touch.effect == .dismissAndOpen { openConversation(conversation) } }
    /// Le contenu du menu : le MÊME catalogue et les MÊMES gestes que le menu
    /// natif de l'iPad sous iOS 26.
    func peekMenu(for conversation: Conversation) -> ConversationContextMenuView {
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
    }

    /// Le menu se dévoile avec l'entrée (son seuil et sa montée depuis le bas
    /// sont ceux du morphisme, `ConversationPreviewMenuReveal`), et redescend
    /// en se dissolvant pendant le morph en pastille.
    func peekMenuChrome() -> ConversationPeekMenuChrome {
        guard contextMenuAppeared else { return ConversationPeekMenuChrome(offset: 0, opacity: 0, blur: 0) }
        return ConversationPeekMenuChrome(offset: 40 * dragMorphProgress, opacity: Double(1 - dragMorphProgress), blur: 6 * dragMorphProgress)
    }

    /// Glisser la carte vers le BAS depuis le cran compact : elle résiste et
    /// se comprime en ligne sous le doigt ; tirée franchement, elle DÉCROCHE
    /// (`ConversationPeekPullDown.stage`) et le suit pour viser une section.
    func handleCardChipDrag(_ value: DragGesture.Value) {
        if chipGrabPoint != value.startLocation { chipGrabPoint = value.startLocation }
        if chipModeLatched {
            dragOffsetY = value.translation.height
            dragOffsetX = value.translation.width
            updateChipDropTarget(at: value.location)
            chipAutoScrollDriver.update(fingerLocation: value.location)
            return
        }
        dragOffsetY = max(0, value.translation.height)
        dragOffsetX = value.translation.width * dragMorphProgress
        guard ConversationPeekPullDown.latches(wasLatched: chipModeLatched, stage: ConversationPeekPullDown.stage(translation: dragOffsetY, velocity: value.peekPullVelocity)) else { return }
        // Une fois par geste : haptique rigide, la ligne saute sous le doigt.
        meeshyWithAnimation(MeeshyAnimation.peekDetach, reduced: nil, reduceMotion: ConversationPreviewEntranceMotion.isReducedNow) { chipModeLatched = true }
        HapticFeedback.rigid()
        updateChipDropTarget(at: value.location)
        chipAutoScrollDriver.onScrollTick = { location in
            updateChipDropTarget(at: location)
        }
        chipAutoScrollDriver.update(fingerLocation: value.location)
    }

    /// Lâcher : la pastille se dépose, ou `ConversationPeekPullDown` ferme / remet en place (#17258).
    func endCardChipDrag(_ value: DragGesture.Value) {
        switch ConversationPeekPullDown.release(predictedEndTranslation: value.predictedEndTranslation.height, isLatched: chipModeLatched,
                                                velocity: value.peekPullVelocity) {
        case .drop:
            chipAutoScrollDriver.stop()
            handleChipDrop(at: value.location)
        case .dismiss:
            dismissContextMenu()
        case .restore:
            ConversationPeekDetachMotion.animateReturn { dragOffsetY = 0; dragOffsetX = 0 }
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

// MARK: - Le mouvement de l'aperçu (#11213, #18722)

/// Les deux mouvements de l'aperçu : l'entrée étend la carte depuis la ligne
/// pressée par le jeton de ressort `previewMorph`, le retrait la ramène sur la
/// ligne par `previewMorphReturn`. Sous Réduire les animations, un FONDU sur
/// place, sans déplacement. Les deux moitiés du réglage (système et app) se
/// lisent par `MeeshyMotion.shouldReduce`.
enum ConversationPreviewEntranceMotion {
    static let fadeDuration: Double = 0.18

    /// L'overlay se retire quand le retrait a rejoint la ligne : le ressort de
    /// retour l'atteint avant, et la rangée revient dans la même image que le
    /// retrait de la carte.
    static let exitSettle: Double = 0.26

    /// Lecture ponctuelle, hors d'une vue (réouverture rapide, fermeture) : le
    /// corps de l'overlay, lui, lit l'environnement (`ConversationPreviewMotionReader`).
    static var isReducedNow: Bool {
        MeeshyMotion.shouldReduce(
            system: UIAccessibility.isReduceMotionEnabled,
            userForced: MeeshyAccessibilityPreferences.shared.reduceMotion
        )
    }

    static func entrance(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeOut(duration: fadeDuration) : MeeshyAnimation.previewMorph
    }

    static func exit(reduceMotion: Bool) -> Animation {
        reduceMotion ? .easeOut(duration: fadeDuration) : MeeshyAnimation.previewMorphReturn
    }

    /// L'entrée et la sortie passent la variante réduite à la racine du
    /// mouvement, qui couperait sinon le fondu voulu (#18354).
    static func animateEntrance(reduceMotion: Bool, _ body: () -> Void) {
        meeshyWithAnimation(entrance(reduceMotion: false), reduced: entrance(reduceMotion: true),
                            reduceMotion: reduceMotion, body)
    }

    static func animateExit(reduceMotion: Bool, _ body: () -> Void) {
        meeshyWithAnimation(exit(reduceMotion: false), reduced: exit(reduceMotion: true),
                            reduceMotion: reduceMotion, body)
    }
}

// MARK: - La carte qui naît de la ligne (#18722)

/// La carte d'aperçu pendant son morphisme : un cadre interpolé de la rangée
/// pressée jusqu'à la place que l'aperçu lui donne, coins compris, qui porte
/// la face de la rangée puis l'aperçu complet. L'aperçu se met en page UNE
/// fois à sa taille de repos et le cadre ne fait que le découper : rien ne se
/// remet en page pendant l'animation. Toutes les valeurs rendues dérivent de
/// la seule `progress`, interpolée image par image par des modificateurs
/// animables — ni la liste ni l'aperçu ne sont ré-évalués. Tirée vers le bas,
/// la carte refait le chemin à l'envers vers une forme de ligne (`detach`).
struct ConversationPreviewMorphCard<RowFace: View, Preview: View>: View {
    let progress: CGFloat
    /// La compression vers la ligne pendant la traction (#18724) : 0 ⇒ la
    /// carte, 1 ⇒ une rangée — avatar à gauche, titre — prête à décrocher.
    var detach: CGFloat = 0
    /// Le point GLOBAL où le doigt a saisi la carte : la ligne s'y resserre.
    var grab: CGPoint? = nil
    /// Le cadre GLOBAL de la rangée pressée ; nil ⇒ la carte ne part que d'elle-même.
    let source: CGRect?
    let accent: Color
    let surface: Color
    let rowFace: RowFace
    let preview: Preview

    var body: some View {
        GeometryReader { geometry in
            let rest = CGRect(origin: .zero, size: geometry.size)
            let slot = geometry.frame(in: .global)
            let from = ConversationPreviewMorph.sourceInSlot(source, slot: slot) ?? rest
            let grabY = ConversationPeekPullDown.grabY(grab, slot: slot, shift: geometry.frame(in: .named(ConversationPeekCardDrag.restSpace)).origin)
            let row = ConversationPeekPullDown.rowFrame(size: ConversationPeekPullDown.rowSize(source: source, cardWidth: rest.width), in: rest, grabY: grabY)
            // Calé en tête et à gauche : la face garde son avatar et son titre
            // pendant que le cadre se resserre, et l'aperçu tombe pile à sa place.
            ZStack(alignment: .topLeading) {
                rowFace
                    .frame(width: from.width, height: from.height)
                    .modifier(ConversationPreviewMorphFade(progress: progress, detach: detach, layer: .rowFace))
                preview
                    .frame(width: rest.width, height: rest.height, alignment: .top)
                    .modifier(ConversationPreviewMorphFade(progress: progress, detach: detach, layer: .preview))
            }
            .modifier(ConversationPreviewMorphFrame(progress: progress, detach: detach, from: from, to: rest, row: row,
                                                    accent: accent, surface: surface))
        }
    }
}

/// La face de départ de la carte : la MÊME rangée que la liste montre — même
/// aiguillage Lentille, mêmes signaux (frappe, brouillon, présence, verrou) —,
/// à la largeur de la ligne pressée. Inerte et muette pour VoiceOver : l'aperçu
/// porte les actions.
struct ConversationPeekRowFace: View {
    let conversation: Conversation
    let community: MeeshyCommunity?
    let width: CGFloat
    let presenceState: PresenceState
    let isPeerHere: ConversationHere
    let isDark: Bool
    let storyRingState: StoryRingState
    let moodStatus: StatusEntry?
    let typingUsername: String?
    let draftSummary: DraftSummary?
    let preferredContentLanguages: [String]
    let deviceText: ConversationPreviewDeviceText?

    var body: some View {
        row
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private var row: some View {
        if LentilleFeatureFlag.isLentilleListEnabled {
            LentilleConversationRow(
                conversation: conversation,
                community: community,
                availableWidth: width,
                presenceState: presenceState,
                isPeerHere: isPeerHere,
                isDark: isDark,
                storyRingState: storyRingState,
                moodStatus: moodStatus,
                typingUsername: typingUsername,
                draftSummary: draftSummary,
                isContentLocked: ConversationLockManager.shared.hidesContent(of: conversation.id),
                avatarRoute: ConversationOpenRoute.avatarRoute(for: conversation),
                preferredContentLanguages: preferredContentLanguages,
                deviceText: deviceText
            )
        } else {
            ThemedConversationRow(
                conversation: conversation,
                community: community,
                availableWidth: width,
                presenceState: presenceState,
                isPeerHere: isPeerHere,
                isDark: isDark,
                storyRingState: storyRingState,
                moodStatus: moodStatus,
                typingUsername: typingUsername,
                draftSummary: draftSummary,
                isContentLocked: ConversationLockManager.shared.hidesContent(of: conversation.id),
                avatarRoute: ConversationOpenRoute.avatarRoute(for: conversation),
                preferredContentLanguages: preferredContentLanguages,
                deviceText: deviceText
            )
            .equatable()
        }
    }
}

/// Le cadre, le rayon, le fond et l'ombre de la carte, interpolés par SwiftUI
/// à chaque image du ressort : le contenu reste opaque à ce modificateur. La
/// traction (`detach`) comprime le cadre vers la ligne et rouvre ses coins de
/// rangée ; le fond et l'ombre restent, la ligne flotte au-dessus de la liste.
struct ConversationPreviewMorphFrame: ViewModifier, Animatable {
    var progress: CGFloat
    var detach: CGFloat
    let from: CGRect
    let to: CGRect
    let row: CGRect
    let accent: Color
    let surface: Color

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(progress, detach) }
        set { progress = newValue.first; detach = newValue.second }
    }

    func body(content: Content) -> some View {
        let born = ConversationPreviewMorph.frame(progress: progress, from: from, to: to)
        let frame = ConversationPeekPullDown.compressed(born, toward: row, detach: detach)
        let faces = ConversationPeekPullDown.faceProgress(morph: progress, detach: detach)
        // Coins du même style que ceux de `ConversationPreviewView` : au repos,
        // les deux découpes se confondent.
        let shape = RoundedRectangle(
            cornerRadius: ConversationPreviewMorph.cornerRadius(progress: faces, from: MeeshyRadius.md, to: MeeshyRadius.xl),
            style: .circular
        )
        content
            .frame(width: frame.width, height: frame.height, alignment: .topLeading)
            .clipShape(shape)
            // Le fond et l'ombre de la carte au repos (celle de
            // `ConversationPreviewView`, que le découpage retient) naissent
            // avec elle. L'ombre suit la FORME, jamais le contenu : aucun rendu
            // hors écran des messages à chaque image du ressort.
            .background(
                shape.fill(surface)
                    .shadow(color: accent.opacity(MeeshyOpacity.medium), radius: 20, y: 10)
                    .opacity(ConversationPreviewMorph.opacity(of: .surface, progress: progress))
            )
            .position(x: frame.midX, y: frame.midY)
    }
}

/// L'opacité d'une face de la carte, interpolée image par image : la face de
/// la rangée revient quand la traction refait de la carte une ligne.
struct ConversationPreviewMorphFade: ViewModifier, Animatable {
    var progress: CGFloat
    var detach: CGFloat
    let layer: ConversationPreviewMorph.Layer

    var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(progress, detach) }
        set { progress = newValue.first; detach = newValue.second }
    }

    func body(content: Content) -> some View {
        let faces = ConversationPeekPullDown.faceProgress(morph: progress, detach: detach)
        return content.opacity(ConversationPreviewMorph.opacity(of: layer, progress: faces))
    }
}

// MARK: - Le décrochage en ligne déplaçable (#18724)

/// La carte sous le doigt pendant la traction : elle résiste tant qu'elle
/// tient (`ConversationPeekPullDown.cardOffset`), puis, décrochée, suit le
/// doigt d'un ressort court — le saut vers le doigt au décrochage en est le
/// premier pas. Seules les images du geste reçoivent ce ressort : un retour
/// ou un retrait animés gardent le leur.
struct ConversationPeekCardDrag: ViewModifier {
    /// La carte AU REPOS, hors du décalage : la carte y lit ce que le geste
    /// l'a déplacée, pour garder la ligne sous le point saisi.
    nonisolated static let restSpace = "conversation.peek.card.rest"

    let offset: CGSize
    let isLatched: Bool
    let reduceMotion: Bool

    func body(content: Content) -> some View {
        content
            .offset(x: offset.width, y: ConversationPeekPullDown.cardOffset(translation: offset.height, isLatched: isLatched))
            .transaction(follow)
            .coordinateSpace(name: ConversationPeekCardDrag.restSpace)
    }

    private var follow: (inout Transaction) -> Void {
        let follow = ConversationPeekDetachMotion.follow(isLatched: isLatched, reduceMotion: reduceMotion)
        return { transaction in
            guard transaction.animation == nil, !transaction.disablesAnimations else { return }
            transaction.animation = follow
        }
    }
}

/// Les mouvements du décrochage : le ressort qui porte la ligne décrochée, et
/// le retour en aperçu d'une carte relâchée avant de décrocher. Sous Réduire
/// les animations, la ligne suit le doigt à l'image et le retour est un fondu.
nonisolated enum ConversationPeekDetachMotion {
    static func follow(isLatched: Bool, reduceMotion: Bool) -> Animation? {
        isLatched && !reduceMotion ? MeeshyAnimation.peekDetach : nil
    }

    /// Le retour reste annulable : un nouveau glissement le reprend où il en est.
    @MainActor
    static func animateReturn(_ body: () -> Void) {
        meeshyWithAnimation(MeeshyAnimation.peekDetachReturn, reduced: MeeshyMotion.reducedFade,
                            reduceMotion: ConversationPreviewEntranceMotion.isReducedNow, body)
    }
}

extension DragGesture.Value {
    /// La vitesse verticale du doigt, en points par seconde : servie dès
    /// iOS 17, retrouvée dans la fin prédite avant.
    var peekPullVelocity: CGFloat {
        guard #available(iOS 17.0, *) else {
            return ConversationPeekPullDown.velocity(translation: translation.height,
                                                     predictedEndTranslation: predictedEndTranslation.height)
        }
        return velocity.height
    }
}

/// Le menu n'apparaît qu'au seuil du morphisme, depuis le bas de la carte, sur
/// la fin du ressort ; avant, il ne prend aucun toucher.
struct ConversationPreviewMenuReveal: ViewModifier, Animatable {
    var progress: CGFloat
    let reduceMotion: Bool

    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func body(content: Content) -> some View {
        content
            .offset(y: ConversationPreviewMorph.menuRise(progress: progress, reduceMotion: reduceMotion))
            .opacity(Double(ConversationPreviewMorph.menuReveal(progress: progress)))
            .allowsHitTesting(ConversationPreviewMorph.showsMenu(progress: progress))
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
            onObsolete: { list.sheetTargets.obsoleteTarget = conversation },
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
            await CallManager.shared.outgoingDial.requestPermissionsThenStartCall(
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
