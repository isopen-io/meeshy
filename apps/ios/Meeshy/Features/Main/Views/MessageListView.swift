import SwiftUI
import MeeshySDK
import MeeshyUI

/// Émis (à `true`) par une bulle dont le carrousel média inline est ouvert :
/// le pager horizontal possède alors le glissement gauche/droite, donc le
/// swipe Répondre/Transférer du `BubbleSwipeContainer` parent doit s'effacer
/// jusqu'au retour à la grille (fermeture du carrousel → la branche disparaît
/// de la hiérarchie et la préférence retombe à `defaultValue`).
struct BubbleInlinePagingPreferenceKey: PreferenceKey {
    static let defaultValue: Bool = false
    static func reduce(value: inout Bool, nextValue: () -> Bool) {
        value = value || nextValue()
    }
}

/// Wraps a bubble with a horizontal swipe gesture that fires either a reply
/// or forward action. Restored from the pre-bubble-decompose `+MessageRow`
/// SwiftUI list layout — the new UICollectionView host (MessageListViewController)
/// no longer carries the legacy gesture, so any cell that wants swipe support
/// must opt in via this container.
///
/// Swipe direction follows the same convention as the original list:
/// `replyDirection = isMine ? -1 : +1`. Reply lives on the side that
/// "points back" at the sender (right for received, left for sent), and
/// forward sits on the opposite side.
///
/// State is local to the container — each cell owns its own offset,
/// so reuse never leaks the in-flight drag of a previous row. The drag
/// commits at ~92% of the action zone (≥66pt out of 72pt) with rubber
/// banding past the zone (15% resistance) and haptic feedback at commit.
struct BubbleSwipeContainer<Content: View>: View {
    let isMine: Bool
    /// Identifier published via `MessageFramePreferenceKey` so the long-press
    /// overlay can locate this cell's screen frame at gesture fire time.
    let messageId: String
    /// Used by the swipe indicator to display a "day month / hh:mm" stamp
    /// before the user has dragged past the reply threshold.
    let messageCreatedAt: Date
    /// `true` while the long-press overlay is presenting this exact cell —
    /// the live row fades to `opacity: 0` so only the elevated copy in the
    /// overlay is visible. Frame publication continues so the overlay can
    /// keep the bubble pinned to its real position.
    var isHiddenForOverlay: Bool = false
    /// Résistance du swipe latéral selon le type de contenu. `.resistant`
    /// (audio/vidéo) relève le seuil pour ne pas gêner le scrubber de lecture.
    var resistance: SwipeResistance = .normal
    /// Rangée plate (Script) : géométrie UNIFORME — reply = glisser à DROITE
    /// (icône à GAUCHE), forward = glisser à GAUCHE (icône à DROITE),
    /// indépendant de `isMine` (tous les messages sont alignés pareil,
    /// directive user 2026-08-18). `false` (bulles) : convention historique.
    var uniformFlatDirection: Bool = false
    let onSwipeReply: () -> Void
    let onSwipeForward: () -> Void
    /// Long press triggers the message's contextual options (reply, forward,
    /// reactions, copy, delete, …). The container fires the haptic so each
    /// caller doesn't have to.
    let onLongPress: () -> Void
    /// `false` (iOS 26+) désactive le `LongPressGesture` custom : le cell
    /// attache alors un `.contextMenu` NATIF (Liquid Glass) qui possède la
    /// pression. `true` (< iOS 26) garde le long-press → overlay custom.
    /// Les deux ne coexistent jamais (double déclenchement).
    var enableLongPress: Bool = true
    /// **Mode sélection multiple (#4005).** `true` : un tap sur la cellule
    /// bascule la sélection au lieu de son geste habituel — un capteur
    /// transparent se pose PAR-DESSUS `content()` (fonctionne quel que soit
    /// ce que fait la bulle en dessous : traduction, carrousel média, etc.),
    /// et swipe/longpress s'effacent (une seule intention à la fois).
    var isSelectionModeActive: Bool = false
    var isSelected: Bool = false
    var onToggleSelection: (() -> Void)? = nil
    @ViewBuilder let content: () -> Content

    @State private var offset: CGFloat = 0
    @State private var didCrossThreshold: Bool = false
    /// Miroir de `BubbleInlinePagingPreferenceKey` remonté par la bulle :
    /// vrai tant que le carrousel média inline est ouvert — le drag
    /// reply/forward est alors totalement désengagé (même règle que le
    /// scrubbing média).
    @State private var isInlinePagingActive: Bool = false
    /// Miroir de `MediaScrubbingPreferenceKey` (SDK) remonté par les widgets
    /// média : vrai pendant qu'un doigt manipule la waveform audio ou la seek
    /// bar vidéo. Remplace l'ancien paramètre `isScrubbing` qui n'était câblé
    /// par aucun call site — la protection scrubbing → swipe était inopérante.
    @State private var isMediaScrubbing: Bool = false

    private var replyDirection: CGFloat {
        BubbleSwipeResistance.replyDirection(uniformFlatRow: uniformFlatDirection, isMine: isMine)
    }

