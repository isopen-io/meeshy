import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - ConversationListView row & pagination components
//
// Dedicated View structs extracted from ConversationListView so the deeply
// nested per-row and pagination subtrees no longer compose into
// ConversationListView.body's opaque type. That monolithic type exceeded the
// Swift type-checker budget and triggered a type-metadata instantiation crash
// at launch on low-memory devices (iPhone XR / iOS 17.6). Nominal structs (vs
// AnyView) break the type while preserving SwiftUI structural identity, so
// per-row diffing and the inner ThemedConversationRow `.equatable()`
// short-circuit keep working.

// MARK: - Conversation Row Item

/// One conversation row: swipe actions + tappable themed row + context menu
/// + hard-press preview. Extracted from `ConversationListView.conversationRow`.
/// All inputs are plain values / closures so the row re-evaluates only when
/// its own inputs change, not on every ConversationListView body pass.
///
/// Menu d'appui long — deux chemins par version d'OS :
/// - iOS 26+ : `.contextMenu(menuItems:preview:)` NATIF (rendu Liquid Glass
///   système, exposé automatiquement à VoiceOver). Le contenu vient du
///   builder `conversationContextMenu(for:)` (+Overlays) via `nativeContextMenu`.
/// - < iOS 26 : overlay custom (`RowPressBounceModifier` → `onLongPress` →
///   `ConversationContextMenuView`), avec émergence/morph maison.
struct ConversationRowItem: View {
    let conversation: Conversation
    let community: MeeshyCommunity?
    let rowWidth: CGFloat
    let isDragging: Bool
    let presenceState: PresenceState
    let isDark: Bool
    let storyRingState: StoryRingState
    let moodStatus: StatusEntry?
    let typingUsername: String?
    let isSelected: Bool
    let draftSummary: DraftSummary?
    /// B1 (Prisme Linguistique) — viewer preferred languages used to
    /// resolve the last-message preview translation. Passed once from
    /// the list (`AuthManager.currentUser?.preferredContentLanguages`)
    /// instead of read per-row to keep the row equatable.
    let preferredContentLanguages: [String]
    let cachedPreviewMessages: [Message]
    let leadingActions: [SwipeAction]
    let trailingActions: [SwipeAction]
    let onViewStory: () -> Void
    let onViewProfile: () -> Void
    let onViewConversationInfo: () -> Void
    let onMoodBadgeTap: (CGPoint) -> Void
    let onCreateShareLink: (() -> Void)?
    let onTap: () -> Void
    let onLoadPreview: () async -> Void
    /// Fallback < iOS 26 : appui long → overlay de menu custom (dessine ses
    /// icônes). Reçoit la frame GLOBALE de la ligne pressée — point de départ
    /// de l'émergence de l'aperçu (+Overlays). `.zero` quand la frame n'est
    /// pas connue (action de rotor accessibilité) : l'overlay retombe sur le
    /// zoom centré 0.7 → 1.0. Jamais appelé sur iOS 26+ (menu natif).
    let onLongPress: (CGRect) -> Void
    /// Chemin iOS 26+ : items du `.contextMenu` NATIF (rendu Liquid Glass
    /// système), résolus UNE fois à la construction de la row et stockés en
    /// AnyView — précédent MeeshyAvatar (« single, stable array »). Deux
    /// raisons, toutes deux vécues :
    /// 1. Un `@ViewBuilder () -> MenuContent` générique re-exécutait le
    ///    builder à CHAQUE body pass (mesures LazyVStack comprises) et
    ///    matérialisait un tuple géant (9 items + sous-menus) copié en pleine
    ///    récursion de layout → EXC_BAD_ACCESS `initializeWithCopy for
    ///    Button` au LANCEMENT sur iOS 26 (crash 2026-07-11, PAC failure).
    /// 2. Le paramètre générique regonflait le type de la row — la famille
    ///    de crash type-metadata que l'extraction en structs nominales avait
    ///    éliminée (voir l'en-tête du fichier). AnyView est ACCEPTABLE ici,
    ///    contrairement aux rows : un contenu de menu n'a pas d'identité
    ///    structurelle à préserver (reconstruit à l'ouverture du menu).
    /// `EmptyView` boxé sur le chemin fallback < iOS 26 (jamais rendu).
    let nativeContextMenu: AnyView

