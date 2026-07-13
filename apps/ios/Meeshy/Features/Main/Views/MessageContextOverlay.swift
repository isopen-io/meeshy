import SwiftUI
import MeeshySDK
import MeeshyUI

/// Phase of the long-press context overlay lifecycle. Transitions are
/// always sequential — never skip a state. The phase gates further
/// long-press input via `BubbleSwipeContainer`'s `longPressEnabled` guard.
enum OverlayPhase: Equatable {
    case closed
    case opening
    case open
    case closing
}

/// Schedule a `completion` block when the animation has visually settled.
/// iOS 17 has a native `withAnimation(_:completion:)`; iOS 16 falls back
/// to a `Task.sleep` aligned on the animation's nominal duration (see
/// `BubbleAnimationDurations`). The 1-frame mismatch on iOS 16 is below
/// perception threshold because completion only triggers cleanup, never
/// visible state changes.
@MainActor
func withAnimationCompletion(
    _ animation: Animation,
    nominalDuration: TimeInterval,
    _ body: @escaping () -> Void,
    completion: @escaping () -> Void
) {
    if #available(iOS 17.0, *) {
        withAnimation(animation, completionCriteria: .logicallyComplete) {
            body()
        } completion: {
            completion()
        }
    } else {
        withAnimation(animation) { body() }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: UInt64(nominalDuration * 1_000_000_000))
            completion()
        }
    }
}

/// iMessage-style long-press overlay: elevated bubble pinned to its source
/// position with adaptive lift, blur+dim backdrop, and a horizontal action
/// menu. Replaces the legacy `MessagePressedOverlay` and inserts before
/// `MessageOverlayMenu` (panel emoji picker, surfaced by "Réagir").
///
/// The overlay does **not** own state — it consumes `targetMessage`,
/// `targetFrame`, `phase`, and `layoutOutput` from `ConversationOverlayState`.
/// `ConversationView` computes those at long-press fire time, mutates the
/// phase, and ticks the animation. This view is purely visual.
///
/// See spec section 7 for the full state machine.
struct MessageContextOverlay: View {
    let message: Message
    let targetFrame: CGRect
    let layoutOutput: OverlayLayoutOutput
    let phase: OverlayPhase
    let actions: [ContextAction]
    let palette: ConversationColorPalette
    let isMine: Bool
    let isDirect: Bool
    let isDark: Bool
    let userLanguages: (regional: String?, custom: String?)
    let mentionDisplayNames: [String: String]
    let currentUserId: String
    let translations: [MessageTranslation]
    let preferredTranslation: MessageTranslation?
    let transcription: MessageTranscription?
    let translatedAudios: [MessageTranslatedAudio]
    let dragOffset: CGFloat
    let onAction: (ContextAction.Kind) -> Void
    let onDismiss: () -> Void
    let onDragChanged: (CGFloat) -> Void
    let onDragEnded: (CGFloat, CGFloat) -> Void
    /// Tap sur l'avatar/nom de la bulle élevée → profil de l'expéditeur.
    /// La bulle n'a plus de `@EnvironmentObject Router` (perf re-render) ;
    /// sans ce câblage le tap serait silencieusement no-op alors que la
    /// bulle élevée EST interactive pendant la phase `.open`.
    var onOpenProfile: ((ProfileSheetUser) -> Void)? = nil

    private var isVisible: Bool {
        phase == .opening || phase == .open
    }

    private var backdropOpacity: Double {
        isVisible ? 1.0 : 0.0
    }

    private var bubbleScale: CGFloat {
        guard isVisible else { return 1.0 }
        return phase == .open ? 1.03 * layoutOutput.bubbleScale : layoutOutput.bubbleScale
    }

    private var menuOpacity: Double {
        guard isVisible else { return 0.0 }
        // BUG4: reveal the action menu DURING the opening spring (not only once it
        // has fully settled at `.open`) so it appears together with the lifted
        // bubble — removes the perceptible post-spring lag before the menu shows.
        let dragFade = max(0, 1 - dragOffset / 120)
        return Double(dragFade)
    }

    private var menuOffset: CGFloat {
        isVisible ? 0 : 8
    }

    private var menuScale: CGFloat {
        isVisible ? 1.0 : 0.85
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            backdrop
            elevatedBubble
            actionMenu
        }
        .ignoresSafeArea()
        .allowsHitTesting(phase == .open)
    }

    private var backdrop: some View {
        ZStack {
            Rectangle()
                .fill(.regularMaterial)
                .opacity(backdropOpacity * 0.6)
            Color.black.opacity(backdropOpacity * 0.15)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            HapticFeedback.light()
            onDismiss()
        }
        .accessibilityLabel(String(localized: "contextMenu.close", defaultValue: "Close context menu", bundle: .main))
        .accessibilityAddTraits(.isButton)
    }

    private var elevatedBubble: some View {
        let frame = layoutOutput.bubbleFinalFrame
        return ThemedMessageBubble(
            message: message,
            contactColor: palette.primary,
            isDirect: isDirect,
            isDark: isDark,
            transcription: transcription,
            translatedAudios: translatedAudios,
            textTranslations: translations,
            preferredTranslation: preferredTranslation,
            showAvatar: !isDirect,
            isLastInGroup: true,
            isLastReceivedMessage: true,
            isLastSentMessage: true,
            mentionDisplayNames: mentionDisplayNames,
            currentUserId: currentUserId,
            userLanguages: userLanguages,
            onOpenProfile: onOpenProfile
        )
        .frame(width: frame.width, height: frame.height)
        .scaleEffect(bubbleScale)
        .shadow(color: .black.opacity(isVisible ? 0.18 : 0), radius: 18, y: 6)
        .offset(x: frame.minX, y: frame.minY + dragOffset)
        .gesture(swipeDownGesture)
        .accessibilityAddTraits(.isModal)
    }

    private var actionMenu: some View {
        let frame = layoutOutput.menuFrame
        return ContextActionMenu(
            actions: actions,
            palette: palette,
            onAction: onAction
        )
        .frame(width: frame.width, height: frame.height)
        .scaleEffect(menuScale, anchor: .top)
        .opacity(menuOpacity)
        .offset(x: frame.minX, y: frame.minY + menuOffset + dragOffset)
    }

    private var swipeDownGesture: some Gesture {
        DragGesture(coordinateSpace: .global)
            .onChanged { value in
                let translation = value.location.y - value.startLocation.y
                guard translation > 0 else { return }
                onDragChanged(translation)
            }
            .onEnded { value in
                let translation = value.location.y - value.startLocation.y
                let predicted = value.predictedEndLocation.y - value.startLocation.y
                onDragEnded(translation, predicted)
            }
    }
}
