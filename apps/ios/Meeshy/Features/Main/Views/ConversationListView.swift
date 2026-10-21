import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

// MARK: - Conversation List View
struct ConversationListView: View {
    @Binding var isScrollingDown: Bool
    @Binding var feedIsVisible: Bool  // Track Feed visibility to show search bar when Feed closes
    let onSelect: (Conversation) -> Void
    var onStoryViewRequest: ((String, Bool) -> Void)? = nil  // (userId, fromTray)
    var onNewConversation: (() -> Void)? = nil

    // iPad-specific: extra trailing icons and Feed button in header
    var iPadNotificationCount: Int = 0
    var onNotificationsTap: (() -> Void)? = nil
    var onSettingsTap: (() -> Void)? = nil
    var iPadFeedAction: (() -> Void)? = nil

    /// iPad / macOS split view: id of the currently-open conversation, to highlight
    /// the matching row with an accent tint + leading bar. nil on iPhone.
    var selectedConversationId: String? = nil

    @Environment(\.scenePhase) private var scenePhase
    // Theme stays a direct read (a theme flip should repaint the whole list
    // anyway, and it's infrequent). internal for cross-file extension access.
    var theme: ThemeManager { ThemeManager.shared }
    // Lock + block ARE observed: they drive the swipe-action icons (Unlock /
    // Unblock toggles built by `leadingSwipeActions` / `trailingSwipeActions`)
    // which the row's Equatable gate compares. A direct read would freeze a
    // stale action behind the gate after a lock/unlock or block/unblock (Opus
    // review finding 2026-06-10) — they aren't in `renderFingerprint`. Both
    // change only on explicit user action (rare), and the gate keeps unaffected
    // rows static, so observing them is free on the hot scroll path.
    private var lockManager: ConversationLockManager { ConversationLockManager.shared }
    // Lecture directe sans @ObservedObject sur PresenceManager lui-même —
    // observer l'objet entier re-déclencherait ce body à CHAQUE mutation de
    // `presenceMap` (un event `user:status` par contact), pas seulement
    // quand une pastille visible change réellement.
    private var presenceManager: PresenceManager { PresenceManager.shared }
    /// Signal ciblé et débouncé (`PresenceRefreshSignal`, PresenceManager.swift)
    /// — SEUL élément observé pour la présence. Sa valeur n'est jamais lue :
    /// le simple fait qu'elle change re-diffe la liste, et le gate
    /// `.equatable()` de chaque row (qui compare déjà `presenceState`)
    /// décide seul si CETTE row doit se reconstruire. Avant ce signal,
    /// personne n'observait `PresenceManager` : les pastilles ne se
    /// rafraîchissaient que par coïncidence, au gré d'un autre re-render
    /// (audit 2026-07-20, "pastilles jamais rafraîchies sur user:status").
    @ObservedObject private var presencePulse: PresenceRefreshSignal = PresenceManager.shared.refreshSignal
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel
    @EnvironmentObject var conversationViewModel: ConversationListViewModel
    @EnvironmentObject var router: Router

    // Status
    @State private var showStatusComposer = false
    /// Accès rapides (queue de liste / état vide, 2026-08-21) : les feuilles
    /// de création EXISTANTES, réutilisées telles quelles.
    @State private var showCreateAffiliate = false
    @State private var showCreateTrackingLink = false

    // Search and Filters
    @FocusState var isSearching: Bool
    @State var showSearchOverlay: Bool = false
    @State private var expandedSections: Set<String> = ConversationListSectionMemory.shared.initial
    @State private var listColumnSize: CGSize = .zero
    @State private var keyboardCursor: String?
    /// Pendant le glisser d'une conversation : les catégories dépliées AVANT, rendues au dépôt ou à l'annulation.
    @State private var sectionsBeforeDrag: Set<String>?
    /// Le glisser en cours : son jeton et la catégorie d'où il part. Posé dès le soulèvement — qui précède aussi
    /// le menu d'appui long —, il ne replie rien tant que le doigt n'a pas bougé au-dessus de la liste.
    @State private var pendingDrag: PendingConversationDrag?
    /// La catégorie d'où part la conversation glissée — son en-tête prend la couleur primaire.
    @State private var dragOriginSectionId: String?

    // Performance optimized scroll variables
    @State private var selectedProfileUser: ProfileSheetUser? = nil
    /// Offset de scroll relayé au header SANS invalider ce body : `@State`
    /// retient la référence sans s'abonner (même famille que
    /// `sectionFrameRegistry` / `chipAutoScrollDriver`) ; seul
    /// `ConversationListHeaderOverlay` observe le relay. L'ancien
    /// `@State CGFloat headerScrollOffset` ré-exécutait ce body ENTIER
    /// (~99 rows reconstruites + diff Equatable) à chaque tick de scroll.
    @State private var scrollOffsetRelay = ScrollOffsetRelay()
    /// Positions des stickers de section (pilule) — boîte inerte, voir
    /// `LentilleSectionPositionRegistry`.
    @State private var sectionPositionRegistry = LentilleSectionPositionRegistry()
    /// Extrême de la loi de la barre de recherche (#11036), retenu sans abonnement.
    @State private var searchBarScrollAnchor = ConversationSearchBarScrollAnchor()

    // MARK: - Focus card (LWS-8, drapeau Lentille)
    //
    // Deux références retenues sans abonnement — même famille que
    // `scrollOffsetRelay` et `sectionFrameRegistry`, et pour la même raison :
    // ce body ne doit RIEN apprendre du défilement. Le registre est une boîte
    // inerte que les `GeometryReader` des rangs remplissent à chaque layout ;
    // le magasin d'élu est écrit par `LentilleFocusElectionHost`, l'hôte dédié,
    // et sera lu par la focus card (I-071). L'élection elle-même n'existe nulle
    // part dans ce fichier : la liste monte un hôte, c'est tout.
    @State private var focusCandidateRegistry = LentilleFocusCandidateRegistry()
    @State private var focusElection = LentilleFocusElection()
    /// Activité de la SCÈNE (2026-08-21) : perspective et carte de focus
    /// pendant le défilement seulement, à plat `restDelay` après la pose.
    @State private var sceneActivity = LentilleSceneActivity()