    var body: some View {
        SwipeableRow(
            leadingActions: leadingActions,
            trailingActions: trailingActions
        ) {
            if #available(iOS 26.0, *) {
                // Menu contextuel NATIF (Liquid Glass) : le système possède le
                // long-press, la preview et l'exposition VoiceOver ; l'avatar
                // garde son propre `.contextMenu` (interaction la plus
                // profonde), donc un appui maintenu dessus n'ouvre PAS le menu
                // de la ligne (feedback user 2026-07-08). Le tap d'ouverture
                // reste un `.onTapGesture` plein-ligne : les gestes internes
                // de l'avatar (story/profil/mood) restent prioritaires.
                rowCore
                    .contentShape(Rectangle())
                    .onTapGesture {
                        HapticFeedback.light()
                        onTap()
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isButton)
                    .accessibilityHint(String(localized: "conversation.row.hint", bundle: .main))
                    .contextMenu {
                        nativeContextMenu
                    } preview: {
                        // Preview statique (non interactive dans un contextMenu
                        // natif) — mêmes inputs que l'overlay custom, sans
                        // callbacks. Largeur pilotée par le call site, comme
                        // l'overlay (source de vérité unique).
                        ConversationPreviewView(
                            conversation: conversation,
                            cachedMessages: cachedPreviewMessages,
                            bannerURL: (conversation.type == .direct ? conversation.participantBanner : conversation.banner)
                                .flatMap { MeeshyConfig.resolveMediaURL($0) },
                            avatarURL: conversation.type == .direct ? conversation.participantAvatarURL : conversation.avatar,
                            storyState: storyRingState,
                            moodEmoji: moodStatus?.moodEmoji,
                            presenceState: conversation.type == .direct ? presenceState : nil,
                            isDirect: conversation.type == .direct
                        )
                        .frame(width: 340)
                    }
                    .task {
                        await onLoadPreview()
                    }
            } else {
                rowCore
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.isButton)
                    .accessibilityHint(String(localized: "conversation.row.hint", bundle: .main))
                    // Les gestes tactiles (tap + long-press) vivent dans l'overlay de
                    // RowPressBounceModifier, HORS de l'élément combiné : cette action
                    // par défaut garantit que le double-tap VoiceOver ouvre toujours
                    // la conversation.
                    .accessibilityAction {
                        onTap()
                    }
                    // Le menu custom n'est pas un `.contextMenu` natif (auto-exposé
                    // à VoiceOver) : cette action de rotor reste le seul accès non-visuel
                    // à épingler/sourdine/archiver/verrouiller depuis la ligne.
                    .accessibilityAction(named: String(
                        localized: "conversation.row.menu_action",
                        defaultValue: "Ouvrir le menu",
                        bundle: .main
                    )) {
                        onLongPress(.zero)
                    }
                    // Appui long → overlay custom (icônes garanties). Le
                    // drag-to-reorder natif (`.onDrag`) a été retiré : il installe une
                    // UIDragInteraction UIKit qui capte le long-press système et
                    // empêchait la gesture SwiftUI d'ouvrir le menu (le `.contextMenu`
                    // natif, lui, se coordonnait avec `.onDrag`). Le déplacement reste
                    // accessible via « Déplacer vers » dans le menu.
                    //
                    // AUCUN DragGesture custom ici — jamais. Un `highPriorityGesture(
                    // DragGesture())` plein-ligne (régression ff5d5649) capturait le
                    // pan vertical du ScrollView parent et figeait le scroll de la
                    // liste sous le doigt. Le LongPressGesture (distance max 10 pt)
                    // s'annule de lui-même dès que le scroll démarre : le pan reste
                    // la propriété exclusive du ScrollView. Le geste « replier
                    // l'aperçu » vit dans l'overlay du menu (+Overlays), hors de tout
                    // contexte scrollable.
                    .modifier(RowPressBounceModifier(onTap: onTap, onTrigger: onLongPress))
                    .task {
                        await onLoadPreview()
                    }
            }
        }
    }

    /// Coeur visuel de la ligne, commun aux deux chemins de menu.
    private var rowCore: some View {
        ThemedConversationRow(
            conversation: conversation,
            community: community,
            availableWidth: rowWidth,
            isDragging: isDragging,
            presenceState: presenceState,
            onViewStory: onViewStory,
            onViewProfile: onViewProfile,
            onViewConversationInfo: onViewConversationInfo,
            onMoodBadgeTap: onMoodBadgeTap,
            onCreateShareLink: onCreateShareLink,
            isDark: isDark,
            storyRingState: storyRingState,
            moodStatus: moodStatus,
            typingUsername: typingUsername,
            isSelected: isSelected,
            draftSummary: draftSummary,
            preferredContentLanguages: preferredContentLanguages
        )
        .equatable()
    }
}