    private var indicatorAlignment: Alignment {
        switch BubbleSwipeResistance.indicatorEdge(
            uniformFlatRow: uniformFlatDirection, isMine: isMine, offset: offset
        ) {
        case .leading: return .leading
        case .trailing: return .trailing
        }
    }

    /// **Retour porteur 2026-08-27 (#4005 bis, puis ter).** En mode
    /// sélection, une bulle se décalait à droite pour loger son cercle
    /// SEULEMENT si elle était REÇUE (`!isMine`) — la bulle ENVOYÉE gardait
    /// son cercle au coin haut-droit. Deuxième retour porteur, explicite :
    /// **toujours à gauche, qu'importe `isMine` ET qu'importe le mode de
    /// lecture** — colonne de cases à cocher unique, façon Mail/Fichiers,
    /// jamais un coin qui dépend du sens de la bulle.
    ///
    /// Diamètre du glyphe SF Symbol (`.font(.system(size: 20))` ci-dessous,
    /// halo de fond exclu) — l'unité que le porteur nomme « taille du
    /// cercle ».
    private static var selectionCircleDiameter: CGFloat { 20 }

    /// Bulle (River/Résumé compris, `uniformFlatDirection == false`) : 3×.
    /// Plat (Focal/Script, `uniformFlatDirection == true`) : 2×.
    private var selectionShiftMultiplier: CGFloat {
        uniformFlatDirection ? 2 : 3
    }

    /// Largeur de la marge ouverte à GAUCHE de la bulle en mode sélection —
    /// 0 hors sélection, pour laisser le repos existant strictement
    /// inchangé. S'applique à TOUTE bulle, envoyée ou reçue (retour porteur
    /// 2026-08-27 ter : « qu'importe le mode »).
    private var selectionShift: CGFloat {
        guard isSelectionModeActive else { return 0 }
        return Self.selectionCircleDiameter * selectionShiftMultiplier
    }

    /// Centre le cercle DANS `selectionShift` (bord ← [marge] → bulle),
    /// plutôt que collé à l'un ou l'autre.
    private var selectionLeadingCircleInset: CGFloat {
        max(0, (selectionShift - Self.selectionCircleDiameter) / 2)
    }

    // Pre-formatted on `messageCreatedAt` (a `let`) so the indicator's body
    // re-evaluation during drag doesn't re-run `Date.formatted` 60 times per
    // second. SwiftUI doesn't track these as dependencies (they're computed
    // from a stable input), so they're effectively memoized for the cell's
    // lifetime.
    private var swipeStampDay: String {
        messageCreatedAt.formatted(.dateTime.day().month(.abbreviated))
    }
    private var swipeStampTime: String {
        messageCreatedAt.formatted(.dateTime.hour().minute())
    }