    // MARK: - Pilule de section (LWS-6, drapeau Lentille)
    //
    // AUCUN observateur de défilement nouveau — contrainte dure du contrat. Le
    // détecteur reste l'unique `onScrollOffsetChange` de
    // `MeeshyRefreshableScroll` : il écrit dans `scrollOffsetRelay` ET dérive
    // `isScrollingDown`. Trois consommateurs — la barre du bas et les boutons
    // flottants (RootView) lisent `isScrollingDown` ; la pilule s'abonne au
    // RELAIS, dans `SectionScrollPillHost`, exactement comme
    // `ConversationListHeaderOverlay` le fait depuis toujours. C'est ce qui lui
    // donne un événement par TICK de défilement, donc un effacement une fenêtre
    // après l'ARRÊT réel et non après la dernière bascule de direction (le
    // signal booléen ne bascule qu'aux changements de sens, sous hystérésis (#11036),
    // et il est aussi remis à false par programme).
    //
    // L'état de la loi vit dans l'hôte, JAMAIS ici : le porter dans ce body
    // re-diffuserait ~99 rangs à chaque tick — précisément le défaut que ce
    // relais a été créé pour éliminer.

    /// Section dont la pilule porte le nom. Alimentée par l'`onAppear` des
    /// rangs — le hook qui existe DÉJÀ (`triggerLoadMoreIfNeeded`) — et non par
    /// une sonde de géométrie, qui serait l'observateur que le contrat
    /// interdit.
    @State private var visibleSectionId: String? = nil

    // Pull-to-refresh : delegue tout a `MeeshyRefreshableScroll` (wrapper
    // brand-coherent qui combine `.refreshable` natif iOS + animation
    // Meeshy custom : logo dashes, degrade indigo, haptic au seuil et au
    // success). L'ancien state machine custom (pullPhase, peakPullDistance,
    // simultaneousGesture, startPullRefresh, completePullRefresh) ne
    // declenchait pas l'haptic ni le refresh sur device — `simultaneousGesture`
    // ne firait pas systematiquement parce que le ScrollView consomme le
    // drag vertical en priorite. Le wrapper utilise `.refreshable` qui est
    // robuste.

    // UI states
    /// LES SEPT CIBLES DE FEUILLES, SUR LE TAS (#6221, suite) — elles étaient
    /// sept `@State var …: Conversation?`, soit ~6,9 Ko des 10 256 octets de
    /// cette vue, pour un contenu à la fois. Voir `ConversationListSheetTargets`.
    @State var sheetTargets = ConversationListSheetTargets()
    @State var showBlockConfirmation = false
    /// Cible de la demande de suppression (menu custom ou swipe « hide »).
    /// Tout callback destructif passe par le confirmationDialog système —
    /// jamais d'appel direct à `deleteConversation` depuis un menu.
    @State var lockSheetMode: ConversationLockSheet.Mode = .lockConversation
    @State var showNoMasterPinAlert = false
    @State var showGlobalSearch = false
    
    // Widget preview state
    @State var showWidgetPreview = false
    @State private var showShareLinkSheet = false

    // Invite sheet

    // Communities data
    @State var userCommunities: [MeeshyCommunity] = []

    // Preview state for hard press

    /// Conversation dont l'overlay de menu contextuel custom est présenté
    /// (appui long). Menu custom qui dessine ses icônes — le `.contextMenu`
    /// natif ne les affiche pas sur iOS 26.
    /// Pilote l'animation zoom + rebond de l'overlay (false au montage → true
    /// via `.onAppear` ; false à la fermeture). Voir `conversationContextMenuOverlay`.
    @State var contextMenuAppeared = false
    /// Purge différée annulable de l'overlay (voir `dismissContextMenu`). Conservée
    /// pour l'annuler si une nouvelle ouverture survient avant la fin du zoom-out,
    /// sinon la purge en vol effacerait le menu qui vient de se rouvrir.
    @State var contextMenuDismissSettle = Debouncer()
    /// Scale de la carte d'aperçu de l'overlay (1.0 = dépliée, 0 = repliée via
    /// le drag vers le haut sur la carte — `previewCollapseGesture`, +Overlays).
    /// Muté uniquement quand l'overlay est ouvert ; les lignes ne le reçoivent
    /// plus (gate Equatable intact pendant le geste).
    @State var previewScale: CGFloat = 1.0
    /// Offset de la carte d'aperçu pendant le drag vers le bas — suit le doigt
    /// 1:1 et pilote le morph drag-n-drop (`dragMorphProgress`, +Overlays).
    /// > 110 pt au lâcher = fermeture du menu.
    @State var dragOffsetY: CGFloat = 0
    /// Offset horizontal du drag — actif uniquement en morph (la carte suit
    /// le doigt latéralement une fois le mode drag engagé).
    @State var dragOffsetX: CGFloat = 0
    /// Frame GLOBALE de la ligne pressée au déclenchement du long-press —
    /// point de départ de l'émergence de l'aperçu. nil = inconnu (rotor
    /// accessibilité) → fallback zoom centré 0.7 → 1.0.
    @State var contextMenuSourceFrame: CGRect? = nil
    /// Frame de REPOS de la carte d'aperçu (mesurée hors transformation,
    /// overlay invisible) — sert à calculer le placement initial de
    /// l'émergence depuis la ligne. Voir `runContextMenuEmergence` (+Overlays).
    @State var previewRestFrame: CGRect = .zero
    /// Offset y d'émergence : la carte part de la position de la ligne
    /// (placement invisible) puis rejoint sa position finale — départ lent,
    /// accélération, léger rebond (timingCurve overshoot).
    @State var previewEmergeOffset: CGFloat = 0

    /// Renommage : conversation cible + texte en cours d'édition (action
    /// « Renommer » du menu contextuel, groupes/communautés uniquement).
    /// (#6221) `sheetTargets.rename` a rejoint `sheetTargets` — c'est une cible de
    /// feuille comme les sept autres, et elle était restée en ligne pour 992 o.
    @State var renameText: String = ""