// MARK: - Row interaction metrics

/// Largeur de la bande avant de la ligne réservée aux interactions de
/// l'avatar : padding horizontal de la ligne (`MeeshySpacing.md`) + emprise
/// de l'avatar avec son anneau story (`AvatarContext.conversationList
/// .ringSize`). Les gestes tap/long-press de la LIGNE n'écoutent pas cette
/// bande — l'avatar y possède ses propres gestes (tap story/profil, badge
/// mood, menu contextuel) et un appui maintenu dessus ne doit PAS ouvrir le
/// menu de la ligne (feedback user 2026-07-08).
enum ConversationRowMetrics {
    static let avatarInteractionExclusionWidth: CGFloat =
        MeeshySpacing.md + AvatarContext.conversationList.ringSize
}

// MARK: - Press feedback (réduction pendant l'appui + rebond au trigger)

/// Feedback d'appui de la ligne : réduction à 0.90 dès le toucher (easeOut
/// ≈ 0.2 s), puis rebond élastique visible quand le long-press aboutit à
/// 0.4 s — le spring peu amorti (0.25) donne ≈ 1.05 à ~0.6 s, ≈ 0.98 à
/// ~0.9 s, repos à ~1.5 s, pendant que l'overlay preview jaillit (zoom
/// 0.7 → 1.0, +Overlays). Relâcher (ou scroller > 10 pt) avant les 0.4 s
/// ANNULE : `onPressingChanged(false)` arrive à l'échec du geste et la
/// ligne remonte élastiquement, sans ouvrir le menu.
///
/// Les gestes (tap + détecteur d'appui + déclencheur du menu) sont attachés
/// à un OVERLAY transparent qui couvre la ligne SAUF la bande avatar
/// (`ConversationRowMetrics.avatarInteractionExclusionWidth`, miroir
/// automatique en RTL via le HStack). La bande laissée claire n'est pas
/// hit-testable : les touches y traversent vers l'avatar en dessous (tap
/// story/profil, badge mood, menu contextuel MeeshyAvatar) sans jamais
/// déclencher le long-press de la ligne. Un `.contentShape` restrictif sur
/// la ligne entière n'aurait pas fait l'affaire : il élague le hit-testing
/// du sous-arbre et aurait tué les gestes propres de l'avatar ; et le swipe
/// de `SwipeableRow` (simultaneousGesture ancêtre) doit continuer de
/// fonctionner partout, bande avatar comprise.
///
/// `onPressingChanged` (et PAS `LongPressGesture.updating`) : le callback
/// `updating`/@GestureState ne fire qu'à la RECONNAISSANCE du long-press,
/// pas au touch-down (vérifié frame par frame sur simulateur 2026-07-03 —
/// aucune réduction pendant l'appui) ; `onPressingChanged(true)` arrive,
/// lui, dès le toucher. Le @State vit dans ce ViewModifier, PAS dans
/// `ConversationRowItem` : une View conformée manuellement à Equatable avec
/// du state interne perd ses invalidations @State sur iOS 18+ (footgun
/// BubbleExpandableText). Le modifier est un nœud enfant du gate
/// `.equatable()` — son state s'invalide indépendamment, comme le drag
/// interne de `SwipeableRow`.
private struct RowPressBounceModifier: ViewModifier {
    let onTap: () -> Void
    let onTrigger: (CGRect) -> Void

