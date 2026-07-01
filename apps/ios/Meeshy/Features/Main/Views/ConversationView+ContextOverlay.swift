import SwiftUI
import MeeshySDK
import MeeshyUI

extension ConversationView {
    /// Layered above the message list — renders only when `phase != .closed`.
    /// All visible state (backdrop, bubble, menu) is derived from
    /// `overlayState`'s `phase`, `targetMessage`, `targetFrame`,
    /// `layoutOutput`, and `overlayDragOffset` fields.
    @ViewBuilder
    var messageContextOverlayContent: some View {
        if overlayState.contextOverlayPhase != .closed,
           let msg = overlayState.contextOverlayMessage,
           let frame = overlayState.contextOverlayTargetFrame,
           let layoutOutput = overlayState.contextOverlayLayoutOutput {
            MessageContextOverlay(
                message: msg,
                targetFrame: frame,
                layoutOutput: layoutOutput,
                phase: overlayState.contextOverlayPhase,
                actions: actionsForOverlay(message: msg),
                palette: conversation?.colorPalette ?? .fallback,
                isMine: msg.isMe,
                isDirect: isDirect,
                isDark: ThemeManager.shared.mode.isDark,
                userLanguages: (
                    regional: AuthManager.shared.currentUser?.regionalLanguage,
                    custom: AuthManager.shared.currentUser?.customDestinationLanguage
                ),
                mentionDisplayNames: viewModel.mentionDisplayNames,
                currentUserId: AuthManager.shared.currentUser?.id ?? "",
                translations: viewModel.messageTranslations[msg.id] ?? [],
                preferredTranslation: viewModel.preferredTranslation(for: msg.id),
                transcription: viewModel.messageTranscriptions[msg.id],
                translatedAudios: viewModel.messageTranslatedAudios[msg.id] ?? [],
                dragOffset: overlayState.contextOverlayDragOffset,
                onAction: { kind in handleContextOverlayAction(kind, message: msg) },
                onDismiss: { dismissContextOverlay() },
                onDragChanged: { translation in
                    overlayState.contextOverlayDragOffset = translation
                },
                onDragEnded: { _, predicted in
                    if predicted > 60 {
                        dismissContextOverlay()
                    } else {
                        withAnimation(BubbleAnimations.overlayDismissBubble) {
                            overlayState.contextOverlayDragOffset = 0
                        }
                    }
                },
                onOpenProfile: { user in
                    dismissContextOverlay()
                    router.deepLinkProfileUser = user
                }
            )
            .zIndex(998)
        }
    }

    /// Open the overlay for `messageId`. Idempotent on `.opening`/`.open`/`.closing` —
    /// only fires when phase is `.closed` AND the frame is known.
    func openContextOverlay(for messageId: String) {
        guard overlayState.contextOverlayPhase == .closed else { return }
        guard overlayState.longPressEnabled else { return }
        guard let msg = viewModel.messages.first(where: { $0.id == messageId }) else { return }
        guard let frame = frameTracker.frame(for: messageId) else { return }

        let actions = actionsForOverlay(message: msg)
        let menuSize = ContextActionMenu.estimatedSize(actionCount: actions.count)
        let layoutOutput = MessageOverlayLayoutEngine.compute(input: OverlayLayoutInput(
            bubbleSourceFrame: frame,
            menuSize: menuSize,
            availableViewportSize: contextOverlayViewportSize,
            safeAreaInsets: contextOverlaySafeAreaInsets
        ))

        overlayState.contextOverlayMessage = msg
        overlayState.contextOverlayTargetFrame = frame
        overlayState.contextOverlayLayoutOutput = layoutOutput
        overlayState.contextOverlayDragOffset = 0
        overlayState.contextOverlayPhase = .opening

        withAnimationCompletion(
            BubbleAnimations.overlaySpring,
            nominalDuration: BubbleAnimationDurations.overlaySpring,
            {
                overlayState.contextOverlayPhase = .opening
            },
            completion: {
                if overlayState.contextOverlayPhase == .opening {
                    overlayState.contextOverlayPhase = .open
                }
            }
        )
    }

