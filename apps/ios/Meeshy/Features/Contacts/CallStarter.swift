import Foundation
import MeeshySDK
import os

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}

/// Starts a 1:1 call from anywhere that has a user but not necessarily a
/// conversation (keypad results, contact rows, the call journal).
///
/// This is product orchestration (resolve-or-fall-back), so it lives app-side:
/// it composes the SDK building blocks `ConversationService.findDirectWith`
/// (conversation resolution) and `CallManager.startCall` (the WebRTC/CallKit
/// engine). When no direct conversation exists yet, it defers to
/// `onUnavailable` (the caller opens the profile, where a conversation can be
/// started) rather than silently creating one.
@MainActor
enum CallStarter {
    /// Default `onUnavailable`: a local-action failure toast (per the
    /// two-tier toast rule in apps/ios/CLAUDE.md, FeedbackToastManager owns
    /// this — never NotificationToastManager). Call sites that want a richer
    /// fallback (e.g. opening the profile) override this; sites that don't
    /// (redial buttons in CallsTab/CallDetailSheet) previously fell through to
    /// a no-op `{}` with zero user feedback on a tap that visibly did nothing.
    private static func showUnavailableToast() {
        FeedbackToastManager.shared.showError(
            String(localized: "call.starter.unavailable", defaultValue: "Impossible de démarrer l'appel", bundle: .main)
        )
    }

    /// Starts a call. If `conversationId` is known (e.g. a call-journal record),
    /// it dials immediately; otherwise it resolves the direct conversation with
    /// `userId` and dials, falling back to `onUnavailable` when none exists or
    /// resolution fails. `CallManager.startCall` itself surfaces a busy toast
    /// if another call is already active, so every dial entry point (this one
    /// included) gets that feedback for free.
    static func start(
        userId: String,
        displayName: String,
        isVideo: Bool,
        conversationId: String? = nil,
        onUnavailable: @escaping () -> Void = { showUnavailableToast() }
    ) {
        if let conversationId, !conversationId.isEmpty {
            CallManager.shared.startCall(
                conversationId: conversationId,
                userId: userId,
                displayName: displayName,
                isVideo: isVideo
            )
            return
        }

        Task { @MainActor in
            do {
                if let conversation = try await ConversationService.shared.findDirectWith(userId: userId) {
                    CallManager.shared.startCall(
                        conversationId: conversation.id,
                        userId: userId,
                        displayName: displayName,
                        isVideo: isVideo
                    )
                } else {
                    onUnavailable()
                }
            } catch {
                Logger.calls.error("CallStarter: findDirectWith failed for userId=\(userId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                onUnavailable()
            }
        }
    }
}
