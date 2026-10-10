import ActivityKit
import WidgetKit
import SwiftUI

/// **Un vocal en cours d'enregistrement, dans la Dynamic Island et sur
/// l'écran verrouillé** (#9784).
///
/// La conversation de destination, le chrono (déroulé par la vue depuis
/// `startedAt`), le niveau, et les deux gestes du composeur : arrêter (le
/// vocal rejoint le tiroir) et annuler. Le toucher ramène à la conversation.
struct VoiceRecordingLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: VoiceRecordingActivityAttributes.self) { context in
            VoiceRecordingLockScreenView(state: context.state, labels: context.attributes.labels)
                .activityBackgroundTint(Color.black.opacity(0.6))
                .activitySystemActionForegroundColor(LiveActivityStyle.recording)
                .widgetURL(VoiceRecordingLink.url(for: context.state))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VoiceRecordingDot(isFinished: context.state.isFinished)
                        .frame(width: 44, height: 44)
                        .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VoiceRecordingClock(state: context.state)
                        .font(.title3.weight(.semibold))
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    VoiceRecordingHeadline(state: context.state)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        VoiceRecordingLevel(level: context.state.level)
                        VoiceRecordingControls(state: context.state, labels: context.attributes.labels, size: 40)
                    }
                }
            } compactLeading: {
                VoiceRecordingDot(isFinished: context.state.isFinished)
                    .frame(width: 14, height: 14)
            } compactTrailing: {
                VoiceRecordingClock(state: context.state)
                    .font(.caption2.weight(.semibold))
                    .frame(maxWidth: 44)
            } minimal: {
                Image(systemName: "mic.fill")
                    .foregroundStyle(LiveActivityStyle.recording)
                    .accessibilityLabel(context.state.statusLabel)
            }
            .widgetURL(VoiceRecordingLink.url(for: context.state))
            .keylineTint(LiveActivityStyle.recording)
        }
    }
}

private enum VoiceRecordingLink {
    static func url(for state: VoiceRecordingSnapshot) -> URL? {
        guard !state.conversationId.isEmpty else { return nil }
        return URL(string: "meeshy://conversation/\(state.conversationId)")
    }
}

private struct VoiceRecordingDot: View {
    let isFinished: Bool

    var body: some View {
        ZStack {
            Circle().fill(LiveActivityStyle.recording.opacity(0.25))
            Image(systemName: isFinished ? "checkmark" : "mic.fill")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(LiveActivityStyle.recording)
        }
        .accessibilityHidden(true)
    }
}

private struct VoiceRecordingClock: View {
    let state: VoiceRecordingSnapshot

    var body: some View {
        if state.isFinished {
            Image(systemName: "checkmark")
                .foregroundStyle(LiveActivityStyle.recording)
                .accessibilityHidden(true)
        } else {
            Text(state.startedAt, style: .timer)
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
                .foregroundStyle(LiveActivityStyle.recording)
        }
    }
}

private struct VoiceRecordingHeadline: View {
    let state: VoiceRecordingSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(state.statusLabel)
                .font(.caption)
                .foregroundStyle(LiveActivityStyle.recording)
                .lineLimit(1)
            Text(state.title)
                .font(.headline)
                .foregroundStyle(.white)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// Le niveau du micro, en cinq barres : de quoi voir que la voix passe, sans
/// réveiller l'activité vingt fois par seconde.
private struct VoiceRecordingLevel: View {
    let level: Int

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0...VoiceRecordingSnapshot.maxLevel, id: \.self) { index in
                Capsule()
                    .fill(index <= level ? LiveActivityStyle.recording : Color.white.opacity(0.2))
                    .frame(width: 18, height: 6)
            }
        }
        .accessibilityHidden(true)
    }
}

private struct VoiceRecordingControls: View {
    let state: VoiceRecordingSnapshot
    let labels: VoiceRecordingLabels
    let size: CGFloat

    var body: some View {
        if !state.isFinished {
            HStack(spacing: 24) {
                LiveActivityRoundButton(
                    intent: LiveActivityCommandIntent(.recordingCancel),
                    symbol: "trash.fill",
                    label: labels.cancel,
                    tint: .white.opacity(0.2),
                    size: size
                )
                LiveActivityRoundButton(
                    intent: LiveActivityCommandIntent(.recordingStop),
                    symbol: "stop.fill",
                    label: labels.stop,
                    tint: LiveActivityStyle.recording,
                    size: size
                )
            }
        }
    }
}

private struct VoiceRecordingLockScreenView: View {
    let state: VoiceRecordingSnapshot
    let labels: VoiceRecordingLabels

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                VoiceRecordingDot(isFinished: state.isFinished)
                    .frame(width: 44, height: 44)
                VoiceRecordingHeadline(state: state)
                VoiceRecordingClock(state: state)
                    .font(.title3.weight(.semibold))
            }
            HStack {
                VoiceRecordingLevel(level: state.level)
                Spacer(minLength: 12)
                VoiceRecordingControls(state: state, labels: labels, size: 40)
            }
        }
        .padding(16)
    }
}