    /// Reverse the entry animation. Frame is held until the closing settles
    /// so the bubble doesn't snap back to source mid-fade. On completion,
    /// all fields are reset and the targeted cell reveals (via its envelope's
    /// `isHiddenForOverlay` flipping back to false in the next render).
    func dismissContextOverlay() {
        guard overlayState.contextOverlayPhase == .open
                || overlayState.contextOverlayPhase == .opening else { return }
        HapticFeedback.light()

        withAnimationCompletion(
            BubbleAnimations.overlayDismiss,
            nominalDuration: BubbleAnimationDurations.overlayDismiss,
            {
                overlayState.contextOverlayPhase = .closing
            },
            completion: {
                overlayState.contextOverlayMessage = nil
                overlayState.contextOverlayTargetFrame = nil
                overlayState.contextOverlayLayoutOutput = nil
                overlayState.contextOverlayDragOffset = 0
                overlayState.contextOverlayPhase = .closed
            }
        )
    }

    /// Filter the master action list by message state. `Delete` only shown
    /// for own messages or admins; `Translate` only when the resolved
    /// translation differs from the user's preferred language.
    /// `Copy` is offered here (not via the native iOS edit menu) so the
    /// long-press surfaces ONLY Meeshy's custom context menu — text bubbles no
    /// longer enable `.textSelection`, which suppressed the native liquid-glass
    /// "Copy / Look Up / Translate" menu.
    func actionsForOverlay(message: Message) -> [ContextAction] {
        var actions: [ContextAction] = []
        actions.append(.reply())
        actions.append(.forward())
        actions.append(.react())
        if !(viewModel.messageTranslations[message.id]?.isEmpty ?? true)
            || !message.content.isEmpty {
            actions.append(.translate())
        }
        if !message.content.isEmpty {
            actions.append(.copy())
        }
        if message.isMe || isCurrentUserAdminOrMod {
            actions.append(.delete())
        }
        return actions
    }

    private func handleContextOverlayAction(_ kind: ContextAction.Kind, message: Message) {
        switch kind {
        case .reply:
            triggerReply(for: message)
            dismissContextOverlay()
        case .forward:
            composerState.forwardMessage = message
            dismissContextOverlay()
        case .react:
            let messageRef = message
            withAnimationCompletion(
                BubbleAnimations.overlayDismiss,
                nominalDuration: BubbleAnimationDurations.overlayDismiss,
                {
                    overlayState.contextOverlayPhase = .closing
                },
                completion: {
                    overlayState.contextOverlayMessage = nil
                    overlayState.contextOverlayTargetFrame = nil
                    overlayState.contextOverlayLayoutOutput = nil
                    overlayState.contextOverlayDragOffset = 0
                    overlayState.contextOverlayPhase = .closed
                    overlayState.overlayMessage = messageRef
                    overlayState.showOverlayMenu = true
                }
            )
        case .translate:
            overlayState.moreSheetInitialItem = .language
            overlayState.detailSheetMessage = message
            dismissContextOverlay()
        case .copy:
            UIPasteboard.general.string = message.content
            HapticFeedback.success()
            FeedbackToastManager.shared.show(
                String(localized: "action.copy.success", defaultValue: "Message copied", bundle: .main)
            )
            dismissContextOverlay()
        case .delete:
            overlayState.deleteConfirmMessageId = message.id
            dismissContextOverlay()
        case .edit, .pin, .star, .thread, .info:
            dismissContextOverlay()
        }
    }

    private var contextOverlayViewportSize: CGSize {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first(where: { $0.isKeyWindow })?.bounds.size
            ?? UIScreen.main.bounds.size
    }

    private var contextOverlaySafeAreaInsets: EdgeInsets {
        let insets = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.windows.first(where: { $0.isKeyWindow })?.safeAreaInsets
            ?? .zero
        return EdgeInsets(
            top: insets.top,
            leading: insets.left,
            bottom: insets.bottom,
            trailing: insets.right
        )
    }
}

extension ConversationColorPalette {
    /// Default palette used when a conversation is loading or has no
    /// resolved accent yet — falls back to the Meeshy brand Indigo.
    static var fallback: ConversationColorPalette {
        ConversationColorPalette(
            primary: "6366F1",
            secondary: "818CF8",
            accent: "4F46E5",
            saturationBoost: 0.0
        )
    }
}
