import Foundation
import MeeshySDK

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
    /// Starts a call. If `conversationId` is known (e.g. a call-journal record),
    /// it dials immediately; otherwise it resolves the direct conversation with
    /// `userId` and dials, falling back to `onUnavailable` when none exists or
    /// resolution fails.
    static func start(
        userId: String,
        displayName: String,
        isVideo: Bool,
        conversationId: String? = nil,
        onUnavailable: @escaping () -> Void = {}
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
                onUnavailable()
            }
        }
    }
}