    // Drag & Drop : le `.onDrag` natif est RÉACTIVÉ sur le chemin iOS 26
    // (2026-07-11) — il coexiste avec le `.contextMenu` système ; c'était le
    // long-press CUSTOM du fallback qu'il cassait (135af8f2), il reste donc
    // absent de la branche < iOS 26 (qui garde le morph chip de l'overlay).
    // L'id voyage dans le NSItemProvider : `draggingConversation` n'est plus
    // posé par personne (un drag annulé ne laisse aucun état) — conservé
    // uniquement pour le plumbing `isDragging` des rows (poignée dédiée /
    // mode édition futur).
    /// (#6221) L'IDENTIFIANT, PAS LA CONVERSATION. Le commentaire ci-dessus le
    /// dit : ce champ « n'est plus posé par personne ». Il pesait pourtant 992
    /// octets EN LIGNE dans la vue — et une vue SwiftUI est un type valeur que
    /// chaque closure de son `body` copie. Le seul usage est une comparaison
    /// d'id (`isDragging`) ; le plumbing documenté est conservé intact, à seize
    /// octets au lieu de neuf cent quatre-vingt-douze.
    @State private var draggingConversationId: String? = nil
    /// Section surlignée comme cible de drop. Alimenté par le morph drag de
    /// l'overlay (chip sous le doigt — voir `previewCollapseGesture`,
    /// +Overlays) en plus du `SectionDropDelegate` historique. Pas `private` :
    /// muté depuis le fichier d'extension +Overlays.
    @State var dropTargetSection: String? = nil
    /// Frames GLOBALES des headers de section, tenues à jour par leurs
    /// GeometryReader dans une boîte INERTE (aucune invalidation par tick de
    /// scroll) — hit-test du drop de la chip du morph drag.
    @State var sectionFrameRegistry = SectionFrameRegistry()
    /// true dès que le morph drag a atteint sa pleine progression : la carte
    /// RESTE une chip qui suit librement le doigt (y compris vers le haut,
    /// pour viser un header au-dessus) jusqu'au relâchement — drop ou dismiss.
    @State var chipModeLatched = false
    /// Auto-scroll de bord pendant le drag de la chip (Phase 3) : stationner
    /// près du haut/bas du viewport fait défiler la liste pour atteindre les
    /// headers de section hors écran. Armé au verrouillage de la chip
    /// (+Overlays), arrêté au drop et au dismiss.
    @State var chipAutoScrollDriver = ChipAutoScrollDriver()

    @State var userCommunityLookup: [String: MeeshyCommunity] = [:]


    // Alternative init without binding for backward compatibility
    init(
        isScrollingDown: Binding<Bool>? = nil,
        feedIsVisible: Binding<Bool>? = nil,
        onSelect: @escaping (Conversation) -> Void,
        onStoryViewRequest: ((String, Bool) -> Void)? = nil,
        onNewConversation: (() -> Void)? = nil,
        iPadNotificationCount: Int = 0,
        onNotificationsTap: (() -> Void)? = nil,
        onSettingsTap: (() -> Void)? = nil,
        iPadFeedAction: (() -> Void)? = nil,
        selectedConversationId: String? = nil
    ) {
        self._isScrollingDown = isScrollingDown ?? .constant(false)
        self._feedIsVisible = feedIsVisible ?? .constant(false)
        self.onSelect = onSelect
        self.onStoryViewRequest = onStoryViewRequest
        self.onNewConversation = onNewConversation
        self.iPadNotificationCount = iPadNotificationCount
        self.onNotificationsTap = onNotificationsTap
        self.onSettingsTap = onSettingsTap
        self.iPadFeedAction = iPadFeedAction
        self.selectedConversationId = selectedConversationId
    }

    // The filtered and grouped conversations are now calculated on a background queue
    // inside `ConversationListViewModel` to prevent main thread freezes and overheating.

    // Empty Branch Resolution: `emptyBranch` / `currentEmptyBranch` live in
    // `ConversationListView+SectionRules.swift` (#8759).

    @ViewBuilder
    private var sectionsContent: some View {
        // Flattened render order across EVERY visible section — pinned →
        // user categories (declared order) → other — mirrors exactly what
        // `ConversationListViewModel.groupConversations` painted on screen.
        // Computed ONCE per body pass here (not per row) and threaded down
        // through `sectionView`/`sectionConversations` to `conversationRow`:
        // ranking `enableAutoPreviewLoad` against
        // `conversationViewModel.conversations` (the raw, unfiltered,
        // ungrouped account-wide list) used to silently starve auto-load for
        // any filtered/sectioned view whose visible rows don't line up with
        // the full-account top-20 by recency (fix 2026-07-21).
        let orderedConversationIds = conversationViewModel.groupedConversations.flatMap { $0.conversations.map(\.id) }
        // Contexte de PASSE (audit fluidité 2026-08-21, H4/H18) : les langues du
        // lecteur (une copie de tableau par rang auparavant) et l'ensemble des
        // ids éligibles à l'auto-chargement (un `firstIndex` O(n) par rang ⇒
        // O(n²) par passe auparavant) sont résolus UNE fois ici.
        let passContext = ConversationRowPassContext(
            orderedConversationIds: orderedConversationIds,
            preferredContentLanguages: AuthManager.shared.currentUser?.preferredContentLanguages ?? [],
            autoPreviewLimit: ConversationRowMetrics.autoPreviewLoadRowLimit
        )
        // Drapeau lu UNE fois par passe de body, jamais par rang : l'`onAppear`
        // d'un rang est un chemin chaud, et `LentilleFeatureFlag` interroge
        // `ProcessInfo.environment` à chaque appel. Le booléen descend ensuite
        // sous la forme d'un `sectionId` optionnel — `nil` = suivi éteint, donc
        // sous drapeau OFF l'`onAppear` ne gagne pas une seule instruction utile.
        let tracksVisibleSection = LentilleFeatureFlag.isLentilleListEnabled
        LazyVStack(spacing: 8, pinnedViews: pinnedSectionHeaders) {
            ForEach(conversationViewModel.groupedConversations, id: \.section.id) { group in
                sectionView(
                    for: group,
                    passContext: passContext,
                    trackedSectionId: tracksVisibleSection ? group.section.id : nil
                )
            }
        }
        .modifier(ConversationListReorderAnimation(order: orderedConversationIds, scrollRelay: scrollOffsetRelay))
        .modifier(ConversationListKeyboardNavigation(
            visibleIds: conversationViewModel.groupedConversations
                .filter { isSectionContentVisible($0.section.id) }.flatMap { $0.conversations.map(\.id) },
            cursor: $keyboardCursor, onOpen: openConversation(id:)))
        // Sonde inerte : capture l'UIScrollView hôte pour l'auto-scroll de
        // bord du drag de chip (+Overlays). Aucune interaction, frame nulle.
        .background(ChipAutoScrollGrabber(driver: chipAutoScrollDriver))
        // Le glisser se termine sans dépôt sur une catégorie (lâché ailleurs, ou en fenêtre) : on redéplie.
        // Le glisser se déplace au-dessus de la liste : c'est un glisser, pas un appui long qui finira en menu.
        .onDrop(of: [.text], delegate: ConversationListDragWatch(onEnter: collapseForConversationDrag))
        .onReceive(NotificationCenter.default.publisher(for: .conversationDragDidEnd)) { note in
            endConversationDrag(token: (note.object as? NSUUID).map { $0 as UUID })
        }
    }