    var body: some View {
        // ZStack stacks the (small, edge-pinned) swipe indicator BEHIND the
        // bubble. The bubble starts on top of the indicator; as the drag
        // grows, `.offset(x:)` slides the bubble away and the indicator
        // becomes visible in the freed-up gap. Same pattern as iMessage —
        // indicator never participates in layout sizing, so the cell still
        // adapts to the bubble's intrinsic width.
        ZStack(alignment: indicatorAlignment) {
            swipeIndicator
                .padding(.horizontal, 8)

            content()
                .padding(.leading, selectionShift)
                .offset(x: offset)
                .accessibilityAction(named: String(localized: "a11y.message.actions.reply", bundle: .main)) { onSwipeReply() }
                .accessibilityAction(named: String(localized: "a11y.message.actions.forward", bundle: .main)) { onSwipeForward() }
                .accessibilityAction(named: String(localized: "a11y.message.actions.long_press", bundle: .main)) { onLongPress() }
                // Plus de `GeometryReader` + préférence par cellule : hébergée
                // dans une `UIHostingConfiguration`, la préférence ne franchit
                // jamais la frontière UIKit jusqu'à `ConversationView` — la
                // frame du menu flottant vient de `cellFrameInWindow` (UIKit).
                // C'était une vue et une écriture de préférence par cellule et
                // par layout, pour rien (audit fluidité 2026-08-21).
                .opacity(isHiddenForOverlay ? 0 : 1)
                .animation(BubbleAnimations.overlayRevealCrossfade, value: isHiddenForOverlay)
                .onPreferenceChange(BubbleInlinePagingPreferenceKey.self) { isInlinePagingActive = $0 }
                .onPreferenceChange(MediaScrubbingPreferenceKey.self) { isMediaScrubbing = $0 }
                // Mode sélection (#4005) : swipe/longpress s'effacent — une
                // seule intention à la fois, même patron que le carrousel
                // média (`isInlinePagingActive`) et le scrubbing.
                .simultaneousGesture(dragGesture, including: isSelectionModeActive ? .none : .all)
                // Long press surfaces via `simultaneousGesture` so it
                // cooperates with the inner reaction "+" tap. The parent
                // (ConversationView) renders a custom overlay that keeps
                // the bubble at its source position (looked up via
                // MessageFramePreferenceKey above), with adaptive lift
                // and a compact action menu — that's what `onLongPress`
                // is wired to. Duration tightened from 0.45 → 0.35 to
                // match iMessage/WhatsApp reactivity.
                //
                // `maximumDistance: 6` (default 10) : on rétrécit la
                // fenêtre de tolérance du long press pour que dès que le
                // doigt bouge de 6pt — ce qui suffit largement à
                // déclencher un scroll vertical sur UICollectionView —
                // le LongPressGesture s'annule et laisse le pan parent
                // s'approprier le geste sans aucune contention. Le
                // scroll est ainsi prioritaire sur le long press.
                //
                // iOS 26+ : `enableLongPress == false` — le cell attache
                // un `.contextMenu` NATIF (Liquid Glass) qui possède la
                // pression ; ce geste custom est retiré pour éviter le
                // double déclenchement (overlay custom + menu natif).
                .modifier(ConditionalBubbleLongPress(enabled: enableLongPress && !isSelectionModeActive, action: onLongPress))

            // **Capteur de sélection (#4005).** Par-dessus TOUT — fonctionne
            // quel que soit ce que fait la bulle en dessous (traduction,
            // carrousel média…). Un tap qui aurait ouvert une action dans la
            // bulle est INTERCEPTÉ pendant la sélection — comportement voulu,
            // pas un défaut.
            if isSelectionModeActive {
                Rectangle()
                    .fill(Color.clear)
                    .contentShape(Rectangle())
                    .onTapGesture { onToggleSelection?() }
                    .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
                    .accessibilityLabel(Text(
                        String(localized: "conversation.selection.toggleMessage", defaultValue: "Message", bundle: .main)
                    ))
            }
        }
        // Toujours coin haut-GAUCHE, centré dans `selectionShift` par
        // `selectionLeadingCircleInset` — qu'importe `isMine`, qu'importe le
        // mode de lecture (retour porteur 2026-08-27 ter).
        .overlay(alignment: .topLeading) {
            if isSelectionModeActive {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 20))
                    .foregroundStyle(isSelected ? Color.accentColor : Color.secondary.opacity(0.6))
                    .background(Circle().fill(.background).frame(width: 18, height: 18))
                    .padding(.top, 6)
                    .padding(.leading, selectionLeadingCircleInset)
                    .allowsHitTesting(false)
            }
        }
    }

    @ViewBuilder
    private var swipeIndicator: some View {
        let directed = offset * replyDirection
        let isReplyDir = directed > 0
        let isOverThreshold = abs(offset) >= 66
        let visibility = min(1.0, abs(offset) / 24.0)

        if abs(offset) > 8 {
            ZStack {
                if isOverThreshold {
                    // Past the commit threshold — the action icon REPLACES
                    // the date stamp. Reply (curved arrow back) for reply
                    // direction, forward (curved arrow forward) for the
                    // opposite. Crossfade transition keeps the swap subtle.
                    Image(systemName: isReplyDir ? "arrowshape.turn.up.left.fill" : "arrowshape.turn.up.right.fill")
                        .font(MeeshyFont.relative(22, weight: .semibold))
                        .foregroundStyle(MeeshyColors.brandPrimary)
                        .transition(.scale.combined(with: .opacity))
                } else {
                    // Under the threshold — day + hour stamp gives the user
                    // context (when the message was sent) while they decide
                    // whether to commit the gesture.
                    VStack(spacing: 2) {
                        Text(swipeStampDay)
                            .font(MeeshyFont.relative(11, weight: .medium))
                        Text(swipeStampTime)
                            .font(MeeshyFont.relative(12, weight: .semibold))
                    }
                    .foregroundColor(.secondary)
                    .transition(.opacity)
                }
            }
            .frame(width: 64)
            .opacity(visibility)
            .animation(.easeInOut(duration: 0.15), value: isOverThreshold)
        }
    }

    private var dragGesture: some Gesture {
        // `minimumDistance: 22` (avant 15) : on élargit la fenêtre
        // pendant laquelle le pan UICollectionView a priorité exclusive
        // sur le swipe horizontal de la bulle. Tant que le doigt n'a
        // pas parcouru 22pt, AUCUN événement n'arrive à ce gesture —
        // le scroll vertical peut donc démarrer instantanément sans
        // contention. 22pt reste largement en-dessous d'un swipe
        // horizontal réel (~60-100pt), donc reply/forward continuent
        // de répondre normalement.
        DragGesture(minimumDistance: BubbleSwipeResistance.minimumDistance(resistance))
            .onChanged { value in
                let h = value.translation.width
                // Décision d'engagement centralisée dans la logique pure
                // `BubbleSwipeResistance` (testée) : dominance horizontale +
                // seuil selon la résistance, et abandon total pendant un
                // scrubbing média. En `.normal` : 3:1 / 22pt (comportement
                // historique). En `.resistant` : 4:1 / 48pt + priorité scrubber.
                // Carrousel inline ouvert → le pager possède le glissement
                // horizontal : reply/forward désengagés au même titre qu'un
                // scrubbing média, jusqu'au retour à la grille.
                guard BubbleSwipeResistance.shouldEngage(
                    translationWidth: h,
                    translationHeight: value.translation.height,
                    isScrubbing: BubbleSwipeResistance.isGestureOwnershipClaimed(
                        mediaScrubbing: isMediaScrubbing,
                        inlinePaging: isInlinePagingActive
                    ),
                    resistance: resistance
                ) else { return }
                let zone: CGFloat = 72
                let absH = abs(h)
                let sign: CGFloat = h > 0 ? 1 : -1
                if absH > zone {
                    offset = sign * (zone + (absH - zone) * 0.15)
                } else {
                    offset = h
                }
                // Light haptic the moment we cross the commit threshold
                // (and only once per drag) so the user feels the bubble
                // "snap" into the action zone before they let go.
                let crossed = abs(offset) >= 66
                if crossed && !didCrossThreshold {
                    didCrossThreshold = true
                    HapticFeedback.light()
                } else if !crossed && didCrossThreshold {
                    didCrossThreshold = false
                }
            }
            .onEnded { _ in
                let directed = offset * replyDirection
                if directed >= 66 {
                    onSwipeReply()
                    HapticFeedback.success()
                } else if directed <= -66 {
                    onSwipeForward()
                    HapticFeedback.success()
                }
                didCrossThreshold = false
                withAnimation(.spring(response: 0.42, dampingFraction: 0.62, blendDuration: 0.04)) {
                    offset = 0
                }
            }
    }
}


