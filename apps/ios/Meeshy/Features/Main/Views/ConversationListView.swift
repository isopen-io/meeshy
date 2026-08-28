import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

// MARK: - Section Frame Registry

/// Boîte mutable INERTE : les GeometryReader des headers de section y écrivent
/// leur frame globale à chaque layout (scroll compris) sans déclencher
/// d'invalidation SwiftUI — une @State [String: CGRect] re-évaluerait la liste
/// à chaque tick. Le morph drag de l'overlay (+Overlays) hit-teste le doigt
/// contre ces frames pour surligner puis résoudre la section de drop.
final class SectionFrameRegistry {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    var frames: [String: CGRect] = [:]
}

// MARK: - Section Drop Delegate

/// Cible de drop d'un header de section pour le drag NATIF des lignes
/// (`.onDrag`, chemin iOS 26). Le delegate ne fait que l'affordance et le
/// forwarding — la DÉCISION (pin par drop sur « Épingles », « other » → "",
/// no-op même section) appartient à `handleDrop` via `ChipDropResolver`,
/// même sémantique que le drop de la chip du morph custom < iOS 26.
/// « Épingles » est une cible VALIDE (parité chip : drop = épingler ; le
/// retrait reste l'action dédiée du menu — jamais de dés-épinglage par drop).
struct SectionDropDelegate: DropDelegate {
    let sectionId: String
    /// `false` pour une section CALCULÉE par la loi Lentille (`EN DIRECT`,
    /// `AUJOURD'HUI`…) : sa borne vient de `lastMessageAt`, elle n'est pas
    /// assignable, et `ChipDropResolver` traduirait son id en
    /// `moveToSection(sectionId:)` — soit une catégorie fantôme dans l'état
    /// utilisateur. Le refus vit ICI, dans `validateDrop` : SwiftUI n'appelle
    /// alors ni `dropEntered` (pas de surbrillance, pas d'haptique) ni
    /// `performDrop`. Défaut `true` ⇒ chemin d'aujourd'hui (drapeau OFF,
    /// `pinned`, catégories utilisateur, `other`) strictement inchangé.
    var acceptsDrop: Bool = true
    @Binding var dropTargetSection: String?
    let onDrop: ([NSItemProvider]) -> Bool

    func validateDrop(info: DropInfo) -> Bool {
        acceptsDrop && info.hasItemsConforming(to: [.text])
    }

    func dropEntered(info: DropInfo) {
        withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
            dropTargetSection = sectionId
        }
        HapticFeedback.light()
    }

    func dropExited(info: DropInfo) {
        withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
            if dropTargetSection == sectionId {
                dropTargetSection = nil
            }
        }
    }

    func dropUpdated(info: DropInfo) -> DropProposal? {
        DropProposal(operation: .move)
    }

    func performDrop(info: DropInfo) -> Bool {
        onDrop(info.itemProviders(for: [.text]))
    }
}

// MARK: - Conversation List Empty Branch

