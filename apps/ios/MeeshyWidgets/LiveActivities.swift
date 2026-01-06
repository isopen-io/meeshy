import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Live Activity Attributes
struct MeeshyActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var activityType: ActivityType
        var contactName: String
        var contactAvatar: String?
        var duration: TimeInterval
        var messageStatus: MessageStatus?
        var translationProgress: Double?
        var sourceLanguage: String?
        var targetLanguage: String?
    }

    enum ActivityType: String, Codable {
        case call
        case messageDelivery
        case translation
    }

    enum MessageStatus: String, Codable {
        case sending
        case sent
        case delivered
        case read
        case failed
    }

    var conversationId: String
    var contactName: String
}

// MARK: - Live Activity Widget
@available(iOS 16.2, *)
struct MeeshyLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: MeeshyActivityAttributes.self) { context in
            // Lock screen/banner UI
            LiveActivityLockScreenView(context: context)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded Region
                DynamicIslandExpandedRegion(.leading) {
                    LiveActivityExpandedLeading(context: context)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    LiveActivityExpandedTrailing(context: context)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    LiveActivityExpandedBottom(context: context)
                }
            } compactLeading: {
                // Compact leading
                LiveActivityCompactLeading(context: context)
            } compactTrailing: {
                // Compact trailing
                LiveActivityCompactTrailing(context: context)
            } minimal: {
                // Minimal view
                LiveActivityMinimal(context: context)
            }
        }
    }
}

// MARK: - Lock Screen View
@available(iOS 16.2, *)
struct LiveActivityLockScreenView: View {
    let context: ActivityViewContext<MeeshyActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: iconForActivityType)
                    .font(.title2)
                    .foregroundColor(colorForActivityType)

                VStack(alignment: .leading, spacing: 2) {
                    Text(context.state.contactName)
                        .font(.headline)
                    Text(subtitleForActivityType)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Spacer()

                // Duration or progress
                if context.state.activityType == .call {
                    Text(timerInterval: Date()...Date().addingTimeInterval(context.state.duration), countsDown: false)
                        .font(.title3)
                        .fontWeight(.semibold)
                        .monospacedDigit()
                        .foregroundColor(colorForActivityType)
                } else if let progress = context.state.translationProgress {
                    ProgressView(value: progress)
                        .frame(width: 60)
                }
            }

            // Additional info based on type
            if context.state.activityType == .translation,
               let source = context.state.sourceLanguage,
               let target = context.state.targetLanguage {
                HStack {
                    Text("\(source) → \(target)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Spacer()
                    if let progress = context.state.translationProgress {
                        Text("\(Int(progress * 100))%")
                            .font(.caption)
                            .fontWeight(.medium)
                    }
                }
            }

            if context.state.activityType == .messageDelivery,
               let status = context.state.messageStatus {
                HStack(spacing: 4) {
                    Image(systemName: iconForMessageStatus(status))
                        .font(.caption)
                    Text(labelForMessageStatus(status))
                        .font(.caption)
                    Spacer()
                }
                .foregroundColor(colorForMessageStatus(status))
            }
        }
        .padding()
        .activityBackgroundTint(Color.blue.opacity(0.2))
        .activitySystemActionForegroundColor(.blue)
    }

    var iconForActivityType: String {
        switch context.state.activityType {
        case .call:
            return "phone.fill"
        case .messageDelivery:
            return "paperplane.fill"
        case .translation:
            return "translate"
        }
    }

    var colorForActivityType: Color {
        switch context.state.activityType {
        case .call:
            return .green
        case .messageDelivery:
            return .blue
        case .translation:
            return .purple
        }
    }

    var subtitleForActivityType: String {
        switch context.state.activityType {
        case .call:
            return "Active Call"
        case .messageDelivery:
            return "Sending Message"
        case .translation:
            return "Translating..."
        }
    }

    func iconForMessageStatus(_ status: MeeshyActivityAttributes.MessageStatus) -> String {
        switch status {
        case .sending:
            return "circle.dotted"
        case .sent:
            return "checkmark"
        case .delivered:
            return "checkmark.circle"
        case .read:
            return "checkmark.circle.fill"
        case .failed:
            return "exclamationmark.circle"
        }
    }

    func labelForMessageStatus(_ status: MeeshyActivityAttributes.MessageStatus) -> String {
        switch status {
        case .sending:
            return "Sending..."
        case .sent:
            return "Sent"
        case .delivered:
            return "Delivered"
        case .read:
            return "Read"
        case .failed:
            return "Failed"
        }
    }

    func colorForMessageStatus(_ status: MeeshyActivityAttributes.MessageStatus) -> Color {
        switch status {
        case .sending:
            return .secondary
        case .sent, .delivered, .read:
            return .green
        case .failed:
            return .red
        }
    }
}