    @State private var isPressing = false
    /// true quand le long-press a ABOUTI (menu ouvert) : le retour de scale
    /// rebondit alors visiblement (damping 0.25). Tout autre relâchement —
    /// début de swipe d'actions, départ de scroll, tap — retombe sur un
    /// retour discret quasi sans rebond (damping 0.85) : le rebond appartient
    /// au long-press/preview, PAS au swipe des lignes (feedback user
    /// 2026-07-03).
    @State private var triggered = false
    @State private var frameBox = RowFrameBox()

    func body(content: Content) -> some View {
        content
            // Frame globale de la ligne, tenue à jour à chaque layout (scroll
            // compris) dans une boîte INERTE : écrire dans la classe ne
            // déclenche aucune invalidation SwiftUI — une @State CGRect
            // invaliderait la ligne à chaque tick de scroll. `onTrigger` la
            // lit au déclenchement : point de départ de l'émergence.
            .background(
                GeometryReader { geo in
                    Color.clear
                        .onAppear { frameBox.rect = geo.frame(in: .global) }
                        .adaptiveOnChange(of: geo.frame(in: .global)) { _, frame in
                            frameBox.rect = frame
                        }
                }
            )
            .scaleEffect(isPressing ? 0.90 : 1.0)
            // Appui : réduction nette, atteinte vers ~0.2 s (léger delay pour
            // que les débuts de scroll/swipe ne fassent pas flasher la ligne).
            // Relâchement : rebond visible UNIQUEMENT si le menu s'est ouvert ;
            // annulation (swipe, scroll, tap) = retour discret.
            .animation(
                isPressing
                    ? .easeOut(duration: 0.15).delay(0.05)
                    : (triggered
                        ? .spring(response: 0.55, dampingFraction: 0.25)
                        : .spring(response: 0.35, dampingFraction: 0.85)),
                value: isPressing
            )
            // Surface d'interaction de la ligne : tout SAUF la bande avatar.
            // Le Spacer avant n'est pas hit-testable → les touches sur
            // l'avatar traversent vers ses propres gestes ; la zone claire
            // trailing porte le tap d'ouverture + les deux long-press.
            .overlay {
                HStack(spacing: 0) {
                    Spacer()
                        .frame(width: ConversationRowMetrics.avatarInteractionExclusionWidth)
                    Color.clear
                        .contentShape(Rectangle())
                        .onTapGesture {
                            HapticFeedback.light()
                            onTap()
                        }
                        // Détecteur d'état d'appui PUR : minimumDuration
                        // inatteignable, seul `onPressingChanged` sert (true au
                        // touch-down, false au relâchement/échec). Sa variante
                        // `perform:` composée avec le `.onTapGesture` de la
                        // ligne ne fire qu'au RELÂCHEMENT (vérifié frame par
                        // frame 2026-07-03) — d'où le déclencheur séparé.
                        .onLongPressGesture(
                            minimumDuration: 3600,
                            maximumDistance: 10,
                            perform: {},
                            onPressingChanged: { pressing in
                                if pressing { triggered = false }
                                isPressing = pressing
                            }
                        )
                        // Déclencheur du menu : la variante simultanée fire à
                        // minimumDuration PENDANT l'appui (0.4 s), pas au
                        // relâchement.
                        .simultaneousGesture(
                            LongPressGesture(minimumDuration: 0.4)
                                .onEnded { _ in
                                    triggered = true
                                    HapticFeedback.medium()
                                    onTrigger(frameBox.rect)
                                }
                        )
                }
            }
    }
}

/// Boîte mutable inerte pour la frame globale de la ligne — voir le
/// commentaire du `background` dans `RowPressBounceModifier`.
private final class RowFrameBox {
    var rect: CGRect = .zero
}