/// Distinguishes `ConversationListView`'s possible "nothing to render"
/// branches so the CORRECT placeholder is picked — only relevant once
/// `groupedConversations` is already known empty. Pure/`nonisolated` (no
/// SwiftUI/MainActor dependency) so it's directly unit-testable (audit
/// 2026-07-20: the "créez-en une" CTA flashed during cold-start `.idle` —
/// skeleton was gated strictly on `.loading` — and reused verbatim for an
/// ACTIVE search with zero matches, misleadingly implying zero
/// conversations). `loadState` is resolved BEFORE the search branch (fix
/// 2026-07-21): `.idle`/`.loading` ONLY occur while the cold, cache-less
/// first fetch is in flight (`ConversationListViewModel.performLoadConversations`'s
/// `.expired`-with-nothing-recovered / `.empty` branches) — the search field
/// is always focusable, so a user typing during that window must still see
/// the cache-first skeleton, never a definitive "no results for your
/// search" (a still-loading state is not a result). Once the load has
/// settled (`.loaded`/`.offline`/`.error`/`.cachedFresh`/`.cachedStale`),
/// an active search with zero matches takes priority over every other
/// state. Top-level (not nested) — matches this codebase's established
/// `nonisolated enum` placement convention.
nonisolated enum ConversationListEmptyBranch: Equatable {
    case skeleton
    case searchNoResults
    case syncError
    case createFirstConversation
}

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
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
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
    private var blockService: BlockService { BlockService.shared }
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
    @State private var animateGradient = false
    @State private var expandedSections: Set<String> = ["pinned", "other"]

    // Scroll tracking
    @State private var hideSearchBar = false

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
    @State private var lastScrollDirectionChange: Date = .distantPast

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
    // signal booléen ne bascule qu'aux changements de sens, throttlés à 0,15 s,
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
    @State var blockTargetConversation: Conversation? = nil
    @State var showBlockConfirmation = false
    /// Cible de la demande de suppression (menu custom ou swipe « hide »).
    /// Tout callback destructif passe par le confirmationDialog système —
    /// jamais d'appel direct à `deleteConversation` depuis un menu.
    @State var deleteTargetConversation: Conversation? = nil
    @State var lockSheetMode: ConversationLockSheet.Mode = .lockConversation
    @State var lockSheetConversation: Conversation? = nil
    @State var showNoMasterPinAlert = false
    @State var showGlobalSearch = false
    @State var conversationInfoConversation: Conversation? = nil
    
    // Widget preview state
    @State var showWidgetPreview = false
    @State private var showShareLinkSheet = false

    // Invite sheet
    @State var inviteSheetConversation: Conversation? = nil

    // Communities data
    @State var userCommunities: [MeeshyCommunity] = []

    // Preview state for hard press
    @State private var previewConversation: Conversation? = nil

    /// Conversation dont l'overlay de menu contextuel custom est présenté
    /// (appui long). Menu custom qui dessine ses icônes — le `.contextMenu`
    /// natif ne les affiche pas sur iOS 26.
    @State var contextMenuConversation: Conversation? = nil
    /// Pilote l'animation zoom + rebond de l'overlay (false au montage → true
    /// via `.onAppear` ; false à la fermeture). Voir `conversationContextMenuOverlay`.
    @State var contextMenuAppeared = false
    /// Purge différée annulable de l'overlay (voir `dismissContextMenu`). Conservée
    /// pour l'annuler si une nouvelle ouverture survient avant la fin du zoom-out,
    /// sinon la purge en vol effacerait le menu qui vient de se rouvrir.
    @State var contextMenuDismissWork: DispatchWorkItem? = nil
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
    @State var renameTarget: Conversation? = nil
    @State var renameText: String = ""

    // Drag & Drop : le `.onDrag` natif est RÉACTIVÉ sur le chemin iOS 26
    // (2026-07-11) — il coexiste avec le `.contextMenu` système ; c'était le
    // long-press CUSTOM du fallback qu'il cassait (135af8f2), il reste donc
    // absent de la branche < iOS 26 (qui garde le morph chip de l'overlay).
    // L'id voyage dans le NSItemProvider : `draggingConversation` n'est plus
    // posé par personne (un drag annulé ne laisse aucun état) — conservé
    // uniquement pour le plumbing `isDragging` des rows (poignée dédiée /
    // mode édition futur).
    @State private var draggingConversation: Conversation? = nil
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

    // MARK: - Empty Branch Resolution

    nonisolated static func emptyBranch(
        loadState: LoadState,
        loadFailed: Bool,
        searchTextIsEmpty: Bool
    ) -> ConversationListEmptyBranch {
        switch loadState {
        case .idle, .loading:
            // Cold, cache-less first fetch still in flight: a still-loading
            // state is never a definitive result, so this wins over an
            // active search — never show "no results" while we don't yet
            // know whether the cache is genuinely empty (fix 2026-07-21).
            return .skeleton
        default:
            guard searchTextIsEmpty else { return .searchNoResults }
            return loadFailed ? .syncError : .createFirstConversation
        }
    }

    // MARK: - Preview Auto-Load Eligibility
    //
    // Pure/testable (no SwiftUI/MainActor dependency) — same `firstIndex`
    // scan shape as `triggerLoadMoreIfNeeded` below, but NOT the same call
    // cadence: `triggerLoadMoreIfNeeded` fires from `.onAppear` (once per
    // scroll-triggered row appearance), while this runs on every
    // `conversationRow` body evaluation for every on-screen row — including
    // re-renders driven by `presencePulse`. The caller (`sectionsContent`)
    // hoists the `orderedConversationIds` array build to ONCE per body pass
    // instead of once per row to keep that repeated cost bounded. Gates
    // `ConversationRowItem.enableAutoPreviewLoad` to the first `limit`
    // entries of `orderedConversationIds` — the caller MUST pass the
    // actually-rendered order (flattened `groupedConversations`), never the
    // raw unfiltered/ungrouped `conversationViewModel.conversations`: a
    // filtered/sectioned view's visible rows can fall entirely outside the
    // full-account top-20 by recency, permanently starving their auto-load
    // (fix 2026-07-21; audit 2026-07-20 introduced the limit itself: every
    // row firing its preview-prefetch `.task` on appear meant 1 REST call
    // per newly-visible row on a cold cache).
    nonisolated static func shouldAutoLoadPreview(
        conversationId: String,
        orderedConversationIds: [String],
        limit: Int
    ) -> Bool {
        guard limit > 0, let idx = orderedConversationIds.firstIndex(of: conversationId) else { return false }
        return idx < limit
    }

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
        // Sonde inerte : capture l'UIScrollView hôte pour l'auto-scroll de
        // bord du drag de chip (+Overlays). Aucune interaction, frame nulle.
        .background(ChipAutoScrollGrabber(driver: chipAutoScrollDriver))
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
        conversationViewModel.groupedConversations.count == 1
        && conversationViewModel.groupedConversations[0].section.id == "other"
    }

    // MARK: - Sections : pliage et cible de drop (règles PURES)

    /// Une section repliable est une section dont le pliage a un SENS
    /// PERSISTANT : `pinned` et les catégories utilisateur, dont
    /// `toggleSection` persiste l'état (`persistCategoryExpansion`, E4). Les
    /// sections calculées par la loi Lentille (`EN DIRECT`, `AUJOURD'HUI`…) ne
    /// sont persistées nulle part : repliées, elles se rouvriraient au
    /// prochain chargement. Elles restent donc dépliées et leur sticker n'est
    /// pas un bouton. Drapeau OFF : aucun id `lentille.` n'existe ⇒ toujours
    /// `true`, exactement comme aujourd'hui.
    nonisolated static func isSectionCollapsible(sectionId: String) -> Bool {
        !LentilleSectionIdentity.isLentilleOnly(sectionId: sectionId)
    }

    /// Cible de drop légitime. Même partition que `isSectionCollapsible` — une
    /// section calculée n'est ni pliable ni assignable — mais les deux règles
    /// restent distinctes : elles répondent à deux questions (« puis-je la
    /// replier ? », « puis-je y déposer ? ») qui pourraient diverger demain.
    nonisolated static func acceptsSectionDrop(sectionId: String) -> Bool {
        !LentilleSectionIdentity.isLentilleOnly(sectionId: sectionId)
    }

    /// Rangs visibles ? Réécriture PURE et testable de la condition
    /// d'aujourd'hui (`isSingleUngroupedSection || expandedSections.contains`),
    /// étendue du seul cas neuf : une section non repliable est toujours
    /// dépliée. Sous drapeau OFF la troisième clause est inatteignable — la
    /// condition dégénère au bit près en celle d'avant LWS-6.
    nonisolated static func isSectionContentVisible(
        sectionId: String,
        expandedSections: Set<String>,
        isSingleUngroupedSection: Bool
    ) -> Bool {
        if isSingleUngroupedSection { return true }
        if !isSectionCollapsible(sectionId: sectionId) { return true }
        return expandedSections.contains(sectionId)
    }

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
            sectionContent(for: group, passContext: passContext, trackedSectionId: trackedSectionId)
        } header: {
            sectionHeader(for: group)
        }
    }

    @ViewBuilder
    private func sectionContent(
        for group: (section: ConversationSection, conversations: [Conversation]),
        passContext: ConversationRowPassContext,
        trackedSectionId: String?
    ) -> some View {
        // Section Content — always visible when no categories, otherwise animated expand/collapse
        if isSectionContentVisible(group.section.id) {
            sectionConversations(group.conversations, passContext: passContext, trackedSectionId: trackedSectionId)
                // **Le jeton, jamais un littéral** (retour produit 2026-08-22 :
                // « la liste de conversation semble décalée »). Ce `16` en dur
                // mettait les rangées à 16 pt du bord quand la cote de design
                // dit 8 (`list.row.marginHorizontal`,
                // `LentilleMetrics.Row.marginHorizontal`) — celle que lisent
                // la carte de focus qui les magnifie et le rail. Les rangées
                // étaient donc décalées de 8 pt par rapport à tout ce qui les
                // encadre : c'est ce décalage-là que l'œil voyait.
                .padding(.horizontal, LentilleMetrics.Row.marginHorizontal)
                .transition(.asymmetric(
                    insertion: .opacity.combined(with: .scale(scale: 0.95, anchor: .top)).combined(with: .offset(y: -8)),
                    removal: .opacity.combined(with: .scale(scale: 0.98, anchor: .top))
                ))
        }
    }

    /// Le header de section — UNE seule vue logique, quelle que soit la peau :
    /// le registre de frames et le `.onDrop` sont posés ICI, autour du mux, et
    /// jamais dans l'une des deux branches. C'est la garde du contrat
    /// (« le `.onDrop` doit rester sur la MÊME vue logique, sinon la cible de
    /// drop se décale d'une section ») : un seul site de câblage, donc aucun
    /// décalage possible entre la vue qui affiche la section *n* et celle qui
    /// reçoit son drop.
    @ViewBuilder
    private func sectionHeader(
        for group: (section: ConversationSection, conversations: [Conversation])
    ) -> some View {
        // Hide section header when there are no user categories (flat list)
        if !isSingleUngroupedSection {
            sectionHeaderLabel(for: group)
                // Frame globale du header → registre inerte : cible de drop de la
                // chip du morph drag (l'overlay hit-teste le doigt au relâchement).
                .background(
                    GeometryReader { geo in
                        Color.clear
                            .onAppear { registerSectionFrame(group.section.id, geo.frame(in: .global)) }
                            .adaptiveOnChange(of: geo.frame(in: .global)) { _, frame in
                                registerSectionFrame(group.section.id, frame)
                            }
                    }
                )
                .onDrop(of: [.text], delegate: SectionDropDelegate(
                    sectionId: group.section.id,
                    acceptsDrop: Self.acceptsSectionDrop(sectionId: group.section.id),
                    dropTargetSection: $dropTargetSection,
                    onDrop: { handleDrop(to: group.section.id, providers: $0) }
                ))
        }
    }

    /// Mux de peau du header — et RIEN d'autre : ni drop, ni mesure (posés par
    /// l'appelant). Sous drapeau OFF, `SectionHeaderView` et ses deux paddings,
    /// dans le même ordre qu'avant LWS-6.
    @ViewBuilder
    private func sectionHeaderLabel(
        for group: (section: ConversationSection, conversations: [Conversation])
    ) -> some View {
        if LentilleFeatureFlag.isLentilleListEnabled {
            // Pleine largeur, sans marge latérale — et la RAISON n'est pas
            // celle qui était écrite ici. L'ancien motif (« sinon les rangs
            // réapparaissent dans les gouttières ») ne peut pas se produire :
            // la perspective ne fait que RÉTRÉCIR (`listScaleDecay = 0.04`,
            // `scale = 1 − 0.04f ≤ 1`, ancrée), et la carte de focus est bornée
            // à la même laisse (`geo.size.width - 2 * Row.marginHorizontal`) ;
            // rien n'occupe jamais ces 8 pt. Le vrai motif est la PARITÉ avec la
            // peau web, qui fait le même choix indépendamment —
            // `LentilleSticker.tsx` est `sticky top-0` pleine largeur du
            // conteneur pendant que `LentilleRow.tsx` porte
            // `marginLeft/Right: var(--lentille-list-row-margin-horizontal)`.
            // Deux implémentations concordantes = délibération, pas oubli.
            // Les cotes (10.5/800/.1em, padding 4/13) vivent dans
            // `LentilleMetrics.Sticker`, jamais ici (garde R15).
            LentilleSticker(
                title: group.section.name,
                isExpanded: isSectionContentVisible(group.section.id),
                onToggle: sectionToggle(for: group.section.id)
            )
            // D7 — DIAGNOSTIQUÉ, NON CORRIGÉ ICI : le correctif demande un
            // arbitrage produit. La respiration (`LentilleFocusBreathing`)
            // écarte les voisines de la rangée élue de ±18 pt, mais elle est
            // posée sur les RANGS SEULS (`sectionConversations`) et jamais sur
            // ce sticker : la marge de 8 pt est donc mangée et le header mord
            // la rangée précédente. Mesuré à deux frontières, deux relevés
            // indépendants : 9,6 / 8,9 puis 9,2 / 9,1 pt, et l'arithmétique
            // boucle — 18 − 8 − (88 − h)/2 = 9,6 pour h = 87,3. Ce n'est PAS
            // l'échelle : elle rétrécit autour du midY, donc elle éloigne les
            // bords de leurs voisins et ne peut mécaniquement pas mordre un
            // header.
            //
            // Poser la même loi ICI a été essayé et REJETÉ par la mesure : sur
            // un sticker ÉPINGLÉ, l'`.offset` étend le cadre d'accessibilité de
            // façon durable (h 21,3 → 39,3 pendant toute la scène, encore à
            // 3 s), ce qui rend la géométrie de l'épinglage inintelligible.
            // Les deux issues restantes amoindrissent ou déplacent un réglage
            // produit — écrêter la respiration à la marge (18 → 8, effet
            // réduit) ou porter le gap de section à 18 (densité réduite) —
            // d'où l'arbitrage.
            // Position vivante du sticker → registre inerte de la pilule (la
            // section épinglée = le sticker le plus haut). `onGeometryChange`
            // ne monte aucune vue de plus, contrairement à un `GeometryReader`.
            .onGeometryChange(for: CGFloat.self) { proxy in
                proxy.frame(in: .global).minY
            } action: { minY in
                sectionPositionRegistry.register(id: group.section.id, minY: minY)
            }
            .onDisappear { sectionPositionRegistry.unregister(id: group.section.id) }
        } else {
            SectionHeaderView(
                section: group.section,
                count: group.conversations.count,
                isExpanded: expandedSections.contains(group.section.id),
                // "pinned" est désormais une cible de drop LIVE (drop =
                // épingler) — la surbrillance suit dropTargetSection, que le
                // chemin chip ne renseigne pour Épingles que si l'action est
                // réelle (conversation pas déjà épinglée).
                isDropTarget: dropTargetSection == group.section.id
            ) {
                toggleSection(group.section.id)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    /// `nil` ⇒ sticker non interactif (section calculée). Sinon le MÊME
    /// `toggleSection` qu'avant LWS-6 — `expandedSections`, `toggleSection` et
    /// `persistCategoryExpansion` sont consommés inchangés, un seul appelant,
    /// donc `persistCategoryExpansion` reste appelé UNE fois par pliage.
    private func sectionToggle(for sectionId: String) -> (() -> Void)? {
        guard Self.isSectionCollapsible(sectionId: sectionId) else { return nil }
        return { toggleSection(sectionId) }
    }

    /// Le registre sert le hit-test du drop de la chip (`handleChipDrop`,
    /// +Overlays, possédé par LWS-8) : une section qui refuse le drop ne doit
    /// pas y figurer, sinon la chip la « toucherait » quand même et
    /// `ChipDropResolver` en ferait un `moveToSection` vers une catégorie
    /// fantôme. Le refus est ainsi porté par la Lentille, sans rien apprendre
    /// au résolveur de drop. Drapeau OFF : toutes les sections acceptent ⇒
    /// registre identique à celui d'aujourd'hui.
    private func registerSectionFrame(_ sectionId: String, _ frame: CGRect) {
        guard Self.acceptsSectionDrop(sectionId: sectionId) else { return }
        sectionFrameRegistry.frames[sectionId] = frame
    }

    // MARK: - Pilule de section — TROISIÈME consommateur du signal existant

    /// Libellé de la pilule : la section dont les rangs viennent d'entrer à
    /// l'écran, à défaut la première section rendue. Fonction PURE (aucune
    /// dépendance SwiftUI/MainActor), donc directement testable — même
    /// convention que `emptyBranch` / `shouldAutoLoadPreview`. La MAJUSCULE
    /// vient de `LentilleSticker.displayTitle` : pilule et sticker crient le
    /// même mot, par la même fonction, jamais par deux transformations
    /// parallèles qui dériveraient.
    nonisolated static func sectionPillTitle(
        visibleSectionId: String?,
        sections: [ConversationSection]
    ) -> String? {
        guard let fallback = sections.first else { return nil }
        let match = sections.first(where: { $0.id == visibleSectionId }) ?? fallback
        return LentilleSticker.displayTitle(match.name)
    }

    /// `nil` ⇒ suivi éteint (drapeau OFF). Écriture gardée par l'inégalité :
    /// l'`onAppear` des rangs est un chemin chaud, et seule une FRONTIÈRE de
    /// section doit re-évaluer le body.
    private func noteVisibleSection(_ sectionId: String?) {
        guard let sectionId, visibleSectionId != sectionId else { return }
        visibleSectionId = sectionId
    }

    @ViewBuilder
    private func sectionConversations(
        _ conversations: [Conversation],
        passContext: ConversationRowPassContext,
        trackedSectionId: String? = nil
    ) -> some View {
        // rowWidth derives from the actual containing column width (iPad
        // left column is much narrower than the window) minus
        // innerPadding(32) + avatar(52) + badge(28) + spacing(24).
        // On iPad the column ratio is roughly 0.38 of the window, so we
        // clamp to that floor explicitly to avoid text overflow.
        //
        // Measured against the window, not `UIScreen.main.bounds`: the ratio
        // is meant to approximate a *column of the app*, and taken against the
        // display it described a column of space the app does not own in Split
        // View — the row then budgeted more width than it had and the text it
        // was sized to protect overflowed anyway.
        let windowWidth = DeviceLayout.windowSize.width
        let baseWidth = horizontalSizeClass == .regular
            ? min(windowWidth * 0.42, 520)
            : windowWidth - 32
        let rowWidth = max(120, baseWidth - 32 - 52 - 28 - 24)
        // Drapeau résolu UNE fois par section, jamais par rang : `LentilleFeatureFlag`
        // relit `ProcessInfo.environment` (et réalloue donc son dictionnaire) à chaque
        // appel — même règle que `tracksVisibleSection` (I-063bis), un cran plus bas
        // puisque c'est ici que le rang se construit. Sous OFF, `false` fait rendre le
        // rang NU : aucun modificateur de Lentille monté (contrat LWS-8/I-069).
        let perspectiveEnabled = LentilleFeatureFlag.isLentilleListEnabled
        LazyVStack(spacing: 6) {
            ForEach(conversations, id: \.id) { conversation in
                conversationRow(for: conversation, rowWidth: rowWidth, passContext: passContext)
                    // Passe de compositor (§4.1) : opacité et échelle SEULES, sur la
                    // courbe `.list` du miroir gelé. Posée AU-DESSUS du portillon
                    // `.equatable()` du rang — elle ne rediffuse rien, elle repeint.
                    .lentillePerspective(isEnabled: perspectiveEnabled)
                    // Respiration (2026-08-22) : les voisines de la rangée élue
                    // s'écartent pendant la scène — translation seule.
                    .lentilleFocusBreathing(isEnabled: perspectiveEnabled)
                    // Candidature à la focus card : le rang publie son milieu dans
                    // une boîte INERTE. Écrire n'élit rien — seul un tick de
                    // défilement déclenche l'élection (§4.2).
                    .lentilleFocusCandidate(id: conversation.id, registry: focusCandidateRegistry, isEnabled: perspectiveEnabled)
                    .onAppear {
                        // Cursor-based infinite scroll: trigger `loadMore`
                        // 5 rows before the loaded tail. The ViewModel
                        // short-circuits when `hasMore == false`, so it
                        // is safe to call this on every onAppear past
                        // the threshold.
                        triggerLoadMoreIfNeeded(conversation: conversation)
                        // Libellé de la pilule de section — porté par le hook
                        // qui existe DÉJÀ sur ce rang, jamais par une sonde
                        // neuve. `nil` sous drapeau OFF : rien ne s'exécute.
                        noteVisibleSection(trackedSectionId)
                    }
            }
        }
    }

    func storyRingState(for conversation: Conversation) -> StoryRingState {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return .none }
        return storyViewModel.storyRingState(forUserId: userId)
    }

    func conversationMoodStatus(for conversation: Conversation) -> StatusEntry? {
        guard conversation.type == .direct, let userId = conversation.participantUserId else { return nil }
        return statusViewModel.statusForUser(userId: userId)
    }

    // Builds one conversation row. The heavy subtree (swipe actions +
    // context menu + preview) lives in the nominal `ConversationRowItem`
    // struct (ConversationListView+Rows.swift) so it no longer bloats the
    // ConversationListView body type — that monolithic type was the
    // type-metadata instantiation crash on low-memory devices. This builder
    // only wires the row's inputs; the returned `some View` is the nominal
    // `ConversationRowItem`, which keeps the enclosing list type small.
    private func conversationRow(for conversation: Conversation, rowWidth: CGFloat, passContext: ConversationRowPassContext) -> some View {
        let community: MeeshyCommunity? = {
            guard conversation.type == .community || conversation.communityId != nil,
                  let communityId = conversation.communityId else { return nil }
            return userCommunityLookup[communityId] ?? userCommunities.first(where: { $0.id == communityId })
        }()

        return ConversationRowItem(
            conversation: conversation,
            community: community,
            rowWidth: rowWidth,
            isDragging: draggingConversation?.id == conversation.id,
            presenceState: presenceManager.presenceState(for: conversation.participantUserId ?? ""),
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
            cachedPreviewMessages: conversationViewModel.previewMessages[conversation.id] ?? [],
            leadingActions: leadingSwipeActions(for: conversation),
            trailingActions: trailingSwipeActions(for: conversation),
            onViewStory: { handleStoryView(conversation) },
            onViewProfile: { handleProfileView(conversation) },
            onViewConversationInfo: { handleConversationInfoView(conversation) },
            onMoodBadgeTap: { anchor in handleMoodBadgeTap(conversation, at: anchor) },
            onCreateShareLink: canCreateShareLink(for: conversation) ? {
                inviteSheetConversation = conversation
            } : nil,
            onTap: {
                if ConversationLockManager.shared.isLocked(conversation.id) {
                    lockSheetMode = .openConversation
                    lockSheetConversation = conversation
                } else {
                    onSelect(conversation)
                }
            },
            onLoadPreview: {
                await conversationViewModel.loadPreviewMessages(for: conversation.id)
            },
            enableAutoPreviewLoad: passContext.autoPreviewIds.contains(conversation.id),
            onLongPress: { sourceFrame in
                Task { await conversationViewModel.loadPreviewMessages(for: conversation.id) }
                // Montage au REPOS invisible (scale 1, offset 0, opacité 0) :
                // le GeometryReader de l'overlay mesure la frame de repos de
                // la carte, puis `runContextMenuEmergence` place la carte sur
                // la ligne pressée (toujours invisible) et anime l'émergence.
                // Annule une purge de fermeture encore en vol, sinon elle
                // effacerait ce menu fraîchement ouvert (~0.26 s plus tard).
                contextMenuDismissWork?.cancel()
                contextMenuDismissWork = nil
                let wasMounted = contextMenuConversation != nil
                contextMenuAppeared = false
                contextMenuSourceFrame = sourceFrame.height > 0 ? sourceFrame : nil
                previewScale = 1.0
                previewEmergeOffset = 0
                dragOffsetY = 0
                dragOffsetX = 0
                chipModeLatched = false
                contextMenuConversation = conversation
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
                isAnonymous: AuthManager.shared.currentUser?.isAnonymous ?? true,
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
        .equatable()
    }

    // MARK: - Share Link Permission

    func canCreateShareLink(for conversation: Conversation) -> Bool {
        if conversation.type == .direct { return false }
        if conversation.type == .group {
            let role = conversation.currentUserRole?.lowercased() ?? "member"
            return ["admin", "moderator", "owner", "co-owner", "bigboss"].contains(role)
        }
        return true
    }

    // `shareConversationLink(for:)` used to live here: it minted a join link and
    // pushed a `UIActivityViewController` onto the top-most view controller. It
    // had no caller left — the live affordance is `onCreateShareLink`, which
    // routes to `InviteFriendsSheet` (a real sheet, with editable link options).
    // Removed with the rest of the hand-rolled share presentations, along with
    // the two hardcoded French strings it carried.

    // MARK: - Swipe Actions

    /// Labels des swipe actions précalculés UNE fois par vie de process.
    /// Les builders ci-dessous tournent pour CHAQUE conversation à CHAQUE
    /// body pass (~99 rows × 8 labels) ; `String(localized:)` refait un
    /// lookup de bundle à chaque appel — mesurable dans la famine du main
    /// thread derrière les kills 0x8BADF00D (diag 2026-07-05). La langue de
    /// l'app ne change pas à chaud (redémarrage requis), des statiques sont
    /// donc sûres.
    private enum SwipeLabels {
        static let pin = String(localized: "swipe.pin")
        static let unpin = String(localized: "swipe.unpin")
        static let mute = String(localized: "swipe.mute")
        static let unmute = String(localized: "swipe.unmute")
        static let lock = String(localized: "swipe.lock")
        static let unlock = String(localized: "swipe.unlock")
        static let archive = String(localized: "swipe.archive")
        static let unarchive = String(localized: "swipe.unarchive")
        static let markRead = String(localized: "swipe.mark_read")
        static let markUnread = String(localized: "swipe.mark_unread")
        static let block = String(localized: "swipe.block")
        static let unblock = String(localized: "swipe.unblock")
        static let hide = String(localized: "swipe.hide")
    }

    private func leadingSwipeActions(for conversation: Conversation) -> [SwipeAction] {
        let isLocked = lockManager.isLocked(conversation.id)
        return [
            SwipeAction(
                icon: conversation.userState.isPinned ? "pin.slash.fill" : "pin.fill",
                label: conversation.userState.isPinned ? SwipeLabels.unpin : SwipeLabels.pin,
                color: MeeshyColors.pinnedBlue
            ) {
                Task { await conversationViewModel.togglePin(for: conversation.id) }
            },
            SwipeAction(
                icon: conversation.userState.isMuted ? "bell.fill" : "bell.slash.fill",
                label: conversation.userState.isMuted ? SwipeLabels.unmute : SwipeLabels.mute,
                color: MeeshyColors.neutral500
            ) {
                Task { await conversationViewModel.toggleMute(for: conversation.id) }
            },
            SwipeAction(
                icon: isLocked ? "lock.open.fill" : "lock.fill",
                label: isLocked ? SwipeLabels.unlock : SwipeLabels.lock,
                color: MeeshyColors.warning
            ) {
                if isLocked {
                    lockSheetMode = .unlockConversation
                    lockSheetConversation = conversation
                } else if lockManager.masterPinConfigured {
                    lockSheetMode = .lockConversation
                    lockSheetConversation = conversation
                } else {
                    showNoMasterPinAlert = true
                }
            }
        ]
    }

    private func trailingSwipeActions(for conversation: Conversation) -> [SwipeAction] {
        // Per-user archive state (same source as the list filter + `.setArchived`
        // mutation). NOT `conversation.isActive` (server lifecycle flag, never
        // toggled by archiving) — reading it froze this swipe on "Archiver" so
        // archived conversations could never be unarchived from the swipe.
        let isArchived = conversation.userState.isArchived
        let isRead = conversation.userState.unreadCount == 0
        var actions: [SwipeAction] = [
            SwipeAction(
                icon: isArchived ? "tray.and.arrow.up.fill" : "archivebox.fill",
                label: isArchived ? SwipeLabels.unarchive : SwipeLabels.archive,
                color: MeeshyColors.warning
            ) {
                if isArchived {
                    Task { await conversationViewModel.unarchiveConversation(conversationId: conversation.id) }
                } else {
                    Task { await conversationViewModel.archiveConversation(conversationId: conversation.id) }
                }
            },
            SwipeAction(
                icon: isRead ? "envelope.badge.fill" : "envelope.open.fill",
                label: isRead ? SwipeLabels.markUnread : SwipeLabels.markRead,
                color: MeeshyColors.indigo400
            ) {
                if isRead {
                    Task { await conversationViewModel.markAsUnread(conversationId: conversation.id) }
                } else {
                    Task { await conversationViewModel.markAsRead(conversationId: conversation.id) }
                }
            }
        ]

        if conversation.type == .direct, let userId = conversation.participantUserId {
            let isBlocked = BlockService.shared.isBlocked(userId: userId)
            actions.append(SwipeAction(
                icon: isBlocked ? "hand.raised.slash.fill" : "hand.raised.fill",
                label: isBlocked ? SwipeLabels.unblock : SwipeLabels.block,
                color: MeeshyColors.error
            ) {
                if isBlocked {
                    Task {
                        await BlockActionCoordinator.shared.unblock(userId: userId)
                        HapticFeedback.success()
                    }
                } else {
                    blockTargetConversation = conversation
                    showBlockConfirmation = true
                }
            })
        }

        actions.append(SwipeAction(
            icon: "eye.slash.fill",
            label: SwipeLabels.hide,
            color: MeeshyColors.error
        ) {
            deleteTargetConversation = conversation
        })

        return actions
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
            .sheet(item: $conversationInfoConversation) { conversation in
                ConversationInfoSheet(
                    conversation: conversation,
                    accentColor: conversation.accentColor,
                    messages: []
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .sheet(item: $inviteSheetConversation) { conversation in
                InviteFriendsSheet(conversation: conversation)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
            }
        // Lot 4.6 — LA feuille des trois déclencheurs de cette vue (le rail
        // Lentille, le tray classique, l'accès rapide « Poser un mood ») monte
        // le MEUBLE. Une seule feuille pour les trois, comme avant : c'est le
        // booléen de présentation que `ScrollPillStateTests` compte à trois
        // écritures — le nommer ici en toutes lettres l'aurait fait quatre pour
        // toute garde qui ne retire pas les commentaires.
        .sheet(isPresented: $showStatusComposer) {
            MoodComposerDoor(
                intent: ComposerIntent(origin: .moodChip),
                seed: nil,
                viewModel: statusViewModel
            )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showCreateAffiliate) {
            AffiliateCreateView { _ in }
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showCreateTrackingLink) {
            CreateTrackingLinkView { _ in }
        }
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
                if !wasHidden && isHidden { showSearchOverlay = false }
            }
            .onAppear {
                withAnimation(.easeOut(duration: 0.25)) { isScrollingDown = false }
            }
            .task {
                async let conversations: Void = conversationViewModel.loadConversations()
                async let communities: Void = loadUserCommunities()
                _ = await (conversations, communities)
            }
            .adaptiveOnChange(of: scenePhase) { _, newPhase in
                if newPhase == .active {
                    conversationViewModel.handleForegroundReturn()
                    conversationViewModel.handleForegroundReactivation()
                }
            }
            .adaptiveOnChange(of: conversationViewModel.userCategories) { _, categories in
                for cat in categories where cat.isExpanded { expandedSections.insert(cat.id) }
            }
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
            .sheet(item: $lockSheetConversation) { conversation in
                ConversationLockSheet(
                    mode: lockSheetMode,
                    conversationId: conversation.id,
                    conversationName: conversation.name,
                    onSuccess: {
                        if case .openConversation = lockSheetMode { onSelect(conversation) }
                    }
                )
                .environmentObject(theme)
            }
            .alert(String(localized: "conversation.list.master_pin_required.title", bundle: .main), isPresented: $showNoMasterPinAlert) {
                Button(String(localized: "conversation.list.master_pin_required.configure", bundle: .main), role: .none) { router.push(.settings) }
                Button(String(localized: "common.cancel", bundle: .main), role: .cancel) {}
            } message: {
                Text(String(localized: "conversation.list.master_pin_required.message", bundle: .main))
            }
            .alert(
                String(localized: "conversation.rename.title", defaultValue: "Renommer la conversation", bundle: .main),
                isPresented: Binding(
                    get: { renameTarget != nil },
                    set: { if !$0 { renameTarget = nil } }
                )
            ) {
                TextField(String(localized: "conversation.rename.placeholder", defaultValue: "Nom", bundle: .main), text: $renameText)
                Button(String(localized: "common.save", defaultValue: "Enregistrer", bundle: .main)) {
                    if let target = renameTarget {
                        Task { await conversationViewModel.renameConversation(conversationId: target.id, title: renameText) }
                    }
                    renameTarget = nil
                }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {
                    renameTarget = nil
                }
            }
            .sheet(isPresented: $showWidgetPreview) {
                WidgetPreviewView(onNewConversation: onNewConversation)
                    .environmentObject(conversationViewModel)
                    .environmentObject(router)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
            }
            .fullScreenCover(isPresented: $showGlobalSearch) {
                GlobalSearchView()
                    .environmentObject(conversationViewModel)
                    .environmentObject(router)
            }
            .confirmationDialog(
                String(localized: "block.confirm.title"),
                isPresented: $showBlockConfirmation,
                titleVisibility: .visible
            ) {
                Button(String(localized: "action.block"), role: .destructive) {
                    guard let conv = blockTargetConversation,
                          let targetUserId = conv.participantUserId else { return }
                    Task {
                        await BlockActionCoordinator.shared.block(userId: targetUserId)
                        await conversationViewModel.archiveConversation(conversationId: conv.id)
                        HapticFeedback.success()
                    }
                }
                Button(String(localized: "action.cancel"), role: .cancel) {}
            } message: {
                Text(String(localized: "block.confirm.message"))
            }
            // Suppression = callback destructif → TOUJOURS confirmée par le
            // dialog système (rendu natif de l'OS courant, Liquid Glass sur
            // iOS 26), déclenchée depuis le menu custom ET le swipe « hide ».
            .confirmationDialog(
                String(localized: "conversation.delete.confirm.title", defaultValue: "Supprimer la conversation ?", bundle: .main),
                isPresented: Binding(
                    get: { deleteTargetConversation != nil },
                    set: { if !$0 { deleteTargetConversation = nil } }
                ),
                titleVisibility: .visible,
                presenting: deleteTargetConversation
            ) { conversation in
                Button(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main), role: .destructive) {
                    HapticFeedback.heavy()
                    Task { await conversationViewModel.deleteConversation(conversationId: conversation.id) }
                }
                Button(String(localized: "common.cancel", bundle: .main), role: .cancel) {}
            } message: { conversation in
                Text(String(
                    localized: "conversation.delete.confirm.message",
                    defaultValue: "« \(conversation.name) » sera masquée pour vous. Les autres participants la conservent.",
                    bundle: .main
                ))
            }
        )
    }

    // MARK: - Rail vivants & stories (LWS-6, drapeau Lentille)

    /// Mux de tête de liste. Drapeau OFF : `StoryTrayView`, à l'identique.
    /// Drapeau ON : la FUSION — pastille « moi » en tête (arbitrage
    /// I-063bis), puis les autres, bornées à `≤ 6` par le rail lui-même.
    ///
    /// Aucune navigation nouvelle : les trois destinations de « moi » sont les
    /// chemins existants, appelés depuis ici plutôt que depuis le tray —
    /// `StoryTrayActionResolver` décide (même règle, même annonce VoiceOver),
    /// la liste « Mes stories » passe par le listener `openMyStories` des
    /// RACINES (celui que la tuile Stories du profil emprunte déjà), le
    /// composeur de story par `storyViewModel.showStoryComposer` (cover monté
    /// aux racines) et le composeur de statut par la sheet que CETTE vue
    /// héberge déjà (`showStatusComposer`).
    /// La rangée de filtres COMPOSÉS, sous le rail (#4069).
    ///
    /// Un appui pose, un second retire — `ConversationFilterComposition`
    /// porte la règle, la vue ne fait que la relayer. La rangée disparaît si
    /// l'énumération n'a rien à proposer, plutôt que de laisser une bande vide
    /// entre le rail et la première conversation.
    @ViewBuilder
    private var composedFilterChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ConversationFilter.allCases) { filter in
                    ThemedFilterChip(
                        title: filter.rawValue,
                        color: filter.color,
                        isSelected: conversationViewModel.selectedFilters.contains(filter),
                        isCompact: true
                    ) {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            conversationViewModel.selectedFilters = ConversationFilterComposition.toggling(
                                filter, in: conversationViewModel.selectedFilters
                            )
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
        }
        .accessibilityLabel(String(localized: "conversation.filter.row",
                                   defaultValue: "Filtres de conversations", bundle: .main))
    }

    @ViewBuilder
    private var lentilleRailOrStoryTray: some View {
        if LentilleFeatureFlag.isLentilleListEnabled {
            StoriesVivantsRail(
                selfEntry: lentilleRailSelfEntry,
                entries: lentilleRailEntries,
                onSelect: { userId in onStoryViewRequest?(userId, true) },
                onSelectSelf: { openMyStoriesFromRail() },
                onSelfMoodTap: {
                    showStatusComposer = true
                    HapticFeedback.medium()
                },
                onSelfCreateStory: {
                    storyViewModel.showStoryComposer = true
                    HapticFeedback.medium()
                }
            )
        } else {
            StoryTrayView(viewModel: storyViewModel, onViewStory: { userId in
                onStoryViewRequest?(userId, true)
            }, onAddStatus: {
                showStatusComposer = true
            })
        }
    }

    /// La pastille « moi ». `nil` si aucun utilisateur n'est résolu — le rail
    /// retombe alors sur les seules autres pastilles, et sur `EmptyView` s'il
    /// n'y en a aucune.
    private var lentilleRailSelfEntry: LentilleRailSelfEntry? {
        guard let currentUser = AuthManager.shared.currentUser else { return nil }
        let userId = currentUser.id
        // Un groupe entièrement expiré est traité comme « pas de story » —
        // même règle que le tray, sinon l'anneau promet un viewer qui se
        // refermerait aussitôt.
        let myGroup = storyViewModel.storyGroupForUser(userId: userId).flatMap { $0.isFullyExpired() ? nil : $0 }
        return Self.railSelfEntry(
            displayName: currentUser.displayName ?? currentUser.username,
            avatarURL: currentUser.avatar,
            accentColor: DynamicColorGenerator.colorForName(currentUser.username),
            // MÊME résolveur que le tray (`MyStoryButton`) : la couverture de
            // ma dernière story, jamais une seconde écriture de la cascade
            // cover locale > thumbnail serveur > image > avatar.
            coverURL: myGroup.flatMap { latestStoryThumbnailURL($0) },
            hasActiveStory: myGroup != nil,
            moodEmoji: statusViewModel.statusForUser(userId: userId)?.moodEmoji,
            // Le libellé sort de la MÊME règle que le routage ci-dessous : les
            // deux ne peuvent pas diverger (régression déjà vécue côté tray).
            // Le tap ouvre TOUJOURS le listing « Mes stories » (voir
            // `openMyStoriesFromRail`) : l'annonce dit cette destination-là.
            actionLabel: StoryTrayCopy.manageStories
        )
    }

    /// Mappage PUR de la pastille « moi » — `nonisolated`, donc attaquable
    /// directement par les tests (même convention que `sectionPillTitle`).
    /// La seule décision qu'il porte : la couverture de ma story active PRIME
    /// sur mon avatar, et à défaut c'est l'avatar — parité avec le bouton
    /// « moi » du tray.
    nonisolated static func railSelfEntry(
        displayName: String,
        avatarURL: String?,
        accentColor: String,
        coverURL: String?,
        hasActiveStory: Bool,
        moodEmoji: String?,
        actionLabel: String?
    ) -> LentilleRailSelfEntry {
        LentilleRailSelfEntry(
            displayName: displayName,
            avatarURL: avatarURL,
            previewURL: coverURL ?? avatarURL,
            accentColor: accentColor,
            moodEmoji: moodEmoji,
            hasActiveStory: hasActiveStory,
            actionLabel: actionLabel
        )
    }

    /// Tap sur « moi » : la décision appartient à `StoryTrayActionResolver`
    /// (règle partagée avec le tray, déjà testée), jamais à cette vue. Les deux
    /// destinations sont celles d'aujourd'hui — la liste « Mes stories » par le
    /// listener des racines, le composeur par le cover des racines.
    /// Tap sur MON avatar du rail ⇒ TOUJOURS le listing « Mes stories »
    /// (stories actives, brouillons, boutons créer / sélectionner) — retour
    /// user 2026-08-21. Créer directement une story est le rôle du (+) de
    /// l'entrée (`onSelfCreateStory`), plus celui d'un avatar sans story.
    private func openMyStoriesFromRail() {
        NotificationCenter.default.post(name: .openMyStories, object: nil)
        HapticFeedback.medium()
    }

    /// Entrées du rail. Même filtrage que le tray (`storyScrollView`) : ni
    /// moi-même, ni un groupe entièrement expiré — un groupe expiré ouvrirait
    /// puis refermerait le viewer (tap-puis-flash déjà documenté côté tray).
    /// La troncature `≤ 6` et le masquage si vide appartiennent au rail
    /// (`LentilleRailPolicy`), pas à cet appelant.
    ///
    /// ÉCART SIGNALÉ : la moitié « vivants » de la fusion reste vide —
    /// `isLive` est toujours `false`, faute de modèle d'appel en cours sur
    /// `Conversation` (contrat §0/E13, même constat que la greffe I-060 qui
    /// passe `liveCall: nil`). Le rail est donc, aujourd'hui, un rail de
    /// stories ; la pastille pulsée s'allumera sans changer cette vue le jour
    /// où la donnée existera.
    private var lentilleRailEntries: [LentilleRailEntry] {
        let currentUserId = AuthManager.shared.currentUser?.id ?? ""
        return Self.railStoryGroups(storyViewModel.storyGroups, excludingUserId: currentUserId)
            .map { group in
                Self.railEntry(
                    group: group,
                    // MÊME résolveur que le tray — une seule écriture de la
                    // cascade de couverture dans toute l'app (garde de source
                    // `LentilleChromeSourceGuardTests`).
                    coverURL: latestStoryThumbnailURL(group),
                    moodEmoji: statusViewModel.statusForUser(userId: group.id)?.moodEmoji
                )
            }
    }

    /// Le FILTRE du rail, isolé et PUR (`now` explicite) : ni moi-même, ni un
    /// groupe entièrement expiré — un groupe expiré ouvrirait puis refermerait
    /// le viewer (tap-puis-flash déjà documenté côté tray).
    nonisolated static func railStoryGroups(
        _ groups: [StoryGroup],
        excludingUserId currentUserId: String,
        now: Date = Date()
    ) -> [StoryGroup] {
        groups.filter { $0.id != currentUserId && !$0.isFullyExpired(at: now) }
    }

    /// Mappage PUR d'un groupe vers son entrée de rail. Les deux valeurs que
    /// la vue Chrome ne peut pas aller chercher elle-même (couverture, humeur)
    /// arrivent RÉSOLUES ; tout le reste est lu sur le groupe.
    nonisolated static func railEntry(
        group: StoryGroup,
        coverURL: String?,
        moodEmoji: String?
    ) -> LentilleRailEntry {
        LentilleRailEntry(
            id: group.id,
            displayName: group.username,
            avatarURL: group.avatarURL,
            previewURL: coverURL ?? group.avatarURL,
            moodEmoji: moodEmoji,
            hasUnviewed: group.hasUnviewed,
            accentColor: group.avatarColor,
            isLive: false
        )
    }

    // MARK: - Ligne d'épinglage des stickers (LWS-6/I-063bis)

    /// Hauteur retirée à la région visible du défilement pour que les stickers
    /// épinglés se posent SOUS la barre de header au lieu de disparaître
    /// derrière elle. Vaut la hauteur de la barre REPLIÉE : c'est l'état de la
    /// barre quand on défile, donc la seule cote qui garantit un sticker
    /// entièrement visible pendant tout le défilement. Les deux valeurs
    /// viennent de `CollapsibleHeaderMetrics` (64 déployée / 44 repliée), la
    /// métrique que le header lui-même consomme — jamais un nombre recopié ici.
    /// `0` sous drapeau OFF : ni inset, ni décalage.
    /// `accessoryCollapsedHeight` (60) et non `collapsedHeight` (44) : ce
    /// header porte un `titleAccessory` (la trail compacte de stories), et
    /// replié il mesure 60 pt — la bande de stickers épinglée à 44 passait
    /// SOUS la trail (chevauchement « P[avatar]ANCIEN », 2026-08-21).
    private var stickyHeaderInset: CGFloat {
        LentilleFeatureFlag.isLentilleListEnabled ? CollapsibleHeaderMetrics.accessoryCollapsedHeight : 0
    }

    /// R-a (réserve tracée Porte V1, `tasks/lentille-workshop-execution.md`
    /// §8) : `.safeAreaInset(edge: .top)` était monté INCONDITIONNELLEMENT
    /// sur le conteneur de défilement, `stickyHeaderInset` retombant
    /// seulement à une hauteur `0` drapeau OFF. Un `safeAreaInset(height: 0)`
    /// n'est PAS bit-à-bit identique à l'absence du modificateur : il reste
    /// posé dans l'arbre de vue et continue de composer la région de
    /// sécurité vue par le contenu défilant (`GeometryProxy.safeAreaInsets`),
    /// même à hauteur nulle — SwiftUI ne « replie » jamais un modificateur
    /// à zéro effet en un no-op structurel. Ce `ViewModifier` retire le
    /// modificateur du tout, plutôt que de retirer seulement sa hauteur :
    /// `isEnabled == false` ⇒ `body(content:)` renvoie `content` SANS
    /// AUCUNE chaîne de modificateur ajoutée, drapeau ON comme avant tout ce
    /// lot. `isEnabled` est INJECTÉ (jamais lu depuis le drapeau global en
    /// interne) : le témoin `LentilleStickyHeaderInsetSourceGuardTests`
    /// (garde source — proof-by-reading, aucun toolchain Swift local pour ce
    /// lot) vérifie que la branche OFF ne chaîne plus rien après `content`.
    private struct LentilleStickyHeaderInsetModifier: ViewModifier {
        let isEnabled: Bool
        let height: CGFloat

        @ViewBuilder
        func body(content: Content) -> some View {
            if isEnabled {
                content.safeAreaInset(edge: .top, spacing: 0) {
                    Color.clear.frame(height: height)
                }
            } else {
                content
            }
        }
    }

    /// Padding de contenu RESTANT, pour que la position de repos de la liste ne
    /// bouge pas d'un point : ce que l'inset prend à la région visible, ce
    /// padding cesse de le prendre au contenu. Somme constante =
    /// `expandedHeight`, drapeau ON comme OFF.
    private var scrollContentTopPadding: CGFloat {
        CollapsibleHeaderMetrics.expandedHeight - stickyHeaderInset
    }

    /// Drapeau OFF ⇒ AUCUN hôte d'élection : ni mesure, ni carte (LWS-8/I-070).
    /// Sous ON, l'hôte est posé sur le CONTENEUR de défilement, jamais dans son
    /// contenu — c'est la seule position d'où le bas de la région visible se
    /// mesure, et il ne défile pas avec les rangs. `LentilleFocusElectionHost`
    /// reste purement observationnel : il ne rend rien de visible et
    /// n'intercepte aucun geste — c'est `LentilleFocusCardHost` (I-071,
    /// `Lentille/Mode/LentilleFocusCard.swift`) qui peint la carte à la
    /// position qu'il publie, dans le MÊME overlay, sur le magasin
    /// `focusElection` passé par référence (ce body ne lit jamais l'élu
    /// lui-même — l'hôte de la carte le lit dans SON fichier à lui).
    @ViewBuilder
    private var lentilleFocusElectionOverlay: some View {
        if LentilleFeatureFlag.isLentilleListEnabled {
            LentilleFocusElectionHost(
                relay: scrollOffsetRelay,
                registry: focusCandidateRegistry,
                election: focusElection
            )
            // `LentilleFocusCardHost` a vécu ICI jusqu'au 2026-08-23 : il
            // peignait la carte de magnification par-dessus la rangée élue.
            // Retiré — la magnification vit désormais DANS la rangée
            // (`LentilleMagnifiableRow` → `LentilleConversationRow
            // .magnification`), seule position d'où elle peut à la fois
            // porter des pastilles actionnables et laisser à la rangée son
            // swipe, son glisser-déposer et son appui long. Voir l'en-tête de
            // `Lentille/Mode/LentilleFocusCard.swift`.
            // Scène (2026-08-21) : un consommateur de plus du MÊME relais —
            // niveau d'activité lu par les rangées et par la carte.
            LentilleSceneActivityHost(relay: scrollOffsetRelay, scene: sceneActivity)
        }
    }

    // MARK: - Accès rapides (queue de liste / état vide, 2026-08-21)

    /// Vue PURE routée vers les portes EXISTANTES : nouveau message
    /// (`onNewConversation`), story (`StoryViewModel.showStoryComposer`),
    /// mood (`MoodComposerDoor`, déjà hébergé ici), post (drapeau `Router
    /// .pendingOpenFeedComposer`, consommé par le flux), invitation
    /// (`AffiliateCreateView`, lien de parrainage), lien raccourci
    /// (`CreateTrackingLinkView`, `/l/<token>`).
    private func quickActions(isEmptyState: Bool, minHeight: CGFloat = 0) -> some View {
        ConversationListQuickActions(
            isDark: theme.mode.isDark,
            isEmptyState: isEmptyState,
            minHeight: minHeight,
            onAction: { action in
                switch action {
                case .findMembers: router.push(.peopleDiscovery(.discover))
                case .myContacts: router.push(.contacts(.contacts))
                case .myAffiliates: router.push(.affiliate)
                case .newMessage: onNewConversation?()
                case .story: storyViewModel.showStoryComposer = true
                case .mood: showStatusComposer = true
                case .post: router.pendingOpenFeedComposer = true
                case .invite: showCreateAffiliate = true
                case .shortcutLink: showCreateTrackingLink = true
                }
            }
        )
        .equatable()
    }

    /// Hauteur de queue : une DEMI-région visible, pour que la dernière
    /// rangée puisse rejoindre la bande de focus au centre.
    private var listTailMinHeight: CGFloat {
        DeviceLayout.windowSize.height / 2
    }

    @ViewBuilder
    private var listTail: some View {
        if LentilleFeatureFlag.isLentilleListEnabled {
            quickActions(isEmptyState: false, minHeight: listTailMinHeight)
        } else {
            Color.clear.frame(height: 60)
        }
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
                    let scrollingDown = offset < -30
                    if scrollingDown != isScrollingDown {
                        // Throttle direction changes to avoid rapid toggling during bounce/overscroll
                        let now = Date()
                        guard now.timeIntervalSince(lastScrollDirectionChange) > 0.15 else { return }
                        lastScrollDirectionChange = now
                        isScrollingDown = scrollingDown
                    }
                },
                topPadding: scrollContentTopPadding
            ) {
                VStack(spacing: 0) {
                    // Story carousel — sous drapeau Lentille, le rail « vivants
                    // & stories » (contrat LWS-6 travail 5 : fusion du tray et
                    // des vivants, ≤ 6 entrées, masqué si vide) prend sa place.
                    // Le ROUTAGE du tap est le même des deux côtés :
                    // `onStoryViewRequest?(userId, true)`.
                    lentilleRailOrStoryTray

                    // Les filtres, SOUS le rail et en petit (#4069). Ils
                    // vivaient dans le panneau de l'overlay de recherche, donc
                    // derrière un tap sur la loupe : le filtrage utile — le
                    // croisé — était à la fois invisible et impossible.
                    composedFilterChips

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
                    if conversationViewModel.groupedConversations.isEmpty {
                        switch Self.emptyBranch(
                            loadState: conversationViewModel.loadState,
                            loadFailed: conversationViewModel.loadFailed,
                            searchTextIsEmpty: conversationViewModel.searchText.isEmpty
                        ) {
                        case .skeleton:
                            // Mux de squelette sous drapeau (contrat LWS-7,
                            // workshop I-067bis — exception de périmètre
                            // accordée par l'orchestrateur, seule ouverture
                            // consentie dans ce fichier hors du mux de rang
                            // I-067). `LentilleSkeletonRow` (`Lentille/Row/`,
                            // I-066, vue pure prête depuis ce lot) ne pouvait
                            // pas être montée depuis `ConversationRowItem`
                            // (ÉCART CONTRAT↔CODE signalé par I-067,
                            // `ConversationListView+Rows.swift` : cette
                            // branche « cache vide » est un chemin de rendu
                            // ENTIÈREMENT séparé, au niveau de la LISTE, où
                            // aucune `Conversation` n'existe encore pour
                            // instancier un `ConversationRowItem`). Drapeau
                            // OFF : `SkeletonConversationRow()` INCHANGÉ, bit
                            // à bit identique à avant ce lot.
                            LazyVStack(spacing: 8) {
                                ForEach(0..<6, id: \.self) { index in
                                    if LentilleFeatureFlag.isLentilleListEnabled {
                                        LentilleSkeletonRow()
                                            .staggeredAppear(index: index, baseDelay: 0.04)
                                    } else {
                                        SkeletonConversationRow()
                                            .staggeredAppear(index: index, baseDelay: 0.04)
                                    }
                                }
                            }
                            // D1 — la marge du squelette doit être celle des
                            // rangées RÉELLES, sinon la liste saute
                            // latéralement quand les placeholders sont
                            // remplacés. Le padding est posé sur le CONTENEUR,
                            // donc il porte sur les DEUX branches du mux : la
                            // valeur doit être muxée, pas seulement le type de
                            // rang. Peau historique : `16` inchangé.
                            .padding(.horizontal, LentilleFeatureFlag.isLentilleListEnabled
                                     ? LentilleMetrics.Row.marginHorizontal
                                     : 16)
                            .transition(.opacity)
                        // behaviour-matrix:L17 — « … avec des états vides
                        // restylés plats ». Seule `.skeleton` (ci-dessus)
                        // était muxée sous `LentilleFeatureFlag` ; les trois
                        // branches suivantes ne l'étaient pas (TROU PARTIEL,
                        // documenté par B1). Restylage MINIMAL, cohérent
                        // avec `.skeleton` (mêmes métriques : même
                        // icône/titre/sous-titre/action, même
                        // `.padding(.top, 60)`) — `EmptyStateView.compact`
                        // (knob existant du primitive partagé, pas une
                        // invention) donne la variante plate sous le
                        // drapeau ; drapeau OFF ⇒ le rendu historique
                        // EXACT, bit à bit identique (mêmes arguments,
                        // aucun `compact:`).
                        case .searchNoResults:
                            // `Group` : un modificateur ne s'attache pas à un
                            // `if/else` dans un ViewBuilder (« instance member
                            // 'padding' cannot be used on type 'View' »). Le
                            // mux de drapeau posé ici a rendu ces deux lignes
                            // orphelines. `Group` est transparent au rendu —
                            // il rétablit la cible du modificateur sans
                            // dupliquer les métriques dans chaque branche, ce
                            // qui est précisément ce que ce restylage promet
                            // (« même `.padding(.top, 60)` »).
                            Group {
                                if LentilleFeatureFlag.isLentilleListEnabled {
                                    EmptyStateView(
                                        icon: "magnifyingglass",
                                        title: String(localized: "search.no_results"),
                                        subtitle: String(localized: "search.try_other_terms"),
                                        compact: true
                                    )
                                } else {
                                    EmptyStateView(
                                        icon: "magnifyingglass",
                                        title: String(localized: "search.no_results"),
                                        subtitle: String(localized: "search.try_other_terms")
                                    )
                                }
                            }
                            .padding(.top, 60)
                            .transition(.opacity)
                        case .syncError:
                            // Cold-start sync failed AND cache is empty: offer a
                            // retry instead of the misleading "no conversations"
                            // placeholder. This is the path users hit after a
                            // cold start with stale/expired token or network
                            // issues — previously they were trapped on an empty
                            // list with no feedback.
                            Group {
                                if LentilleFeatureFlag.isLentilleListEnabled {
                                    EmptyStateView(
                                        icon: "exclamationmark.arrow.triangle.2.circlepath",
                                        title: String(localized: "conversations.error.title"),
                                        subtitle: String(localized: "conversations.error.subtitle"),
                                        actionLabel: String(localized: "conversations.error.retry"),
                                        compact: true,
                                        onAction: {
                                            Task { await conversationViewModel.forceRefresh() }
                                        }
                                    )
                                } else {
                                    EmptyStateView(
                                        icon: "exclamationmark.arrow.triangle.2.circlepath",
                                        title: String(localized: "conversations.error.title"),
                                        subtitle: String(localized: "conversations.error.subtitle"),
                                        actionLabel: String(localized: "conversations.error.retry"),
                                        onAction: {
                                            Task { await conversationViewModel.forceRefresh() }
                                        }
                                    )
                                }
                            }
                            .padding(.top, 60)
                            .transition(.opacity)
                        case .createFirstConversation:
                            Group {
                                if LentilleFeatureFlag.isLentilleListEnabled {
                                    // État vide = les MÊMES accès rapides que la
                                    // queue de liste (2026-08-21) : tout commence
                                    // ici — message, story, mood, post, invitation.
                                    quickActions(isEmptyState: true)
                                } else {
                                    EmptyStateView(
                                        icon: "bubble.left.and.bubble.right",
                                        title: String(localized: "conversations.empty.title"),
                                        subtitle: String(localized: "conversations.empty.subtitle"),
                                        actionLabel: String(localized: "conversations.empty.action"),
                                        onAction: {
                                            onNewConversation?()
                                        }
                                    )
                                }
                            }
                            .padding(.top, 60)
                            .transition(.opacity)
                        }
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
                    listTail
                        .adaptiveOnChange(of: draggingConversation) { oldValue, newValue in
                            if oldValue != nil && newValue == nil {
                                withAnimation(.spring(response: 0.2, dampingFraction: 0.8)) {
                                    dropTargetSection = nil
                                }
                            }
                        }
                }
                .padding(.top, 8)
                .padding(.bottom, 80)
            }
            // LIGNE D'ÉPINGLAGE (LWS-6/I-063bis). Un `LazyVStack(pinnedViews:)`
            // épingle au bord haut de la RÉGION VISIBLE de son ScrollView. Ici
            // ce bord est couvert par `ConversationListHeaderOverlay` : sans
            // inset, le sticker épinglé se rangeait DERRIÈRE la barre — la
            // restructuration I-062 était juste et son effet invisible.
            // `safeAreaInset` réduit la région visible du ScrollView interne :
            // la ligne d'épinglage descend sous la barre repliée, sans toucher
            // à `MeeshyRefreshableScroll` (SDK, gelé S1).
            // Drapeau OFF : R-a — le modificateur lui-même n'est PAS monté
            // (`LentilleStickyHeaderInsetModifier.isEnabled == false` ⇒
            // `content` renvoyé tel quel), zéro modificateur ajouté, bit à
            // bit identique à aujourd'hui. `topPadding` (`scrollContentTopPadding`)
            // reste `expandedHeight` dans les deux cas.
            .modifier(LentilleStickyHeaderInsetModifier(
                isEnabled: LentilleFeatureFlag.isLentilleListEnabled,
                height: stickyHeaderInset
            ))
            // Ligne d'épinglage des stickers, en coordonnées GLOBALES : bord
            // haut de la région visible du défilement (safe area comprise)
            // plus l'inset collant. Mesurée sur le CONTENEUR — qui ne bouge
            // pas au défilement, donc zéro écriture par tick — et lue par la
            // pilule pour nommer la section réellement épinglée (2026-08-21 :
            // « le sticker le plus haut » désignait une section déjà passée).
            .onGeometryChange(for: CGFloat.self) { proxy in
                proxy.frame(in: .global).minY + proxy.safeAreaInsets.top
            } action: { visibleTop in
                sectionPositionRegistry.registerPinLine(visibleTop + stickyHeaderInset)
            }
            .scrollDismissesKeyboard(.interactively)
            // ÉLECTION DE LA FOCUS CARD (LWS-8/I-070). Posé sur le conteneur,
            // APRÈS l'inset sticky : l'hôte mesure le bas de la région visible du
            // défilement, la seule ancre de la bande de focus (§4.2). Il ne rend
            // rien, n'intercepte rien, et n'ajoute AUCUN observateur — il s'abonne
            // au relais d'offset qui publiait déjà, comme le header et la pilule.
            .overlay { lentilleFocusElectionOverlay }

            // Layer 2: Bottom overlay — Search bar + Communities & Filters
            ConversationListBottomBar(
                showSearchOverlay: $showSearchOverlay,
                isSearching: $isSearching,
                showWidgetPreview: $showWidgetPreview,
                showGlobalSearch: $showGlobalSearch,
                userCommunities: userCommunities
            )
            .padding(.bottom, 8)
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
                    inviteSheetConversation = conversation
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
        conversationInfoConversation = conversation
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
    private func handleDrop(to sectionId: String, providers: [NSItemProvider]) -> Bool {
        guard let provider = providers.first else { return false }
        _ = provider.loadObject(ofClass: NSString.self) { object, _ in
            guard let conversationId = object as? String else { return }
            Task { @MainActor in
                guard let conversation = conversationViewModel.conversations
                    .first(where: { $0.id == conversationId }) else { return }
                switch ChipDropResolver.action(
                    droppedOn: sectionId,
                    isPinned: conversation.userState.isPinned,
                    currentSectionId: conversation.userState.sectionId ?? ""
                ) {
                case .none:
                    return
                case .pin:
                    HapticFeedback.success()
                    await conversationViewModel.togglePin(for: conversation.id)
                case .move(let targetId):
                    HapticFeedback.success()
                    conversationViewModel.moveToSection(conversationId: conversation.id, sectionId: targetId)
                }
            }
        }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            dropTargetSection = nil
        }
        return true
    }

    // MARK: - Load Communities
    /// Cache-first community load (iOS Local-First Wave 1, Task 2.1).
    ///
    /// Flow:
    /// - `.fresh` -> apply cache, no network call.
    /// - `.stale` -> apply cache immediately, then revalidate silently;
    ///   the fresh result replaces the cached one when it lands.
    /// - `.expired`/`.empty` -> fetch the network, apply, persist.
    ///
    /// The cache key is the single bucket `"list"` because the conversation
    /// list only ever calls `CommunityService.shared.list(offset: 0, limit: 10)`
    /// (no search, fixed window). A different bucket / param-aware key would
    /// be needed if the call surface grew to support pagination or search.
    private func loadUserCommunities() async {
        let cacheKey = "list"
        let cacheResult = await CacheCoordinator.shared.communities.load(for: cacheKey)
        switch cacheResult {
        case .fresh(let cached, _):
            applyCommunities(cached)
        case .stale(let cached, _):
            applyCommunities(cached)
            Task {
                do {
                    let response = try await CommunityService.shared.list(offset: 0, limit: 10)
                    applyCommunities(response.data)
                    try? await CacheCoordinator.shared.communities.save(response.data, for: cacheKey)
                } catch {
                    Logger.cache.warning("[ConversationListView] Communities silent revalidate failed: \(error.localizedDescription)")
                }
            }
        case .expired, .empty:
            do {
                let response = try await CommunityService.shared.list(offset: 0, limit: 10)
                applyCommunities(response.data)
                try? await CacheCoordinator.shared.communities.save(response.data, for: cacheKey)
            } catch {
                Logger.messages.error("[ConversationListView] Error loading communities: \(error.localizedDescription)")
            }
        }
    }

    /// Maps API payloads to the domain `MeeshyCommunity` type and updates
    /// both the array and the id-keyed lookup the rows consume. Pulled out
    /// so the cache-first switch in `loadUserCommunities` stays readable
    /// and the same transform is reused across the fresh / stale / network
    /// branches.
    private func applyCommunities(_ apiCommunities: [APICommunity]) {
        let mapped = apiCommunities.map { $0.toCommunity() }
        userCommunities = mapped
        userCommunityLookup = Dictionary(uniqueKeysWithValues: mapped.map { ($0.id, $0) })
    }

    // communitiesSection, categoryFilters, themedSearchBar now live in
    // ConversationListBottomBar (ConversationListView+Overlays.swift).

    // Pull-to-refresh entierement gere par MeeshyRefreshableScroll.
    // Voir Layer 1 dans `mainContentZStack`.
}

