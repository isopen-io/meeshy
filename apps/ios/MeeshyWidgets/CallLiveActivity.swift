import ActivityKit
import WidgetKit
import SwiftUI

/// **L'appel Meeshy en cours, dans la Dynamic Island et sur l'écran
/// verrouillé** (#9782).
///
/// Le correspondant, l'état, la durée, le micro et le raccroché ; la dernière
/// phrase sous-titrée quand l'app l'a jugée sûre (`CallActivityLaw`). Le
/// compact ne répète pas la durée quand CallKit l'affiche déjà.
struct CallLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: CallActivityAttributes.self) { context in
            CallActivityLockScreenView(state: context.state, labels: context.attributes.labels)
                .activityBackgroundTint(Color.black.opacity(0.6))
                .activitySystemActionForegroundColor(LiveActivityStyle.success)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    LiveActivityAvatar(
                        initials: context.state.initials,
                        accentHex: context.state.accentHex,
                        fallbackSymbol: CallActivityGlyph.symbol(for: context.state),
                        size: 44
                    )
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    CallActivityClock(state: context.state)
                        .font(.title3.weight(.semibold))
                        .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    CallActivityHeadline(state: context.state)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 8) {
                        if let caption = context.state.caption {
                            CallActivityCaptionView(caption: caption)
                        }
                        CallActivityControls(state: context.state, labels: context.attributes.labels, size: 40)
                    }
                }
            } compactLeading: {
                CallActivityGlyph(state: context.state)
            } compactTrailing: {
                CallActivityCompactTrailing(state: context.state)
            } minimal: {
                CallActivityGlyph(state: context.state)
            }
            .keylineTint(LiveActivityStyle.success)
        }
    }
}

private struct CallActivityGlyph: View {
    let state: CallActivitySnapshot

    static func symbol(for state: CallActivitySnapshot) -> String {
        state.isVideo ? "video.fill" : "phone.fill"
    }

    var body: some View {
        Image(systemName: Self.symbol(for: state))
            .foregroundStyle(CallActivityGlyph.tint(for: state.phase))
            .accessibilityLabel(state.title + ", " + state.statusLabel)
    }

    static func tint(for phase: CallActivitySnapshot.Phase) -> Color {
        switch phase {
        case .connected: return LiveActivityStyle.success
        case .ringing, .connecting: return LiveActivityStyle.brand
        case .onHold, .reconnecting: return LiveActivityStyle.warning
        case .ended: return LiveActivityStyle.error
        }
    }
}

/// Ce que CallKit ne dit pas : le micro coupé et les sous-titres. La durée
/// seulement quand le système ne l'affiche pas déjà.
private struct CallActivityCompactTrailing: View {
    let state: CallActivitySnapshot

    var body: some View {
        if state.showsDurationInCompact, state.connectedSince != nil {
            CallActivityClock(state: state)
                .font(.caption2.weight(.semibold))
                .frame(maxWidth: 44)
        } else if state.isMuted {
            Image(systemName: "mic.slash.fill")
                .foregroundStyle(LiveActivityStyle.error)
                .accessibilityHidden(true)
        } else if state.caption != nil {
            Image(systemName: "captions.bubble.fill")
                .foregroundStyle(LiveActivityStyle.brand)
                .accessibilityHidden(true)
        } else {
            Image(systemName: "waveform")
                .foregroundStyle(CallActivityGlyph.tint(for: state.phase))
                .accessibilityHidden(true)
        }
    }
}

private struct CallActivityClock: View {
    let state: CallActivitySnapshot

    var body: some View {
        if let since = state.connectedSince, state.phase != .ended {
            Text(since, style: .timer)
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
                .foregroundStyle(CallActivityGlyph.tint(for: state.phase))
        } else {
            Image(systemName: CallActivityGlyph.symbol(for: state))
                .foregroundStyle(CallActivityGlyph.tint(for: state.phase))
                .accessibilityHidden(true)
        }
    }
}

private struct CallActivityHeadline: View {
    let state: CallActivitySnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(state.title)
                .font(.headline)
                .foregroundStyle(.white)
                .lineLimit(1)
            HStack(spacing: 4) {
                if state.isMuted {
                    Image(systemName: "mic.slash.fill")
                        .foregroundStyle(LiveActivityStyle.error)
                        .accessibilityHidden(true)
                }
                Text(state.statusLabel)
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)
            }
            .font(.caption)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

private struct CallActivityCaptionView: View {
    let caption: CallActivitySnapshot.Caption

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Text(caption.speaker)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(LiveActivityStyle.brand)
                if let tag = caption.languageTag {
                    Text(tag)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.white.opacity(0.55))
                }
            }
            Text(caption.text)
                .font(.subheadline)
                .foregroundStyle(.white)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(RoundedRectangle(cornerRadius: 12).fill(.white.opacity(0.1)))
        .accessibilityElement(children: .combine)
    }
}

private struct CallActivityControls: View {
    let state: CallActivitySnapshot
    let labels: CallActivityLabels
    let size: CGFloat

    var body: some View {
        if state.phase != .ended {
            HStack(spacing: 20) {
                LiveActivityRoundButton(
                    intent: LiveActivityCommandIntent(.callToggleMute),
                    symbol: state.isMuted ? "mic.slash.fill" : "mic.fill",
                    label: state.isMuted ? labels.unmute : labels.mute,
                    tint: state.isMuted ? LiveActivityStyle.error.opacity(0.85) : .white.opacity(0.2),
                    size: size
                )
                LiveActivityRoundButton(
                    intent: LiveActivityCommandIntent(.callHangUp),
                    symbol: "phone.down.fill",
                    label: labels.hangUp,
                    tint: LiveActivityStyle.error,
                    size: size
                )
            }
        }
    }
}

private struct CallActivityLockScreenView: View {
    let state: CallActivitySnapshot
    let labels: CallActivityLabels

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                LiveActivityAvatar(
                    initials: state.initials,
                    accentHex: state.accentHex,
                    fallbackSymbol: CallActivityGlyph.symbol(for: state),
                    size: 44
                )
                VStack(alignment: .leading, spacing: 2) {
                    CallActivityHeadline(state: state)
                    CallActivityClock(state: state)
                        .font(.subheadline.weight(.semibold))
                }
                Spacer(minLength: 8)
                CallActivityControls(state: state, labels: labels, size: 44)
            }
            if let caption = state.caption {
                CallActivityCaptionView(caption: caption)
            }
        }
        .padding(16)
    }
}
