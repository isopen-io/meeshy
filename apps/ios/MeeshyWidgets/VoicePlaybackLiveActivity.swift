import ActivityKit
import WidgetKit
import SwiftUI

/// **Un vocal en lecture, dans la Dynamic Island et sur l'écran verrouillé**
/// (#9783).
///
/// L'expéditeur, la conversation (ou un libellé neutre pour un message
/// protégé), la progression projetée depuis une position datée, la langue de
/// la piste jouée, et les commandes : −15 s, lecture / pause, +15 s. Le
/// toucher ramène à la conversation.
struct VoicePlaybackLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: VoicePlaybackActivityAttributes.self) { context in
            VoicePlaybackLockScreenView(state: context.state, labels: context.attributes.labels)
                .activityBackgroundTint(Color.black.opacity(0.6))
                .activitySystemActionForegroundColor(LiveActivityStyle.brand)
                .widgetURL(VoicePlaybackLink.url(for: context.state))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    LiveActivityAvatar(
                        initials: context.state.initials,
                        accentHex: context.state.accentHex,
                        fallbackSymbol: "waveform",
                        size: 44
                    )
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VoicePlaybackLanguageBadge(state: context.state)
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    VoicePlaybackHeadline(state: context.state)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        VoicePlaybackProgress(state: context.state)
                        VoicePlaybackControls(state: context.state, labels: context.attributes.labels, size: 38)
                    }
                }
            } compactLeading: {
                LiveActivityAvatar(
                    initials: context.state.initials,
                    accentHex: context.state.accentHex,
                    fallbackSymbol: "waveform",
                    size: 22
                )
            } compactTrailing: {
                VoicePlaybackCompactTrailing(state: context.state)
            } minimal: {
                Image(systemName: context.state.isPlaying ? "waveform" : "pause.fill")
                    .foregroundStyle(LiveActivityStyle.brand)
                    .accessibilityLabel(context.state.title)
            }
            .widgetURL(VoicePlaybackLink.url(for: context.state))
            .keylineTint(LiveActivityStyle.brand)
        }
    }
}

private enum VoicePlaybackLink {
    static func url(for state: VoicePlaybackSnapshot) -> URL? {
        guard !state.conversationId.isEmpty else { return nil }
        return URL(string: "meeshy://conversation/\(state.conversationId)")
    }
}

private struct VoicePlaybackCompactTrailing: View {
    let state: VoicePlaybackSnapshot

    var body: some View {
        if let language = state.trackLanguage {
            Text(language)
                .font(.caption2.weight(.bold))
                .foregroundStyle(LiveActivityStyle.brand)
                .accessibilityHidden(true)
        } else {
            Image(systemName: state.isPlaying ? "waveform" : "pause.fill")
                .foregroundStyle(LiveActivityStyle.brand)
                .accessibilityHidden(true)
        }
    }
}

private struct VoicePlaybackLanguageBadge: View {
    let state: VoicePlaybackSnapshot

    var body: some View {
        if let language = state.trackLanguage {
            HStack(spacing: 3) {
                if state.isTranslatedTrack {
                    Image(systemName: "translate")
                        .font(.caption2.weight(.semibold))
                }
                Text(language)
                    .font(.caption.weight(.bold))
            }
            .foregroundStyle(LiveActivityStyle.brand)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(LiveActivityStyle.brand.opacity(0.18)))
            .accessibilityHidden(true)
        }
    }
}

private struct VoicePlaybackHeadline: View {
    let state: VoicePlaybackSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(state.title)
                .font(.headline)
                .foregroundStyle(.white)
                .lineLimit(1)
            Text(state.subtitle)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

/// La barre avance seule en lecture (intervalle daté), reste figée en pause.
private struct VoicePlaybackProgress: View {
    let state: VoicePlaybackSnapshot

    var body: some View {
        Group {
            if state.isPlaying, state.duration > 0 {
                ProgressView(timerInterval: state.playbackInterval, countsDown: false) {
                    EmptyView()
                } currentValueLabel: {
                    EmptyView()
                }
            } else {
                ProgressView(value: state.fraction)
            }
        }
        .progressViewStyle(.linear)
        .tint(LiveActivityStyle.brand)
        .accessibilityHidden(true)
    }
}

private struct VoicePlaybackControls: View {
    let state: VoicePlaybackSnapshot
    let labels: VoicePlaybackLabels
    let size: CGFloat

    var body: some View {
        HStack(spacing: 22) {
            LiveActivityRoundButton(
                intent: LiveActivityCommandIntent(.playbackBack),
                symbol: "gobackward.15",
                label: labels.back,
                tint: .white.opacity(0.18),
                size: size
            )
            LiveActivityRoundButton(
                intent: LiveActivityCommandIntent(.playbackToggle),
                symbol: state.isPlaying ? "pause.fill" : "play.fill",
                label: state.isPlaying ? labels.pause : labels.play,
                tint: LiveActivityStyle.brand,
                size: size * 1.15
            )
            LiveActivityRoundButton(
                intent: LiveActivityCommandIntent(.playbackForward),
                symbol: "goforward.15",
                label: labels.forward,
                tint: .white.opacity(0.18),
                size: size
            )
        }
    }
}

private struct VoicePlaybackLockScreenView: View {
    let state: VoicePlaybackSnapshot
    let labels: VoicePlaybackLabels

    var body: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                LiveActivityAvatar(
                    initials: state.initials,
                    accentHex: state.accentHex,
                    fallbackSymbol: "waveform",
                    size: 44
                )
                VoicePlaybackHeadline(state: state)
                VoicePlaybackLanguageBadge(state: state)
            }
            VoicePlaybackProgress(state: state)
            VoicePlaybackControls(state: state, labels: labels, size: 38)
        }
        .padding(16)
    }
}