    /// L'épinglage est une propriété du CONTENEUR, pas de la vue de header
    /// (contrat LWS-6, écart E4) : le même `LazyVStack` sert les deux peaux et
    /// n'épingle QUE sous drapeau. Sous OFF l'ensemble est vide — c'est la
    /// valeur par défaut du paramètre, donc le rendu d'aujourd'hui, sections
    /// NON épinglées, au bit près.
    private var pinnedSectionHeaders: PinnedScrollableViews {
        LentilleFeatureFlag.isLentilleListEnabled ? [.sectionHeaders] : []
    }

    private var isSingleUngroupedSection: Bool {
        Self.isSingleUngroupedSection(sectionIds: conversationViewModel.groupedConversations.map(\.section.id))
    }

    // MARK: - Sections : pliage et cible de drop — règles PURES dans
    // `ConversationListView+SectionRules.swift`.

    private func isSectionContentVisible(_ sectionId: String) -> Bool {
        Self.isSectionContentVisible(
            sectionId: sectionId,
            expandedSections: expandedSections,
            isSingleUngroupedSection: isSingleUngroupedSection
        )
    }

    // MARK: - Section (conteneur épinglable)

    /// UNE `Section` par groupe : les rangs en contenu, le sticker/header en
    /// `header:` — la forme qu'exige `pinnedViews: [.sectionHeaders]` (E4 : une
    /// restructuration du conteneur, pas un échange de vue). Le pliage garde
    /// exactement sa sémantique : il masque le CONTENU, jamais le header, donc
    /// une catégorie repliée conserve son sticker.
    private func sectionView(
        for group: (section: ConversationSection, conversations: [Conversation]),
        passContext: ConversationRowPassContext,
        trackedSectionId: String?
    ) -> some View {
        Section {
            ConversationListSectionRows(
                conversations: group.conversations,
                isVisible: isSectionContentVisible(group.section.id),
                listWidth: listColumnSize.width,
                focusCandidateRegistry: focusCandidateRegistry,
                onRowAppear: { conversation in
                    triggerLoadMoreIfNeeded(conversation: conversation)
                    noteVisibleSection(trackedSectionId)
                }
            ) { conversation, rowWidth in
                conversationRow(for: conversation, rowWidth: rowWidth, passContext: passContext)
            }
        } header: {
            ConversationListSectionHeader(
                section: group.section,
                conversations: group.conversations,
                isSingleUngroupedSection: isSingleUngroupedSection,
                expandedSections: expandedSections,
                dragOriginSectionId: dragOriginSectionId,
                dropTargetSection: $dropTargetSection,
                sectionFrameRegistry: sectionFrameRegistry,
                sectionPositionRegistry: sectionPositionRegistry,
                onToggleSection: toggleSection,
                onDropConversation: handleDrop
            )
        }
    }

    // MARK: - Pilule de section — TROISIÈME consommateur du signal existant

    /// `nil` ⇒ suivi éteint (drapeau OFF). Écriture gardée par l'inégalité :
    /// l'`onAppear` des rangs est un chemin chaud, et seule une FRONTIÈRE de
    /// section doit re-évaluer le body.
    private func noteVisibleSection(_ sectionId: String?) {
        guard let sectionId, visibleSectionId != sectionId else { return }
        visibleSectionId = sectionId
    }

