import Foundation
import os

private let logger = Logger(subsystem: "me.meeshy.app", category: "live-activity")

/// Entry point for the app target to start / update / end Live Activities.
///
/// ## Current status: STUB — blocked on cross-target type sharing
///
/// `MeeshyActivityAttributes` and `LiveActivityManager` currently live in
/// `apps/ios/MeeshyWidgets/LiveActivities.swift` and are only compiled into
/// the `MeeshyWidgets` widget-extension target. The main app target cannot
/// import them, so we cannot call `Activity<MeeshyActivityAttributes>.request(...)`
/// from here.
///
/// To make this bridge functional, a follow-up on macOS/Xcode must:
///   1. Move `MeeshyActivityAttributes` (and optionally `LiveActivityManager`)
///      into `packages/MeeshySDK/Sources/MeeshySDK/Notifications/`.
///   2. Add `MeeshySDK` as a `packageProductDependency` of the `MeeshyWidgets`
///      target in `Meeshy.xcodeproj/project.pbxproj`.
///   3. Update `apps/ios/MeeshyWidgets/LiveActivities.swift` to
///      `import MeeshySDK` and remove its local struct definition.
///   4. Replace the no-op bodies below with real calls.
///
/// Until then, this bridge silently logs the intended actions so CallManager
/// wiring can be reviewed and merged in isolation.
@MainActor
final class LiveActivityBridge {
    static let shared = LiveActivityBridge()

    private init() {}

    // MARK: - Call lifecycle

    func startCall(conversationId: String, contactName: String, contactAvatar: String?) {
        logger.info("[stub] startCall conversation=\(conversationId) contact=\(contactName)")
        // Follow-up: LiveActivityManager.shared.startCallActivity(
        //     conversationId: conversationId,
        //     contactName: contactName,
        //     contactAvatar: contactAvatar
        // )
    }

    func updateCallDuration(conversationId: String, duration: TimeInterval) {
        logger.debug("[stub] updateCallDuration conversation=\(conversationId) duration=\(duration)")
        // Follow-up: LiveActivityManager.shared.updateCallDuration(...)
    }

    func endCall(conversationId: String) {
        logger.info("[stub] endCall conversation=\(conversationId)")
        // Follow-up: LiveActivityManager.shared.endActivities(conversationId: conversationId)
    }
}