// See ThemedConversationRow.swift
// See ConversationListHelpers.swift (SectionHeaderView, ConversationPreviewView, ThemedCommunityCard, ThemedFilterChip, TagChip, legacy wrappers)

// MARK: - Share Link Picker Sheet

struct ShareLinkPickerSheet: View {
    let conversations: [Conversation]
    let onSelect: (Conversation) -> Void
    @Environment(\.dismiss) private var dismiss

    private var theme: ThemeManager { .shared }

    var body: some View {
        NavigationStack {
            Group {
                if conversations.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "link.badge.plus")
                            .font(MeeshyFont.relative(48))
                            .foregroundStyle(MeeshyColors.indigo300)
                        Text(String(localized: "conversation.list.no_eligible_conversation", bundle: .main))
                            .font(MeeshyFont.relative(16, weight: .medium))
                            .foregroundColor(theme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    List(conversations) { conversation in
                        Button {
                            onSelect(conversation)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: conversation.type == .group ? "person.3.fill" : "globe")
                                    .font(MeeshyFont.relative(16))
                                    .foregroundColor(MeeshyColors.indigo500)
                                    .frame(width: 32, height: 32)
                                    .accessibilityHidden(true)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(conversation.name)
                                        .font(MeeshyFont.relative(16, weight: .medium))
                                        .foregroundColor(theme.textPrimary)
                                        .lineLimit(1)

                                    Text(conversation.type.rawValue.capitalized)
                                        .font(MeeshyFont.relative(13))
                                        .foregroundColor(theme.textSecondary)
                                }

                                Spacer()

                                Image(systemName: "link")
                                    .font(MeeshyFont.relative(14))
                                    .foregroundColor(MeeshyColors.indigo400)
                                    .accessibilityHidden(true)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle(String(localized: "conversation.list.create_share_link.title", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.close", bundle: .main)) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}