    private func conversationRow(for conversation: Conversation, rowWidth: CGFloat, passContext: ConversationRowPassContext) -> some View {
        let community: MeeshyCommunity? = {
            guard conversation.type == .community || conversation.communityId != nil,
                  let communityId = conversation.communityId else { return nil }
            return userCommunityLookup[communityId] ?? userCommunities.first(where: { $0.id == communityId })
        }()

        var row = ConversationRowItem(
            conversation: conversation,
            community: community,
            rowWidth: rowWidth,
            isDragging: draggingConversationId == conversation.id,
            presenceState: presenceManager.presenceState(for: conversation.participantUserId ?? ""),
            isPeerHere: peerIsHere(in: conversation),
            isDark: theme.mode.isDark,
            storyRingState: storyRingState(for: conversation),
            moodStatus: conversationMoodStatus(for: conversation),
            typingUsername: conversationViewModel.typingUsernames[conversation.id],
            isSelected: selectedConversationId == conversation.id,
            draftSummary: conversationViewModel.draftSummaries[conversation.id],
            // B1 (Prisme Linguistique) — resolved once at row creation
            // time. Re-evaluates when AuthManager publishes a new currentUser
            // because the parent body re-runs on @Published changes.
            preferredContentLanguages: passContext.preferredContentLanguages,
            previewFingerprint: conversationViewModel.previewLoader.fingerprint(for: conversation.id),
            previewLoader: conversationViewModel.previewLoader,
            leadingActions: swipeActions.leadingSwipeActions(for: conversation),
            trailingActions: swipeActions.trailingSwipeActions(for: conversation),
            onViewStory: { handleStoryView(conversation) },
            onViewProfile: { handleProfileView(conversation) },
            onViewConversationInfo: { handleConversationInfoView(conversation) },
            onMoodBadgeTap: { anchor in handleMoodBadgeTap(conversation, at: anchor) },
            onCreateShareLink: canCreateShareLink(for: conversation) ? {
                sheetTargets.inviteSheet = conversation
            } : nil,
            onTap: { openConversation(conversation) },
            onLoadPreview: { await conversationViewModel.loadPreviewMessages(for: conversation.id, intent: $0) },
            enableAutoPreviewLoad: passContext.autoPreviewIds.contains(conversation.id),
            onLongPress: { sourceFrame in
                Task { await conversationViewModel.loadPreviewMessages(for: conversation.id, refresh: true) }
                // Montage au REPOS invisible (scale 1, offset 0, opacité 0) :
                // le GeometryReader de l'overlay mesure la frame de repos de
                // la carte, puis `runContextMenuEmergence` place la carte sur
                // la ligne pressée (toujours invisible) et anime l'émergence.
                // Annule une purge de fermeture encore en vol, sinon elle
                // effacerait ce menu fraîchement ouvert (~0.26 s plus tard).
                contextMenuDismissSettle.cancel()
                let wasMounted = sheetTargets.contextMenu != nil
                contextMenuAppeared = false
                contextMenuSourceFrame = sourceFrame.height > 0 ? sourceFrame : nil
                previewScale = 1.0
                previewEmergeOffset = 0
                dragOffsetY = 0
                dragOffsetX = 0
                chipModeLatched = false
                sheetTargets.contextMenu = conversation
                if wasMounted {
                    // Réouverture rapide : l'overlay est encore monté, donc
                    // `.onAppear` ne re-fire pas — sans relance ici le menu
                    // resterait invisible (contextMenuAppeared bloqué à false).
                    runContextMenuEmergence()
                }
            },
            // iOS 26+ : items du menu contextuel NATIF (Liquid Glass),
            // résolus UNE fois ici (valeur stable boxée — voir le doc de
            // `nativeContextMenu` dans ConversationRowItem : le builder
            // re-exécuté à chaque body pass crashait au lancement).
            nativeContextMenu: { nativeContextMenuView(for: conversation) },
            // Magasins PAR RÉFÉRENCE (jamais `focusElection.electedId` lu
            // ici : la garde `FocusCardElectionTests
            // .test_electedState_neverLivesInTheListBody` l'interdit, et
            // c'est ce qui empêche la liste entière de se ré-évaluer à chaque
            // élection).
            focusElection: focusElection,
            sceneActivity: sceneActivity,
            magnification: LentilleMagnification(
                isAnonymous: ConversationListReaderAnonymity.isAnonymous(currentUser: AuthManager.shared.currentUser),
                categories: conversationViewModel.userCategories,
                activeTagFilter: conversationViewModel.activeTagFilter,
                onMoveToSection: { sectionId in
                    HapticFeedback.light()
                    conversationViewModel.moveToSection(conversationId: conversation.id, sectionId: sectionId)
                },
                onFilterByTag: { tag in
                    HapticFeedback.light()
                    conversationViewModel.activeTagFilter = tag
                },
                onRemoveTag: { tag in
                    HapticFeedback.light()
                    // Même mutation que la feuille d'infos (optimiste + rollback).
                    ConversationOptionsViewModel(conversation: conversation).removeTag(tag.name)
                },
                onShowParticipants: {
                    HapticFeedback.light()
                    handleConversationInfoView(conversation)
                }
            )
        )
        row.onDragBegan = { token in beginConversationDrag(conversation.id, token: token) }
        return row
        .equatable()
        .meeshyPointerInteractive(shape: .roundedRect(cornerRadius: MeeshyRadius.lg))
        .overlay { KeyboardCursorRing(isActive: keyboardCursor == conversation.id, accentColor: conversation.accentColor) }
    }

    private func openConversation(_ conversation: Conversation) {
        guard ConversationLockManager.shared.isLocked(conversation.id) else { return onSelect(conversation) }
        lockSheetMode = .openConversation
        sheetTargets.lockSheet = conversation
    }

    private func openConversation(id: String) {
        conversationViewModel.groupedConversations.lazy.flatMap(\.conversations)
            .first { $0.id == id }.map(openConversation(_:))
    }

    private var swipeActions: ConversationSwipeActions {
        ConversationSwipeActions(
            viewModel: conversationViewModel,
            lockManager: lockManager,
            onLockRequest: { conversation, mode in
                lockSheetMode = mode
                sheetTargets.lockSheet = conversation
            },
            onMasterPinMissing: { showNoMasterPinAlert = true },
            onHide: { conversation in sheetTargets.deleteTarget = conversation }
        )
    }

    // Pagination footer now lives in `ConversationPaginationFooter`
    // (ConversationListView+Rows.swift).

    private func triggerLoadMoreIfNeeded(conversation: Conversation) {
        let all = conversationViewModel.conversations
        // Always-on infinite scroll: trigger `loadMore` as soon as the
        // user scrolls within 5 rows of the loaded tail. The 1000-
        // conversation gate that lived here assumed `fullSync()`
        // always succeeded for accounts below the cap, so `loadMore`
        // was reserved for power users. In practice, partial sync
        // failures stranded users at 50/88+ with no way to scroll
        // beyond the loaded chunk. `loadMore()` itself short-circuits
        // when `hasMore == false`, so calling it on every onAppear
        // past the threshold is safe.
        guard let idx = all.firstIndex(where: { $0.id == conversation.id }) else { return }
        let threshold = max(0, all.count - 5)
        if idx >= threshold {
            Task { await conversationViewModel.loadMore() }
        }
    }