/// Applique le `LongPressGesture` custom de la bulle UNIQUEMENT quand
/// `enabled` (< iOS 26). Sur iOS 26+ le cell attache un `.contextMenu` natif
/// à la place — ce geste doit alors disparaître pour éviter le double
/// déclenchement. Un modifier conditionnel (plutôt qu'un `.simultaneousGesture`
/// masqué) garantit que le recognizer n'est même pas installé.
private struct ConditionalBubbleLongPress: ViewModifier {
    let enabled: Bool
    let action: () -> Void

    func body(content: Content) -> some View {
        if enabled {
            content.simultaneousGesture(
                LongPressGesture(minimumDuration: 0.35, maximumDistance: 6)
                    .onEnded { _ in
                        HapticFeedback.medium()
                        action()
                    }
            )
        } else {
            content
        }
    }
}

/// Attache un `.contextMenu` NATIF (Liquid Glass iOS 26) au contenu SwiftUI
/// d'une cellule de message quand un builder est fourni ET que l'OS rend le
/// menu système. `menu` est résolu UNE fois par configuration de cellule
/// (précédent `ConversationRowItem.nativeContextMenu` : AnyView stable, jamais
/// un `@ViewBuilder` générique — sinon EXC_BAD_ACCESS iOS 26). `preview` rend
/// la VRAIE bulle d'origine à l'endroit (la collection view étant inversée, le
/// snapshot par défaut ne l'affichait pas correctement) — feedback 2026-07-14.
extension View {
    @ViewBuilder
    func nativeMessageContextMenu<Preview: View>(
        menu: (() -> AnyView)?,
        @ViewBuilder preview: @escaping () -> Preview
    ) -> some View {
        if #available(iOS 26.0, *), let menu {
            self.contextMenu { menu() } preview: { preview() }
        } else {
            self
        }
    }
}

// MARK: - Aperçu du menu contextuel de message (hug + scale-to-fit)

/// Conteneur d'aperçu du `.contextMenu` NATIF d'un message. Il rend la bulle
/// « standalone » (déjà dépouillée de ses spacers de row côté `BubbleStandard
/// Layout` → elle épouse son contenu) et la met à l'échelle UNIQUEMENT si elle
/// dépasse la hauteur disponible, pour qu'elle tienne dans l'écran SANS jamais
/// déformer ses proportions. La `.frame` finale (dimensions mises à l'échelle)
/// informe le layout SwiftUI de la taille visible — le platter système colle
/// alors à la bulle, sans bordure ni card. Anti-« effet bordure » 2026-07-14.
struct MessageMenuPreviewContainer<Content: View>: View {
    @ViewBuilder let content: () -> Content
    @State private var naturalSize: CGSize = .zero

    /// Plafond de hauteur de l'aperçu — 62 % de la **fenêtre** de l'app, pour
    /// laisser respirer la rangée d'emojis + le menu au-dessus/dessous. Mesuré
    /// sur la fenêtre et non sur l'écran physique : en Split View, Slide Over
    /// ou Stage Manager, l'app n'occupe qu'une fraction de l'écran, et un
    /// plafond dérivé de l'écran cesse alors de plafonner quoi que ce soit.
    /// (L'overlay custom `MessageOverlayMenu` poursuit le même but avec un
    /// plafond FIXE de 320 pt : il met à l'échelle une frame déjà capturée,
    /// pas une taille naturelle — mécanisme distinct, pas une valeur jumelle.)
    private var maxHeight: CGFloat { DeviceLayout.windowSize.height * 0.62 }

    private var fitScale: CGFloat {
        guard naturalSize.height > maxHeight, naturalSize.height > 0 else { return 1 }
        // Plancher 0.5 : au-delà, un média très haut resterait lisible plutôt
        // que de rétrécir à l'infini (l'overlay custom pose le sien à 0.55).
        return max(0.5, maxHeight / naturalSize.height)
    }