// MARK: - Dynamic Island Views
@available(iOS 16.2, *)
struct LiveActivityExpandedLeading: View {
    let context: ActivityViewContext<MeeshyActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: iconForActivity)
                .font(.title3)
                .foregroundColor(colorForActivity)

            if let avatar = context.state.contactAvatar {
                AsyncImage(url: URL(string: avatar)) { image in
                    image.resizable()
                } placeholder: {
                    Image(systemName: "person.circle.fill")
                        .resizable()
                }
                .frame(width: 30, height: 30)
                .clipShape(Circle())
            }
        }
    }

    var iconForActivity: String {
        switch context.state.activityType {
        case .call:
            return "phone.fill"
        case .messageDelivery:
            return "paperplane.fill"
        case .translation:
            return "translate"
        }
    }

    var colorForActivity: Color {
        switch context.state.activityType {
        case .call:
            return .green
        case .messageDelivery:
            return .blue
        case .translation:
            return .purple
        }
    }
}

@available(iOS 16.2, *)
struct LiveActivityExpandedTrailing: View {
    let context: ActivityViewContext<MeeshyActivityAttributes>

    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            if context.state.activityType == .call {
                Text(timerInterval: Date()...Date().addingTimeInterval(context.state.duration), countsDown: false)
                    .font(.title3)
                    .fontWeight(.semibold)
                    .monospacedDigit()
                    .foregroundColor(.green)
            } else if let progress = context.state.translationProgress {
                VStack(spacing: 2) {
                    Text("\(Int(progress * 100))%")
                        .font(.caption)
                        .fontWeight(.medium)
                    ProgressView(value: progress)
                        .frame(width: 40)
                }
            }
        }
    }
}

@available(iOS 16.2, *)
struct LiveActivityExpandedBottom: View {
    let context: ActivityViewContext<MeeshyActivityAttributes>

    var body: some View {
        VStack(spacing: 8) {
            Text(context.state.contactName)
                .font(.headline)
                .foregroundColor(.white)

            if context.state.activityType == .translation,
               let source = context.state.sourceLanguage,
               let target = context.state.targetLanguage {
                Text("\(source) → \(target)")
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.8))
            }

            // Action buttons
            HStack(spacing: 16) {
                if context.state.activityType == .call {
                    Link(destination: URL(string: "meeshy://call/mute")!) {
                        VStack(spacing: 4) {
                            Image(systemName: "mic.slash.fill")
                                .font(.title3)
                            Text("Mute")
                                .font(.caption2)
                        }
                        .foregroundColor(.white)
                    }

                    Link(destination: URL(string: "meeshy://call/end")!) {
                        VStack(spacing: 4) {
                            Image(systemName: "phone.down.fill")
                                .font(.title3)
                            Text("End")
                                .font(.caption2)
                        }
                        .foregroundColor(.red)
                    }
                } else if context.state.activityType == .messageDelivery {
                    Link(destination: URL(string: "meeshy://conversation/\(context.attributes.conversationId)")!) {
                        VStack(spacing: 4) {
                            Image(systemName: "message.fill")
                                .font(.title3)
                            Text("View")
                                .font(.caption2)
                        }
                        .foregroundColor(.white)
                    }
                }
            }
        }
        .padding(.vertical, 8)
    }
}

@available(iOS 16.2, *)
struct LiveActivityCompactLeading: View {
    let context: ActivityViewContext<MeeshyActivityAttributes>

    var body: some View {
        Image(systemName: iconForActivity)
            .foregroundColor(colorForActivity)
    }

    var iconForActivity: String {
        switch context.state.activityType {
        case .call:
            return "phone.fill"
        case .messageDelivery:
            return "paperplane.fill"
        case .translation:
            return "translate"
        }
    }

    var colorForActivity: Color {
        switch context.state.activityType {
        case .call:
            return .green
        case .messageDelivery:
            return .blue
        case .translation:
            return .purple
        }
    }
}

@available(iOS 16.2, *)
struct LiveActivityCompactTrailing: View {
    let context: ActivityViewContext<MeeshyActivityAttributes>

    var body: some View {
        if context.state.activityType == .call {
            Text(timerInterval: Date()...Date().addingTimeInterval(context.state.duration), countsDown: false)
                .monospacedDigit()
                .font(.caption2)
                .fontWeight(.semibold)
        } else if let progress = context.state.translationProgress {
            Text("\(Int(progress * 100))%")
                .font(.caption2)
                .fontWeight(.medium)
        }
    }
}