    private func toggleSection(_ sectionId: String) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            if expandedSections.contains(sectionId) {
                expandedSections.remove(sectionId)
            } else {
                expandedSections.insert(sectionId)
            }
        }
        HapticFeedback.light()
        let isUserCategory = conversationViewModel.userCategories.contains(where: { $0.id == sectionId })
        if isUserCategory {
            conversationViewModel.persistCategoryExpansion(id: sectionId, isExpanded: expandedSections.contains(sectionId))
        }
    }

    var body: some View {
        mainContent
            .adaptiveOnChange(of: selectedProfileUser) { _, newValue in
                if let user = newValue {
                    selectedProfileUser = nil
                    router.deepLinkProfileUser = user
                }
            }
            .modifier(ConversationListCreationSheets(
                sheetTargets: $sheetTargets,
                showStatusComposer: $showStatusComposer,
                showCreateAffiliate: $showCreateAffiliate,
                showCreateTrackingLink: $showCreateTrackingLink
            ))
    }

    /// `AnyView` à la DÉCLARATION (2026-08-19). Chaîne `body → mainContent →
    /// mainContentZStack` : 56 niveaux d'imbrication de type concret, résolus
    /// en UNE fois par le décodeur de métadonnées RÉCURSIF du runtime Swift au
    /// 1er rendu — ~17 Ko de pile par niveau. Un `.ips` device du 2026-08-17
    /// (`Meeshy-2026-08-17-161136`) meurt dans cette chaîne. Éraser CHAQUE
    /// maillon borne chaque matérialisation à sa propre couche.
    /// Voir `ConversationViewBodyTypeDepthTests`.
    private var mainContent: AnyView {
        AnyView(
        mainContentZStack
            .adaptiveOnChange(of: isScrollingDown) { wasHidden, isHidden in
                if !wasHidden && isHidden { isSearching = false } // la bande suit le focus (#10841)
            }
            .onAppear {
                withAnimation(.easeOut(duration: 0.25)) { isScrollingDown = false }
            }
            .task {
                async let conversations: Void = ConversationListVMOwner.loadAtLaunch(conversationViewModel)
                async let communities: Void = loadUserCommunities()
                _ = await (conversations, communities)
            }
            .adaptiveOnChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    conversationViewModel.handleForegroundReturn()
                    conversationViewModel.handleForegroundReactivation()
                }
            }
            // iPad : la liste se REMONTE à chaque changement de colonne — au montage aussi, les catégories persistées
            // se déplient, et les sections suivent la mémoire de session (`ConversationListSectionMemory`).
            .adaptiveOnChange(of: conversationViewModel.userCategories, initial: true) { _, categories in
                for cat in categories where cat.isExpanded { expandedSections.insert(cat.id) }
            }
            .adaptiveOnChange(of: expandedSections) { _, sections in ConversationListSectionMemory.shared.remember(sections) }
            .adaptiveOnChange(of: conversationViewModel.groupedConversations.isEmpty) { _, isEmpty in
                if isEmpty && isScrollingDown {
                    withAnimation(.easeOut(duration: 0.25)) { isScrollingDown = false }
                }
            }
            .adaptiveOnChange(of: conversationViewModel.selectedFilters) { _, _ in
                withAnimation(.easeOut(duration: 0.25)) { isScrollingDown = false }
            }
            .adaptiveOnChange(of: feedIsVisible) { wasVisible, isVisible in
                if wasVisible && !isVisible {
                    withAnimation(.easeOut(duration: 0.25)) { isScrollingDown = false }
                }
            }
            .overlay { conversationContextMenuOverlay }
            .modifier(ConversationListModalPresentations(
                sheetTargets: $sheetTargets,
                lockSheetMode: $lockSheetMode,
                showNoMasterPinAlert: $showNoMasterPinAlert,
                renameText: $renameText,
                showWidgetPreview: $showWidgetPreview,
                showGlobalSearch: $showGlobalSearch,
                onSelect: onSelect,
                onNewConversation: onNewConversation
            ))
            // Les confirmations s'ancrent sur un POINT de la liste (`listConfirmationAnchor`) : posées sur la vue
            // entière, elles devenaient sur iPad un popover ancré à la colonne, présenté sur la conversation voisine.
            .overlay { listConfirmationAnchor }
        )
    }

    /// Drapeau OFF ⇒ AUCUNE pilule (rendu identique à aujourd'hui). Sous ON, la
    /// pilule est montée dès qu'il existe une section à nommer et reste dans
    /// l'arbre : c'est son opacité qui bascule, sinon le fondu de 250 ms n'a
    /// rien à animer (une vue démontée n'a pas d'état d'où partir).
    /// **RETIRÉE** (directive produit 2026-08-23) : « on n'a pas besoin de
    /// sticker de section central, car les sections stick sur place quand on
    /// les dépasse ».
    ///
    /// Le doublon était systématique, pas accidentel. La pilule n'avait aucune
    /// règle de coexistence avec le sticker : sa visibilité tient à la seule
    /// loi de défilement — visible au premier événement d'offset, invisible
    /// 900 ms après le dernier. Or « on défile » est EXACTEMENT l'état où un
    /// sticker est épinglé. Mesuré : sticker « MEESHY TEAM » à (0, 122.0,
    /// 402×21.3) et capsule portant le MÊME mot à (160.0, 130.0, 82×13.3),
    /// soit 81 % de recouvrement de la bande, pour zéro information de plus.
    ///
    /// `SectionScrollPill` et `SectionScrollPillHost` restent dans l'arbre
    /// Xcode : les supprimer touche `project.pbxproj`, geste à faire à froid.
    /// Ils sont donc du code NON MONTÉ, et `SectionScrollPillTests`
    /// `test_sectionPill_isNoLongerMounted_…` garde ce retrait.
    @ViewBuilder
    private var sectionScrollPillOverlay: some View {
        EmptyView()
    }

    private var mainContentZStack: AnyView {
        AnyView(
        ZStack(alignment: .bottom) {
            // Layer 1: Full-screen scroll content
            // Wrapper Meeshy : `.refreshable` natif iOS + indicator brand
            // anime (logo dashes + degrade indigo). Le contenu est insere
            // tel quel, le wrapper s'occupe du sentinel scrollOffset, du
            // MeeshyPullIndicator au top, des haptics et de l'orchestration
            // de la sequence pull -> armed -> refreshing -> completing -> idle.
            // The scroll subtree's type is kept small by the nominal
            // ConversationRowItem / ConversationPaginationFooter structs
            // (ConversationListView+Rows.swift) — no AnyView seam needed.
            MeeshyRefreshableScroll(
                onRefresh: {
                    async let convRefresh: Void = conversationViewModel.pullToRefresh()
                    async let storyRefresh: Void = storyViewModel.loadStories(forceNetwork: true)
                    async let statusRefresh: Void = statusViewModel.refresh()
                    async let communitiesRefresh: Void = loadUserCommunities()
                    _ = await (convRefresh, storyRefresh, statusRefresh, communitiesRefresh)
                },
                coordinateSpaceName: "scroll",
                onScrollOffsetChange: { offset in
                    scrollOffsetRelay.offset = offset
                    guard !isSearching, !showSearchOverlay else { return }
                    // #11036 — la barre suit le SENS (hystérésis : rebond absorbé) ; seule une bascule écrit l'état publié.
                    let next = ConversationSearchBarScrollLaw.next(
                        .init(hidden: isScrollingDown, anchor: searchBarScrollAnchor.value),
                        offset: offset
                    )
                    searchBarScrollAnchor.value = next.anchor
                    if next.hidden != isScrollingDown { isScrollingDown = next.hidden }
                },
                topPadding: ConversationListScrollChrome.contentTopPadding
            ) {
                VStack(spacing: 0) {
                    // Story carousel — sous drapeau Lentille, le rail « vivants
                    // & stories » (contrat LWS-6 travail 5 : fusion du tray et
                    // des vivants, ≤ 6 entrées, masqué si vide) prend sa place.
                    // Le ROUTAGE du tap est le même des deux côtés :
                    // `onStoryViewRequest?(userId, true)`.
                    ConversationListStoryRail(onStoryViewRequest: onStoryViewRequest, showStatusComposer: $showStatusComposer)

                    // Les filtres, SOUS le rail et en petit (#4069). Ils
                    // vivaient dans le panneau de l'overlay de recherche, donc
                    // derrière un tap sur la loupe : le filtrage utile — le
                    // croisé — était à la fois invisible et impossible.
                    ConversationListFilterChipRow(selectedFilters: $conversationViewModel.selectedFilters)

                    // Sectioned conversation list (skeleton -> content -> empty/error).
                    // Skeleton ONLY when cold-start with no cached groups —
                    // cache-first principle: any cached/stale data must
                    // render immediately, no skeleton on top of it.
                    // `Self.emptyBranch` distinguishes cold-start `.idle` (show
                    // skeleton, not the "créez-en une" CTA — it used to flash
                    // for a frame before `loadConversations()`'s first `await`
                    // even flips `loadState` to `.loading`) from an ACTIVE
                    // search with zero matches (dedicated "no results" state,
                    // never the misleading "you have no conversations" CTA).
                    if let emptyBranch = currentEmptyBranch {
                        ConversationListEmptyState(
                            branch: emptyBranch,
                            onNewConversation: onNewConversation,
                            onRetry: { Task { await conversationViewModel.forceRefresh() } }
                        )
                    } else {
                        sectionsContent
                            .transition(.opacity)

                        // Pagination footer driven by `paginationState`.
                        // - .loadingMore: spinner while a page is in flight
                        // - .exhausted:   discreet "all loaded" hint once
                        //                 the gateway signalled hasMore=false
                        //                 (only shown for non-trivial lists)
                        // - .error:       inline retry button (transient
                        //                 errors keep hasMore=true)
                        // - .idle:        invisible spacer that triggers
                        //                 loadMore via onAppear once the
                        //                 user reaches the tail (back-up to
                        //                 the per-row threshold trigger)
                        //
                        // Rendered ONLY inside this `else` (non-empty list): an
                        // empty list already surfaces its OWN error/empty state
                        // — the `.syncError` branch above carries its own big
                        // "Retry" (forceRefresh). Rendering the pagination
                        // footer alongside it stacked a SECOND "Couldn't load
                        // more / Retry" (paginationState `.error` → loadMore) on
                        // a cold-start sync failure — the duplicate-retry bug.
                        // Pagination is only meaningful when there is content to
                        // page through.
                        ConversationPaginationFooter()
                    }

                    // Queue de liste (2026-08-21) : les accès rapides, hauts
                    // d'une DEMI-région visible — de quoi amener la dernière
                    // conversation jusqu'à la bande de focus au centre de
                    // l'écran (sans cette queue, la magnificence ne touchait
                    // jamais la fin de la liste). Drapeau OFF : queue neutre.
                    ConversationListTail(
                        emptyBranch: currentEmptyBranch,
                        listColumnSize: listColumnSize,
                        onNewConversation: onNewConversation,
                        showStatusComposer: $showStatusComposer,
                        showCreateAffiliate: $showCreateAffiliate,
                        showCreateTrackingLink: $showCreateTrackingLink
                    )
                    .adaptiveOnChange(of: draggingConversationId) { oldValue, newValue in
                        if oldValue != nil && newValue == nil {
                            withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
                                dropTargetSection = nil
                            }
                        }
                    }
                }
                .padding(.top, MeeshySpacing.sm)
                .padding(.bottom, 80)
            }
            .modifier(ConversationListScrollChrome(
                sectionPositionRegistry: sectionPositionRegistry,
                listColumnSize: $listColumnSize,
                scrollOffsetRelay: scrollOffsetRelay,
                focusCandidateRegistry: focusCandidateRegistry,
                focusElection: focusElection,
                sceneActivity: sceneActivity
            ))

            // Layer 2: Bottom overlay — Search bar + Communities & Filters
            ConversationListBottomBar(
                showSearchOverlay: $showSearchOverlay,
                isSearching: $isSearching,
                showWidgetPreview: $showWidgetPreview,
                showGlobalSearch: $showGlobalSearch,
                userCommunities: userCommunities
            )
            .padding(.bottom, MeeshySpacing.sm)
            // Hide on scroll down
            .offset(y: isScrollingDown ? 150 : 0)
            .opacity(isScrollingDown ? 0 : 1)
            .animation(.easeOut(duration: 0.25), value: isScrollingDown)
            .animation(.easeOut(duration: 0.25), value: showSearchOverlay)
        }
        // Layer 3: Collapsible header overlay — pinned to top, respects safe area.
        // La trail compacte prend la PLACE DU TITRE dans la barre et se révèle à
        // mesure que la grande trail passe sous le header : une fois scrollé, on
        // ne lit plus « Meeshy Chats » mais la trail (directive user 2026-08-13).
        .overlay(alignment: .top) {
            ConversationListHeaderOverlay(
                scrollRelay: scrollOffsetRelay,
                iPadFeedAction: iPadFeedAction,
                iPadNotificationCount: iPadNotificationCount,
                onNotificationsTap: onNotificationsTap,
                onSettingsTap: onSettingsTap,
                onNewConversation: onNewConversation,
                showShareLinkSheet: $showShareLinkSheet,
                // Paramétré par l'offset (fourni par le header, seul abonné
                // au relay) — capturer le @State CGFloat d'antan depuis cette
                // closure liait le body entier de la liste au tick de scroll.
                titleAccessory: { offset in
                    AnyView(
                        PinnedStoryTrailBand(
                            viewModel: storyViewModel,
                            scrollOffset: offset,
                            onViewStory: { userId in onStoryViewRequest?(userId, true) }
                        )
                    )
                }
            )
        }
        // Layer 4 : pilule de section (drapeau Lentille). Posée APRÈS le header
        // pour passer au-dessus de lui — son ancrage `top 64` la place juste
        // sous la barre déployée (`LentilleMetrics.Pill.top`, §4.3). Elle ne
        // capte aucun geste (`allowsHitTesting(false)` dans la vue) et
        // n'observe rien : `isSectionPillVisible` est décidé par la loi
        // partagée, `visibleSectionId` par l'`onAppear` des rangs.
        .overlay(alignment: .top) {
            sectionScrollPillOverlay
        }
        .environmentObject(sceneActivity)
        .sheet(isPresented: $showShareLinkSheet) {
            ShareLinkPickerSheet(
                conversations: conversationViewModel.conversations.filter { canCreateShareLink(for: $0) },
                onSelect: { conversation in
                    showShareLinkSheet = false
                    sheetTargets.inviteSheet = conversation
                }
            )
        }
        )
    }

    // MARK: - Handle Story View
    private func handleStoryView(_ conversation: Conversation) {
        // Lookup par userId uniquement — l'ancien fallback par display name
        // (`$0.username == conversation.name`) ouvrait la story d'un homonyme
        // ou cassait dès que l'utilisateur renommait son profil.
        guard conversation.type == .direct,
              let userId = conversation.participantUserId,
              storyViewModel.hasStories(forUserId: userId) else { return }
        onStoryViewRequest?(userId, false)
    }

    // MARK: - Handle Profile View
    func handleProfileView(_ conversation: Conversation) {
        // Open user profile sheet (works for DM, uses participant data)
        selectedProfileUser = .from(conversation: conversation)
    }

    // MARK: - Handle Conversation Info View
    private func handleConversationInfoView(_ conversation: Conversation) {
        // Open conversation info sheet (works for all conversation types)
        sheetTargets.info = conversation
    }

    // MARK: - Handle Mood Badge Tap (opens status bubble)
    private func handleMoodBadgeTap(_ conversation: Conversation, at anchor: CGPoint) {
        guard conversation.type == .direct,
              let userId = conversation.participantUserId,
              let status = statusViewModel.statusForUser(userId: userId) else { return }
        StatusBubbleController.shared.show(entry: status, anchor: anchor)
    }

    // See ConversationListView+Overlays.swift for conversationContextMenuOverlay

    // MARK: - Handle Drop
    /// Drop du drag NATIF (`.onDrag`, chemin iOS 26) sur un header de
    /// section. L'id de la conversation voyage dans le NSItemProvider (pas
    /// d'état de drag à poser/purger : un drag annulé ne laisse rien
    /// derrière). Décision via `ChipDropResolver` — MÊME sémantique que le
    /// drop de la chip du morph custom : « Épingles » épingle (jamais de
    /// dés-épinglage par drop), « other » → sectionId vide, no-op même
    /// section.
    /// Le glisser d'une conversation commence : toutes les catégories se replient — la cible se vise d'un coup
    /// d'œil —, et celle d'origine se marque.
    private func beginConversationDrag(_ conversationId: String, token: UUID) {
        DispatchQueue.main.async {
            pendingDrag = PendingConversationDrag(
                token: token,
                originSectionId: conversationViewModel.groupedConversations
                    .first { $0.conversations.contains { $0.id == conversationId } }?.section.id
            )
        }
    }

    /// Le doigt bouge au-dessus de la liste : on replie tout et on marque l'origine.
    private func collapseForConversationDrag() {
        guard let pendingDrag, sectionsBeforeDrag == nil else { return }
        sectionsBeforeDrag = expandedSections
        dragOriginSectionId = pendingDrag.originSectionId
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            expandedSections = []
        }
    }

    /// Dépôt ou annulation : les catégories dépliées avant le glisser le redeviennent, plus celles qu'on aurait
    /// dépliées pendant, plus la catégorie qui vient de recevoir la conversation. Sans persistance — le repli du
    /// glisser n'est pas un choix de l'utilisateur. Une fin portant le jeton d'un AUTRE glisser est ignorée.
    private func endConversationDrag(token: UUID? = nil, expanding target: String? = nil) {
        if let token, token != pendingDrag?.token { return }
        pendingDrag = nil
        guard let before = sectionsBeforeDrag else {
            dragOriginSectionId = nil
            return
        }
        sectionsBeforeDrag = nil
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            var restored = before.union(expandedSections)
            if let target, !target.isEmpty { restored.insert(target) }
            expandedSections = restored
            dragOriginSectionId = nil
            dropTargetSection = nil
        }
    }

    private func handleDrop(to sectionId: String, providers: [NSItemProvider]) -> Bool {
        defer { endConversationDrag(expanding: sectionId) }
        guard ConversationSectionDropHandler.resolve(providers, onto: sectionId, viewModel: conversationViewModel) else { return false }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            dropTargetSection = nil
        }
        return true
    }

    // MARK: - Load Communities
    private func loadUserCommunities() async {
        await ConversationListCommunitiesLoader.load(apply: applyCommunities)
    }

    /// Maps API payloads to the domain `MeeshyCommunity` type and updates
    /// both the array and the id-keyed lookup the rows consume. Pulled out
    /// so the cache-first switch in `loadUserCommunities` stays readable
    /// and the same transform is reused across the fresh / stale / network
    /// branches.
    private func applyCommunities(_ apiCommunities: [APICommunity]) {
        let mapped = apiCommunities.map { $0.toCommunity() }
        userCommunities = mapped
        userCommunityLookup = Dictionary(mapped.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }

    // communitiesSection, categoryFilters, themedSearchBar now live in
    // ConversationListBottomBar (ConversationListView+Overlays.swift).

    // Pull-to-refresh entierement gere par MeeshyRefreshableScroll.
    // Voir Layer 1 dans `mainContentZStack`.
}