    var body: some View {
        content()
            .background(
                GeometryReader { proxy in
                    Color.clear.preference(key: MessageMenuPreviewSizeKey.self, value: proxy.size)
                }
            )
            .onPreferenceChange(MessageMenuPreviewSizeKey.self) { naturalSize = $0 }
            .scaleEffect(fitScale, anchor: .center)
            .frame(
                width: naturalSize.width > 0 ? naturalSize.width * fitScale : nil,
                height: naturalSize.height > 0 ? naturalSize.height * fitScale : nil
            )
    }
}

private struct MessageMenuPreviewSizeKey: PreferenceKey {
    static let defaultValue: CGSize = .zero
    static func reduce(value: inout CGSize, nextValue: () -> CGSize) {
        let next = nextValue()
        if next != .zero { value = next }
    }
}

struct MessageListView: UIViewControllerRepresentable {
    let store: MessageStore
    /// Owner of the live per-message dynamic state (translations,
    /// transcriptions, audio translations, last-message gating). Held weakly
    /// by the underlying controller; the controller snaps required values
    /// into immutable `let`s at cell-config time so SwiftUI doesn't observe
    /// the VM directly from inside cells.
    let conversationViewModel: ConversationViewModel
    let currentUserId: String
    let accentColor: String
    let isDirect: Bool
    /// Vertical clearance reserved at the bottom of the list so the latest
    /// message is never hidden behind the composer/keyboard.
    /// Pass the composer height here.
    var bottomInset: CGFloat = 0
    /// Hauteur de la bande status bar / Dynamic Island que la liste recouvre :
    /// le parent l'étend sous la safe area haute pour que les bulles défilent
    /// jusqu'au bord de l'écran, et lui passe ici l'inset réel de la fenêtre
    /// (`DeviceLayout.safeAreaTop`) — sous `ignoresSafeArea`, ni le
    /// `GeometryReader` ni le contrôleur hébergé ne le connaissent.
    var topInset: CGFloat = 0
    /// Incremented from the parent SwiftUI view when the "scroll to latest"
    /// button is tapped. The bridge compares old vs. new to fire scrollToBottom.
    var scrollToBottomTrigger: Int = 0
    /// Set by the parent when a quoted message has been loaded from the server
    /// and the VC needs to scroll to it. Pair with `scrollToMessageTrigger`
    /// (counter) so the bridge detects each distinct request.
    var scrollToMessageId: String? = nil
    var scrollToMessageTrigger: Int = 0
    /// Incrémenté par le parent aux instants où le lecteur DÉCLARE regarder le
    /// bas : ouverture de l'écran, bouton « dernier message », départ en
    /// arrière-plan. Le pont déclenche alors `flushSeenNow()`, qui signale ce
    /// qui est affiché sans attendre le seuil de présence.
    var flushSeenTrigger: Int = 0
    /// True while the ViewModel is searching for a quoted message on the server.
    /// Drives the slow continuous scroll on the underlying UICollectionView.
    var isSearchingQuotedMessage: Bool = false
    /// Header de conversation déplié. Masque la pill de jour tant qu'il est
    /// ouvert (voir `MessageDayStickyState.isHeaderExpanded`).
    ///
    /// Déclaré ICI, avec les autres valeurs de configuration, et non parmi les
    /// `on…` : l'init mémberwise d'une `View` impose l'ordre de déclaration aux
    /// call sites, donc la place d'un stockage n'est pas qu'une question de
    /// lisibilité — glissé entre deux callbacks, il force le parent à passer
    /// une config au milieu de ses fermetures.
    var isHeaderExpanded: Bool = false
    /// Mode de lecture réellement rendu — décision de l'orchestrateur WS-7
    /// (`ConversationView.init`, F-086, futur). Défaut `.bubbles` : tant que
    /// rien ne le pose, comportement bit-à-bit identique à aujourd'hui
    /// (contrat §WS-6, travail 10 — nouvelles props AVANT les closures
    /// `on…`, contrainte d'ordre de l'init memberwise, `:382-387`).
    var readingMode: ConversationReadingMode = .bubbles
    var onNewMessagesBadge: ((Int) -> Void)?
    var onScrollToMessage: ((String) -> Void)?
    /// Invoked when the user approaches the older-messages threshold. Wire to
    /// `ConversationViewModel.loadOlderMessages()` so pagination chains cache
    /// then network — bypassing this hook leaves the store stuck on whatever
    /// GRDB already holds.
    var onLoadOlder: (() async -> Void)?
    /// Invoked when the scroll position crosses the near-bottom threshold.
    /// Drives the floating "scroll to latest" button in the parent SwiftUI view.
    var onNearBottomChanged: ((Bool) -> Void)?
    /// Invoked when active scrolling (drag or deceleration) starts/stops.
    /// Wire to fade the header's ACTION BUTTONS while true (loi `ScrollMotion`) —
    /// le header et la pill de jour, eux, restent posés.
    var onScrollingActiveChanged: ((Bool) -> Void)?
    /// Identifiants SERVEUR des messages restés assez longtemps à l'écran pour
    /// compter comme lus. Voir
    /// `docs/superpowers/specs/2026-07-24-read-exactness-design.md`.
    var onMessagesSeen: (([String], [String]) -> Void)?
    /// Tap on a story reply preview inside a bubble. Argument is the story id
    /// (not the message id) — the parent resolves it to a story group + slide.
    var onStoryReplyTap: ((String) -> Void)?
    /// Tap on the sender avatar's story ring in a bubble footer. Argument is
    /// the sender's user id — the parent presents the story viewer.
    var onViewSenderStory: ((String) -> Void)?
    /// Swipe-to-reply on a bubble. Argument is the swiped message id.
    var onSwipeReply: ((String) -> Void)?
    /// Swipe-to-forward on a bubble. Argument is the swiped message id.
    var onSwipeForward: ((String) -> Void)?
    /// Long-press on a bubble — opens the contextual options menu for that
    /// message (reply, forward, react, copy, delete, …). Le second paramètre
    /// portait l'aperçu Focal (pixels de la cellule vivante) jusqu'au
    /// 2026-08-23 : la capture, bornée aux `bounds` de la cellule, tranchait
    /// en deux l'identité et la barre de méta que le mode Focal fait tenir à
    /// cheval sur son cadre. L'overlay rend désormais le message NORMAL, dans
    /// tous les modes de lecture.
    ///
    /// Le SECOND paramètre du tuple porte désormais le frame RÉEL de la
    /// cellule (`cellFrameInWindow`, résolu côté UIKit) — #4004 (2026-08-27) :
    /// `MessageFramePreferenceKey` ne traverse la frontière UIKit qu'en mode
    /// Rivière (`RiverBubbleView`), jamais pour la liste standard.
    var onLongPress: ((String, CGRect?) -> Void)?
    /// iOS 26+ : contenu du `.contextMenu` NATIF (Liquid Glass) d'une bulle,
    /// construit par `ConversationView` (là où toutes les actions sont déjà
    /// résolues) — mêmes callbacks que l'overlay custom. `nil` < iOS 26 (le
    /// long-press custom → overlay reste alors le chemin).
    var nativeMessageMenu: ((Message) -> AnyView)? = nil
    /// id de la bulle présentée dans l'overlay custom d'appui long — la
    /// cellule live correspondante est masquée (opacity 0) le temps de
    /// l'overlay (anti double-bulle fantôme). `nil` = aucune.
    var overlaidMessageId: String? = nil
    /// Long-press on a call-summary notice → request the shared call-detail
    /// sheet for that message, distinct from `onLongPress`'s regular-message menu.
    var onCallDetailRequest: ((String) -> Void)?
    /// **Mode sélection multiple (#4005).** `false`/`[]` par défaut — sans
    /// effet sur les écrans qui ne câblent pas ces trois paramètres.
    var isSelectionModeActive: Bool = false
    var selectedMessageIds: Set<String> = []
    var onToggleSelection: ((String) -> Void)?
    /// User-initiated reaction add. Carries the message id and the tapped
    /// bubble cell's on-screen frame (window coords, `nil` when the cell is
    /// not realized) so the quick-reaction bar can anchor to the bubble.
    var onAddReaction: ((String, CGRect?) -> Void)?
    /// Toggle a reaction emoji on a message (tap an existing reaction chip).
    var onToggleReaction: ((String, String) -> Void)?
    /// BUG2 A' — réaction par-image (attachmentId, messageId, emoji).
    var onReactToAttachment: ((String, String, String) -> Void)?
    /// Open the full reactions list / picker sheet for a message.
    var onOpenReactPicker: ((String) -> Void)?
    /// Open the message detail sheet on the "info / views" tab.
    var onShowMessageInfo: ((String) -> Void)?
    /// Tap on the delivery checkmarks (✓ / ✓✓ / ✓✓ bleu) of a sent message —
    /// opens the detail sheet directly on the "vues" tab so the author can
    /// inspect read receipts without going through the long-press menu.
    var onShowReadStatus: ((String) -> Void)?
    /// Manual resend of a FAILED outgoing message (id) → `retryMessage`.
    var onRetry: ((String) -> Void)?
    /// Open the message detail sheet on the "reactions" tab.
    var onShowReactions: ((String) -> Void)?
    /// Open the message detail sheet on the "language / translation" tab.
    var onShowTranslationDetail: ((String) -> Void)?
    var onReadMore: ((FocalReadMorePayload) -> Void)?
    /// Lot 3.2 — carte lieu / partage fichier de la rangée plate.
    var onFocalTapLocation: ((SharedPlace) -> Void)?
    var onFocalShareFile: ((URL) -> Void)?
    /// Tap on a media attachment — typically pushes a fullscreen viewer.
    var onMediaTap: ((MessageAttachment) -> Void)?
    /// Consume a view-once message; the bubble flips to the consumed state.
    var onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    /// Request an on-demand translation of a specific message into a target
    /// language (issues a socket `translation:request`).
    var onRequestTranslation: ((String, String) -> Void)?
    @EnvironmentObject private var router: Router
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @Environment(\.colorScheme) private var colorScheme