@available(iOS 16.2, *)
struct LiveActivityMinimal: View {
    let context: ActivityViewContext<MeeshyActivityAttributes>

    var body: some View {
        Image(systemName: iconForActivity)
            .foregroundColor(colorForActivity)
    }

    var iconForActivity: String {
        switch context.state.activityType {
        case .call:
            return "phone.fill"
        case .messageDelivery:
            return "paperplane.fill"
        case .translation:
            return "translate"
        }
    }

    var colorForActivity: Color {
        switch context.state.activityType {
        case .call:
            return .green
        case .messageDelivery:
            return .blue
        case .translation:
            return .purple
        }
    }
}

// MARK: - Live Activity Manager
@available(iOS 16.2, *)
class LiveActivityManager {
    static let shared = LiveActivityManager()

    private init() {}

    // Start a call Live Activity
    func startCallActivity(conversationId: String, contactName: String, contactAvatar: String?) {
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
            let activity = try Activity<MeeshyActivityAttributes>.request(
                attributes: attributes,
                contentState: contentState,
                pushType: .token
            )
            print("Started call Live Activity: \(activity.id)")
        } catch {
            print("Error starting call Live Activity: \(error.localizedDescription)")
        }
    }

    // Update call duration
    func updateCallDuration(activityId: String, duration: TimeInterval) {
        Task {
            let contentState = MeeshyActivityAttributes.ContentState(
                activityType: .call,
                contactName: "",
                duration: duration
            )

            for activity in Activity<MeeshyActivityAttributes>.activities where activity.id == activityId {
                await activity.update(using: contentState)
            }
        }
    }

    // Start message delivery tracking
    func startMessageDeliveryActivity(conversationId: String, contactName: String, contactAvatar: String?) {
        let attributes = MeeshyActivityAttributes(
            conversationId: conversationId,
            contactName: contactName
        )

        let contentState = MeeshyActivityAttributes.ContentState(
            activityType: .messageDelivery,
            contactName: contactName,
            contactAvatar: contactAvatar,
            duration: 0,
            messageStatus: .sending
        )

        do {
            let activity = try Activity<MeeshyActivityAttributes>.request(
                attributes: attributes,
                contentState: contentState,
                pushType: .token
            )
            print("Started message delivery Live Activity: \(activity.id)")
        } catch {
            print("Error starting message delivery Live Activity: \(error.localizedDescription)")
        }
    }

    // Update message status
    func updateMessageStatus(conversationId: String, status: MeeshyActivityAttributes.MessageStatus) {
        Task {
            for activity in Activity<MeeshyActivityAttributes>.activities
                where activity.attributes.conversationId == conversationId {
                let contentState = MeeshyActivityAttributes.ContentState(
                    activityType: .messageDelivery,
                    contactName: activity.attributes.contactName,
                    duration: 0,
                    messageStatus: status
                )
                await activity.update(using: contentState)

                // End activity after successful delivery
                if status == .delivered || status == .read {
                    try? await Task.sleep(nanoseconds: 2_000_000_000) // Wait 2 seconds
                    await activity.end(dismissalPolicy: .immediate)
                }
            }
        }
    }

    // Start translation activity
    func startTranslationActivity(conversationId: String, sourceLanguage: String, targetLanguage: String) {
        let attributes = MeeshyActivityAttributes(
            conversationId: conversationId,
            contactName: "Translation"
        )

        let contentState = MeeshyActivityAttributes.ContentState(
            activityType: .translation,
            contactName: "Translation",
            duration: 0,
            translationProgress: 0.0,
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage
        )

        do {
            let activity = try Activity<MeeshyActivityAttributes>.request(
                attributes: attributes,
                contentState: contentState,
                pushType: .token
            )
            print("Started translation Live Activity: \(activity.id)")
        } catch {
            print("Error starting translation Live Activity: \(error.localizedDescription)")
        }
    }

    // Update translation progress
    func updateTranslationProgress(conversationId: String, progress: Double) {
        Task {
            for activity in Activity<MeeshyActivityAttributes>.activities
                where activity.attributes.conversationId == conversationId {
                var state = activity.contentState
                state.translationProgress = progress
                await activity.update(using: state)

                // End when complete
                if progress >= 1.0 {
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                    await activity.end(dismissalPolicy: .immediate)
                }
            }
        }
    }

    // End all activities for a conversation
    func endActivities(conversationId: String) {
        Task {
            for activity in Activity<MeeshyActivityAttributes>.activities
                where activity.attributes.conversationId == conversationId {
                await activity.end(dismissalPolicy: .immediate)
            }
        }
    }
}