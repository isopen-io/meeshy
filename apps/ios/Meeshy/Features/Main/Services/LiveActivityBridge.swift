import Foundation
import os
import MeeshySDK
#if canImport(ActivityKit)
import ActivityKit
#endif

private let logger = Logger(subsystem: "me.meeshy.app", category: "live-activity")

/// Entry point for the app target to start / update / end Live Activities.
/// Bridges CallManager events to ActivityKit requests using shared attributes.
@MainActor
final class LiveActivityBridge {
    static let shared = LiveActivityBridge()

    private init() {}

    // MARK: - Call lifecycle

    func startCall(conversationId: String, contactName: String, contactAvatar: String?) {
        logger.info("startCall conversation=\(conversationId) contact=\(contactName)")
        #if canImport(ActivityKit)
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        let attributes = MeeshyActivityAttributes(
            conversationId: conversationId,
            contactName: contactName
        )

        let contentState = MeeshyActivityAttributes.ContentState(
            activityType: .call,
            contactName: contactName,
            contactAvatar: contactAvatar,
            duration: 0
        )

        do {
            _ = try Activity<MeeshyActivityAttributes>.request(
                attributes: attributes,
                content: ActivityContent(state: contentState, staleDate: nil),
                pushType: nil
            )
        } catch {
            logger.error("Failed to start call Live Activity: \(error.localizedDescription)")
        }
        #endif
    }

    func updateCallDuration(conversationId: String, duration: TimeInterval) {
        #if canImport(ActivityKit)
        Task {
            let contentState = MeeshyActivityAttributes.ContentState(
                activityType: .call,
                contactName: "", // Partial update — name is in attributes
                duration: duration
            )

            for activity in Activity<MeeshyActivityAttributes>.activities
                where activity.attributes.conversationId == conversationId {
                await activity.update(ActivityContent(state: contentState, staleDate: nil))
            }
        }
        #endif
    }

    func endCall(conversationId: String) {
        logger.info("endCall conversation=\(conversationId)")
        #if canImport(ActivityKit)
        Task {
            for activity in Activity<MeeshyActivityAttributes>.activities
                where activity.attributes.conversationId == conversationId {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
        #endif
    }
}