    class Coordinator {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
        var lastScrollToBottomTrigger: Int = 0
        var lastScrollToMessageTrigger: Int = 0
        var lastFlushSeenTrigger: Int = 0
        var wasSearchingQuotedMessage: Bool = false
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIViewController(context: Context) -> MessageListViewController {
        let vc = MessageListViewController(
            store: store,
            currentUserId: currentUserId,
            accentColor: accentColor,
            isDirect: isDirect,
            isDark: colorScheme == .dark,
            router: router,
            storyViewModel: storyViewModel,
            statusViewModel: statusViewModel,
            conversationListViewModel: conversationListViewModel
        )
        vc.onNewMessagesBadge = onNewMessagesBadge
        vc.onScrollToMessage = onScrollToMessage
        vc.onLoadOlder = onLoadOlder
        vc.onNearBottomChanged = onNearBottomChanged
        vc.onScrollingActiveChanged = onScrollingActiveChanged
        vc.isHeaderExpanded = isHeaderExpanded
        // WS-6 (F-085) : posées AVANT `applyBottomInset`/`applyTopInset`
        // ci-dessous — `applyTopInset` recompose `headInset` (§4.5) à partir
        // de `readingMode`/`hasReachedOldest`, qui doivent donc déjà être à
        // jour au moment de son premier appel.
        vc.readingMode = readingMode
        // #3947 — cf. `updateUIViewController` : la liste ne se dessine
        // pas sous un pane opaque. Posé dès le montage, sinon une ouverture
        // DIRECTE en Rivière rendrait le fil une fois pour rien.
        vc.view.isHidden = !MessageListViewController.rendersThread(readingMode)
        vc.onMessagesSeen = onMessagesSeen
        vc.onStoryReplyTap = onStoryReplyTap
        vc.onViewSenderStory = onViewSenderStory
        vc.onSwipeReply = onSwipeReply
        vc.onSwipeForward = onSwipeForward
        vc.onLongPress = onLongPress
        vc.nativeMessageMenu = nativeMessageMenu
        vc.overlaidMessageId = overlaidMessageId
        // #4005 — `didSet` gardés côté VC (même patron que `readingMode`).
        vc.isSelectionModeActive = isSelectionModeActive
        vc.selectedMessageIds = selectedMessageIds
        vc.onToggleSelection = onToggleSelection
        vc.onAddReaction = onAddReaction
        vc.onToggleReaction = onToggleReaction
        vc.onReactToAttachment = onReactToAttachment
        vc.onOpenReactPicker = onOpenReactPicker
        vc.onShowMessageInfo = onShowMessageInfo
        vc.onShowReadStatus = onShowReadStatus
        vc.onRetry = onRetry
        vc.onShowReactions = onShowReactions
        vc.onShowTranslationDetail = onShowTranslationDetail
        vc.onReadMore = onReadMore
        vc.onFocalTapLocation = onFocalTapLocation
        vc.onFocalShareFile = onFocalShareFile
        vc.onMediaTap = onMediaTap
        vc.onConsumeViewOnce = onConsumeViewOnce
        vc.onRequestTranslation = onRequestTranslation
        vc.onCallBack = { [weak conversationViewModel] summary in
            conversationViewModel?.callBack(for: summary)
        }
        vc.onCallDetailRequest = onCallDetailRequest
        vc.conversationViewModel = conversationViewModel
        vc.applyBottomInset(bottomInset)
        vc.applyTopInset(topInset)
        return vc
    }