// MARK: - Equatable re-render gate (list rows)
//
// `ConversationRowItem` carries NO @State (every property is a `let` value or a
// stable closure), so it is a clean `.equatable()` candidate — unlike the
// bubble it has none of the iOS 18+ EquatableView-vs-@State footgun. Without
// this gate the row re-evaluated on every `ConversationListView` body pass and
// rebuilt its `SwipeableRow` wrapper + `.contextMenu` + `preview:` subtree
// (device Allocations trace 2026-06-10: ~800k `TypedElement<…ButtonStyle…>`
// allocations). The `==` MIRRORS `ThemedConversationRow.==` field-for-field
// (so the visible content is never under-compared — `renderFingerprint` folds
// every render-affecting conversation field) and adds the SwipeableRow geometry
// (action counts) + the share-link affordance toggle. Closures are assumed
// stable (they capture `conversation`, which is compared); the context-menu /
// preview closures are long-press-only, so minor staleness there is acceptable.
extension ConversationRowItem: @MainActor Equatable {
    static func == (lhs: ConversationRowItem, rhs: ConversationRowItem) -> Bool {
        lhs.conversation.id == rhs.conversation.id &&
        lhs.conversation.renderFingerprint == rhs.conversation.renderFingerprint &&
        lhs.community?.id == rhs.community?.id &&
        lhs.rowWidth == rhs.rowWidth &&
        lhs.isDragging == rhs.isDragging &&
        lhs.presenceState == rhs.presenceState &&
        lhs.isDark == rhs.isDark &&
        lhs.storyRingState == rhs.storyRingState &&
        lhs.moodStatus?.id == rhs.moodStatus?.id &&
        lhs.typingUsername == rhs.typingUsername &&
        lhs.isSelected == rhs.isSelected &&
        lhs.draftSummary == rhs.draftSummary &&
        lhs.preferredContentLanguages == rhs.preferredContentLanguages &&
        // Compare swipe action ICONS, not just `.count`: the lock/block toggles
        // (`leadingSwipeActions`/`trailingSwipeActions`) read live state from
        // `ConversationLockManager` / `BlockService` — singletons NOT folded into
        // `renderFingerprint`. Counting alone would freeze a stale "Unblock" /
        // "Unlock" action behind the equatable gate (the icon encodes the state:
        // hand.raised.fill ⇄ hand.raised.slash.fill, lock.fill ⇄ lock.open.fill).
        // The list now observes both singletons (see ConversationListView) so a
        // change re-evaluates the rows and this comparison detects it. Zip avoids
        // allocating arrays in `==`.
        lhs.leadingActions.count == rhs.leadingActions.count &&
        lhs.trailingActions.count == rhs.trailingActions.count &&
        zip(lhs.leadingActions, rhs.leadingActions).allSatisfy { $0.icon == $1.icon } &&
        zip(lhs.trailingActions, rhs.trailingActions).allSatisfy { $0.icon == $1.icon } &&
        (lhs.onCreateShareLink == nil) == (rhs.onCreateShareLink == nil) &&
        lhs.cachedPreviewMessages.count == rhs.cachedPreviewMessages.count
    }
}

// MARK: - Pagination Footer

/// Cursor-based infinite-scroll footer driven by `paginationState`.
/// Extracted from `ConversationListView.paginationFooter`. Rendered once at
/// the tail of the list, so it reads the view model directly rather than
/// taking a dozen primitive inputs.
struct ConversationPaginationFooter: View {
    @EnvironmentObject var conversationViewModel: ConversationListViewModel

    var body: some View {
        switch conversationViewModel.paginationState {
        case .loadingMore:
            HStack {
                Spacer()
                ProgressView()
                    .tint(MeeshyColors.indigo400)
                Spacer()
            }
            .padding(.vertical, 16)
        case .exhausted:
            // Show the "all loaded" hint only on lists that actually
            // had to paginate -- avoids cluttering empty/small lists.
            if conversationViewModel.conversations.count > 30 {
                Text(String(
                    localized: "conversations.pagination.allLoaded",

                ))
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
            }
        case .error:
            VStack(spacing: 6) {
                Text(String(
                    localized: "conversations.pagination.errorTitle",

                ))
                .font(.caption)
                .foregroundStyle(.secondary)
                Button {
                    Task { await conversationViewModel.loadMore() }
                } label: {
                    Text(String(
                        localized: "conversations.pagination.retry",

                    ))
                    .font(.caption.weight(.medium))
                    .foregroundStyle(MeeshyColors.indigo400)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
        case .idle:
            // Invisible sentinel: when the user scrolls deep enough to
            // reveal this row, fire `loadMore`. The ViewModel guards
            // against re-entry and short-circuits when hasMore=false.
            if conversationViewModel.hasMore {
                Color.clear
                    .frame(height: 1)
                    .onAppear {
                        Task { await conversationViewModel.loadMore() }
                    }
            }
        }
    }
}
