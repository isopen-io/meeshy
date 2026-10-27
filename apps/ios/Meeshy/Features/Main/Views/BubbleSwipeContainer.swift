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
    /// indépendant de `isMine` (tous les messages sont alignés pareil).
    /// `false` (bulles) : convention historique.
    var uniformFlatDirection: Bool = false
    /// `nil` ⇒ la loi refuse : le côté ne s'arme pas, l'action nommée n'existe pas (#12626).
    let onSwipeReply: (() -> Void)?
    let onSwipeForward: (() -> Void)?
    /// Long press triggers the message's contextual options (reply, forward,
    /// reactions, copy, delete, …). The container fires the haptic so each
    /// caller doesn't have to.
    let onLongPress: () -> Void
    /// `false` (iOS 26+) désactive le `LongPressGesture` custom : le cell
    /// attache alors un `.contextMenu` NATIF (Liquid Glass) qui possède la
    /// pression. `true` (< iOS 26) garde le long-press → overlay custom.
    /// Les deux ne coexistent jamais (double déclenchement).
    var enableLongPress: Bool = true
    /// **Mode sélection multiple.** `true` : un tap sur la cellule
    /// bascule la sélection au lieu de son geste habituel — un capteur
    /// transparent se pose PAR-DESSUS `content()` (fonctionne quel que soit
    /// ce que fait la bulle en dessous : traduction, carrousel média, etc.),
    /// et swipe/longpress s'effacent (une seule intention à la fois).
    var isSelectionModeActive: Bool = false
    var isSelected: Bool = false
    var onToggleSelection: (() -> Void)? = nil
    /// **Les opérations primaires du menu SYSTÈME, ouvert au double tap**
    /// (le menu natif liquid glass s'ouvre au double tap, le menu Meeshy au longpress).
    ///
    /// Vide ⇒ le double tap ne présente rien : `EditMenuHostView.present`
    /// refuse un menu sans action, et un geste qui ouvrirait une barre vide
    /// serait un contrôle qui n'a pas d'effet (loi 4).
    var editMenuActions: [MessageEditMenuAction] = []
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

    private var offer: MessageRowOffer {
        MessageRowOffer(canReply: onSwipeReply != nil, canForward: onSwipeForward != nil)
    }

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

    /// **En mode sélection, la bulle loge son cercle TOUJOURS à gauche**, qu'importe
    /// `isMine` ET qu'importe le mode de lecture : colonne de cases à cocher
    /// unique, façon Mail/Fichiers, jamais un coin qui dépend du sens de la bulle.
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
    /// inchangé. S'applique à TOUTE bulle, envoyée ou reçue, quel que soit le mode.
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
                .padding(.horizontal, MeeshySpacing.sm)

            content()
                .padding(.leading, selectionShift)
                .offset(x: offset)
                .accessibilityActions { rowAccessibilityActions }
                // Pas de `GeometryReader` + préférence par cellule : hébergée
                // dans une `UIHostingConfiguration`, la préférence ne franchit
                // jamais la frontière UIKit jusqu'à `ConversationView` — la
                // frame du menu flottant vient de `cellFrameInWindow` (UIKit).
                // Ce serait une vue et une écriture de préférence par cellule et
                // par layout, pour rien.
                .opacity(isHiddenForOverlay ? 0 : 1)
                .animation(BubbleAnimations.overlayRevealCrossfade, value: isHiddenForOverlay)
                .onPreferenceChange(BubbleInlinePagingPreferenceKey.self) { isInlinePagingActive = $0 }
                .onPreferenceChange(MediaScrubbingPreferenceKey.self) { isMediaScrubbing = $0 }
                // Mode sélection : swipe/longpress s'effacent — une
                // seule intention à la fois, même patron que le carrousel
                // média (`isInlinePagingActive`) et le scrubbing.
                .simultaneousGesture(dragGesture, including: isSelectionModeActive ? .none : .all)
                // Long press surfaces via `simultaneousGesture` so it
                // cooperates with the inner reaction "+" tap. The parent
                // (ConversationView) renders a custom overlay that keeps
                // the bubble at its source position (looked up via
                // MessageFramePreferenceKey above), with adaptive lift
                // and a compact action menu — that's what `onLongPress`
                // is wired to. Duration 0.35 to
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
                // **Le double tap ouvre le menu SYSTÈME**, posé ICI —
                // sur le conteneur qui enveloppe les cellules des TROIS peaux
                // (`.bubbles`, `.script`, `.focal`) — et non à l'intérieur
                // d'une bulle : posé dans `ThemedMessageBubble`, il n'existerait pas
                // en `.script` ni en `.focal`, qui sont rendus par `FocalRow`.
                //
                // **Même garde de sélection que l'appui long** : une seule
                // intention à la fois. Une garde posée sur un seul des
                // deux gestes est une garde qui a déjà commencé à diverger.
                //
                // Les vues INTERNES qui portent déjà leur propre double tap —
                // la tuile d'une grille média (réaction sur CETTE pièce),
                // l'avis d'appel (rappeler), la pastille d'entrée (ouvrir le
                // profil) — le captent avant ce conteneur : SwiftUI donne la
                // main à la vue la plus profonde.
                .modifier(NativeMessageEditMenu(isEnabled: !isSelectionModeActive,
                                                actions: editMenuActions))

            // **Capteur de sélection.** Par-dessus TOUT — fonctionne
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
        // mode de lecture.
        .overlay(alignment: .topLeading) {
            if isSelectionModeActive {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: MeeshyIconSize.xl))
                    .foregroundStyle(isSelected ? Color.accentColor : Color.secondary.opacity(0.6))
                    .background(Circle().fill(.background).frame(width: 18, height: 18))
                    .padding(.top, MeeshySpacing.xsPlus)
                    .padding(.leading, selectionLeadingCircleInset)
                    .allowsHitTesting(false)
            }
        }
    }

    /// Les actions nommées de la rangée : ce que la loi offre au glissé, puis
    /// l'ouverture du menu, toujours là.
    @ViewBuilder
    private var rowAccessibilityActions: some View {
        ForEach(offer.accessibilityActions, id: \.self) { action in
            Button(action.accessibilityName) { perform(action) }
        }
        Button(String(localized: "a11y.message.actions.long_press", bundle: .main)) { onLongPress() }
    }

    private func perform(_ action: MessageRowOffer.Action) {
        switch action {
        case .reply: onSwipeReply?()
        case .forward: onSwipeForward?()
        }
    }

    @ViewBuilder
    private var swipeIndicator: some View {
        let directed = offset * replyDirection
        let isReplyDir = directed > 0
        let isOverThreshold = BubbleSwipeResistance.commits(offset: abs(offset))
        let visibility = min(1.0, abs(offset) / 24.0)

        if abs(offset) > 8 {
            ZStack {
                if isOverThreshold {
                    // Past the commit threshold — the action icon REPLACES
                    // the date stamp. Reply (curved arrow back) for reply
                    // direction, forward (curved arrow forward) for the
                    // opposite. Crossfade transition keeps the swap subtle.
                    Image(systemName: isReplyDir ? "arrowshape.turn.up.left.fill" : "arrowshape.turn.up.right.fill")
                        .font(MeeshyFont.relative(MeeshyIconSize.xxl, weight: .semibold))
                        .foregroundStyle(MeeshyColors.brandPrimary)
                        .transition(.scale.combined(with: .opacity))
                } else {
                    // Under the threshold — day + hour stamp gives the user
                    // context (when the message was sent) while they decide
                    // whether to commit the gesture.
                    VStack(spacing: MeeshySpacing.xxs) {
                        Text(swipeStampDay)
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                        Text(swipeStampTime)
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
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
        // `minimumDistance: 22` : on élargit la fenêtre
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
                // Un côté que la loi refuse ne s'arme pas : la bulle s'arrête
                // sous le seuil, l'horodatage reste lisible, aucune action ne
                // s'annonce qui ne partirait pas (#12626).
                offset = offer.trackedOffset(BubbleSwipeResistance.trackedOffset(translation: h), replyDirection: replyDirection)
                // Light haptic the moment we cross the commit threshold
                // (and only once per drag) so the user feels the bubble
                // "snap" into the action zone before they let go.
                let crossed = BubbleSwipeResistance.commits(offset: abs(offset))
                if crossed && !didCrossThreshold {
                    didCrossThreshold = true
                    HapticFeedback.light()
                } else if !crossed && didCrossThreshold {
                    didCrossThreshold = false
                }
            }
            .onEnded { _ in
                if let action = offer.committed(directedOffset: offset * replyDirection) {
                    perform(action)
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
                LongPressGesture(minimumDuration: MessagePressClaim.rowMinimumDuration, maximumDistance: 6)
                    .onEnded { _ in
                        // La tuile d'un lot a déjà ouvert l'aperçu de SA pièce.
                        guard !MessagePressClaim.isClaimed() else { return }
                        HapticFeedback.medium()
                        // Le menu de ce chemin s'ouvre en SURCOUCHE : clavier
                        // levé, il paraît derrière lui. La fermeture est ici, et
                        // pas au DÉBUT de l'appui, pour ne jamais baisser le
                        // clavier sur un appui annulé — ce geste-ci a atteint
                        // sa durée, le menu s'ouvre à coup sûr.
                        MessageMenuKeyboard.dismiss()
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
/// snapshot par défaut ne l'afficherait pas correctement).
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