    func updateUIViewController(_ vc: MessageListViewController, context: Context) {
        vc.update(isDark: colorScheme == .dark, accentColor: accentColor)
        // WS-6 (F-085) : posé AVANT `applyBottomInset`/`applyTopInset` plus bas
        // — mêmes raisons que `makeUIViewController`. Le `didSet` côté
        // contrôleur ne rejoue le pass QUE si la valeur change réellement
        // (garde `oldValue != newValue`) : une réaffectation identique à
        // chaque tick SwiftUI est un no-op.
        //
        // #3947 — ET LE MODE D'ABORD, avant tout ORDRE POSITIONNEL. Ce
        // `didSet` est l'instant du RÉVEIL : c'est lui qui réapplique
        // `.allItems` quand un pane opaque cesse de couvrir la liste, que
        // l'entonnoir `applyToDataSource` a tenue en veille pendant. Les
        // trois déclencheurs ci-dessous — défilement bas, vidange du suivi de
        // lecture, saut vers un message — commandent une POSITION : les
        // servir avant le réveil viserait un data source qui n'a pas encore
        // repris ce qui est arrivé sous le pane. Le saut de la Rivière et du
        // Résumé (« répondre à cette personne », « ouvrir cet épisode »)
        // emprunte exactement ce chemin, et dans le MÊME passage :
        // `select(.script)` puis `scrollState.scrollToMessageId`.
        vc.readingMode = readingMode
        // If the trigger changed since last update, scroll to latest.
        if scrollToBottomTrigger != context.coordinator.lastScrollToBottomTrigger {
            context.coordinator.lastScrollToBottomTrigger = scrollToBottomTrigger
            vc.scrollToBottom(animated: true)
        }
        if flushSeenTrigger != context.coordinator.lastFlushSeenTrigger {
            context.coordinator.lastFlushSeenTrigger = flushSeenTrigger
            vc.flushSeenNow()
        }
        // If the trigger changed, FAST scroll to the requested message
        // (this fires after jumpToQuotedMessage loaded the target from server).
        if scrollToMessageTrigger != context.coordinator.lastScrollToMessageTrigger {
            context.coordinator.lastScrollToMessageTrigger = scrollToMessageTrigger
            if let targetId = scrollToMessageId {
                vc.scrollToMessageFast(localId: targetId)
            }
        }
        // Start/stop slow scroll based on search state.
        if isSearchingQuotedMessage != context.coordinator.wasSearchingQuotedMessage {
            context.coordinator.wasSearchingQuotedMessage = isSearchingQuotedMessage
            if isSearchingQuotedMessage {
                vc.startSlowScrollUp()
            } else {
                vc.stopSlowScroll()
            }
        }
        vc.onScrollToMessage = onScrollToMessage
        vc.onLoadOlder = onLoadOlder
        vc.onNearBottomChanged = onNearBottomChanged
        vc.onScrollingActiveChanged = onScrollingActiveChanged
        vc.isHeaderExpanded = isHeaderExpanded
        // #3947 — **la liste ne se dessine pas sous ce qui la recouvre.**
        //
        // La Rivière (`RiverConversationHost`) et le Résumé
        // (`LivingSummaryHost`) sont posés PAR-DESSUS le fil dans le même
        // ZStack, avec un fond OPAQUE. Le représentable, lui, reste monté —
        // et c'est VOULU : le démonter perdrait la position de lecture, qui
        // est la promesse du milestone. Mais tant qu'il est visible aux yeux
        // d'UIKit, la `UICollectionView` compose, mesure ses cellules
        // self-sizing et réalise leurs `UIHostingConfiguration` pour des
        // pixels que personne ne voit.
        //
        // `isHidden` retire le RENDU sans toucher aux DONNÉES : le contrôleur
        // reste vivant, ses abonnements aussi, son `contentOffset` intact —
        // donc le retour au fil est instantané et à la bonne place, sans
        // rechargement. Les abonnements ne sont toujours pas SUSPENDUS (les
        // reprendre exigerait de savoir lesquels se rejouent) : depuis #3947
        // c'est leur PUITS qui est fermé — `applyToDataSource` n'applique
        // rien sous un pane, et le réveil réapplique `.allItems`.
        //
        // La condition n'est pas réécrite : `rendersThread` est déjà la loi
        // qui distingue ces deux modes (elle gouverne le suivi de lecture
        // depuis le 2026-08-25). Une seconde formulation aurait divergé.
        vc.view.isHidden = !MessageListViewController.rendersThread(readingMode)
        vc.onMessagesSeen = onMessagesSeen
        vc.onStoryReplyTap = onStoryReplyTap
        vc.onViewSenderStory = onViewSenderStory
        vc.onSwipeReply = onSwipeReply
        vc.onSwipeForward = onSwipeForward
        vc.onLongPress = onLongPress
        vc.nativeMessageMenu = nativeMessageMenu
        vc.overlaidMessageId = overlaidMessageId
        // #4005 — `didSet` gardés côté VC (même patron que `readingMode`).
        vc.isSelectionModeActive = isSelectionModeActive
        vc.selectedMessageIds = selectedMessageIds
        vc.onToggleSelection = onToggleSelection
        vc.onAddReaction = onAddReaction
        vc.onToggleReaction = onToggleReaction
        vc.onReactToAttachment = onReactToAttachment
        vc.onOpenReactPicker = onOpenReactPicker
        vc.onShowMessageInfo = onShowMessageInfo
        vc.onShowReadStatus = onShowReadStatus
        vc.onRetry = onRetry
        vc.onShowReactions = onShowReactions
        vc.onShowTranslationDetail = onShowTranslationDetail
        vc.onReadMore = onReadMore
        vc.onFocalTapLocation = onFocalTapLocation
        vc.onFocalShareFile = onFocalShareFile
        vc.onMediaTap = onMediaTap
        vc.onConsumeViewOnce = onConsumeViewOnce
        vc.onRequestTranslation = onRequestTranslation
        vc.onCallBack = { [weak conversationViewModel] summary in
            conversationViewModel?.callBack(for: summary)
        }
        vc.onCallDetailRequest = onCallDetailRequest
        vc.conversationViewModel = conversationViewModel
        vc.applyBottomInset(bottomInset)
        vc.applyTopInset(topInset)
    }

    // Filet de sécurité au démontage SwiftUI : coupe le CADisplayLink du
    // slow-scroll (qui retient le VC) même si `viewDidDisappear` n'a pas
    // été déclenché par le chemin de dismiss emprunté.
    static func dismantleUIViewController(_ vc: MessageListViewController, coordinator: Coordinator) {
        vc.stopSlowScroll()
        // Fermer la conversation ne doit pas perdre une lecture déjà acquise :
        // `deinit` ne peut pas s'en charger, il n'est pas isolé au MainActor.
        vc.flushSeenMessages()
        vc.stopSeenTracking()
    }
}
