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
            return String(localized: "liveActivity.subtitle.call", defaultValue: "Active Call")
        case .messageDelivery:
            return String(localized: "liveActivity.subtitle.messageDelivery", defaultValue: "Sending Message")
        case .translation:
            return String(localized: "liveActivity.subtitle.translation", defaultValue: "Translating…")
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
            return String(localized: "liveActivity.messageStatus.sending", defaultValue: "Sending…")
        case .sent:
            return String(localized: "liveActivity.messageStatus.sent", defaultValue: "Sent")
        case .delivered:
            return String(localized: "liveActivity.messageStatus.delivered", defaultValue: "Delivered")
        case .read:
            return String(localized: "liveActivity.messageStatus.read", defaultValue: "Read")
        case .failed:
            return String(localized: "liveActivity.messageStatus.failed", defaultValue: "Failed")
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
                            Text(String(localized: "liveActivity.action.mute", defaultValue: "Mute"))
                                .font(.caption2)
                        }
                        .foregroundColor(.white)
                    }

                    Link(destination: URL(string: "meeshy://call/end")!) {
                        VStack(spacing: 4) {
                            Image(systemName: "phone.down.fill")
                                .font(.title3)
                            Text(String(localized: "liveActivity.action.end", defaultValue: "End"))
                                .font(.caption2)
                        }
                        .foregroundColor(.red)
                    }
                } else if context.state.activityType == .messageDelivery {
                    Link(destination: URL(string: "meeshy://conversation/\(context.attributes.conversationId)")!) {
                        VStack(spacing: 4) {
                            Image(systemName: "message.fill")
                                .font(.title3)
                            Text(String(localized: "liveActivity.action.view", defaultValue: "View"))
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
