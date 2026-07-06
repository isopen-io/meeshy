import SwiftUI
import MeeshyUI

// MARK: - Call Pill Status

/// What the minimised call pill's status line should convey, derived purely from
/// `CallState`. Only `.connected` shows the running call duration (green); every
/// pre-connection state shows a textual status (amber) so a call that is merely
/// ringing/connecting/reconnecting is never misrepresented as an established
/// 00:00 call.
enum CallPillStatus: Equatable {
    case connected
    case ringing
    case connecting
    case reconnecting

    /// `true` only for an established call → the pill shows the live duration.
    var isConnected: Bool { self == .connected }

    /// Pre-connection status label (empty for `.connected`, where the view shows
    /// the formatted duration instead).
    var label: String {
        switch self {
        case .connected:    return ""
        case .ringing:      return String(localized: "call.pill.status.ringing", defaultValue: "Sonnerie…")
        case .connecting:   return String(localized: "call.pill.status.connecting", defaultValue: "Connexion…")
        case .reconnecting: return String(localized: "call.pill.status.reconnecting", defaultValue: "Reconnexion…")
        }
    }

    static func from(_ state: CallState) -> CallPillStatus {
        switch state {
        case .connected:             return .connected
        case .ringing:               return .ringing
        case .offering, .connecting: return .connecting
        case .reconnecting:          return .reconnecting
        // The pill is hidden in `.idle`/`.ended` (callState.isActive == false);
        // map to a safe non-connected status so a stray render never shows green.
        case .idle, .ended:          return .connecting
        }
    }
}

// MARK: - Floating Call Pill View

struct FloatingCallPillView: View {
    // Use the singleton directly via @ObservedObject like the rest of the
    // app (RootView, CallView). The previous @EnvironmentObject form
    // crashed at launch because the pill is mounted as a `.overlay` on
    // the RootView/iPadRootView ZStack — SwiftUI does NOT propagate
    // environment objects into overlay closures by default, and the app
    // does not inject CallManager via `.environmentObject(...)` either
    // (the singleton is the only source of truth).
    @ObservedObject private var callManager = CallManager.shared
    // Audit P2-iOS-9 — respect the user's Reduce Motion preference. The
    // slide-in/-out spring animation is the primary animation concern here;
    // when reduce motion is on, collapse it to a simple cross-fade.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private let pillHeight: CGFloat = 64

    var body: some View {
        if callManager.displayMode == .pip && callManager.callState.isActive && !callManager.isSystemPiPActive {
            pillContent
                // Pilule verre + contrôles blancs : on épingle le verre en
                // sombre pour rester lisible quel que soit le mode système.
                .environment(\.colorScheme, .dark)
                // P2-iOS-9 — slide-in from top when motion is allowed; fade
                // only when reduce motion is on (no translational movement).
                .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                .animation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.75), value: callManager.displayMode)
                .zIndex(999)
        }
    }

    // MARK: - Pill Content

    private var pillContent: some View {
        HStack(spacing: 12) {
            pillLeadingVisual
            userInfoSection
            Spacer()
            controlButtons
        }
        .padding(.horizontal, 16)
        // minHeight (not an exact height): userInfoSection stacks two
        // Dynamic-Type-scalable Text lines that can exceed pillHeight at
        // accessibility text sizes (AX1+) — an exact frame would force-clip
        // the name/status instead of letting the pill grow to fit.
        .frame(minHeight: pillHeight)
        // iOS 26 Liquid Glass capsule surface (SDK Compatibility wrapper owns the
        // gating + the .ultraThinMaterial fallback). The small inner controls stay
        // as vibrancy fills ON the glass — Apple HIG: don't nest glass in glass.
        .adaptiveGlass(in: Capsule())
        .clipShape(Capsule())
        .overlay(
            Capsule()
                .stroke(MeeshyColors.glassBorderGradient(isDark: true), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.25), radius: 12, x: 0, y: 6)
        .padding(.horizontal, 16)
        .onTapGesture {
            expandToFullScreen()
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            String(localized: "call.pill.ongoing", defaultValue: "Appel en cours")
            + (callManager.remoteUsername.map { " — \($0)" } ?? "")
        )
        .accessibilityHint(String(localized: "call.pill.tapToReturn", defaultValue: "Touchez pour revenir à l'appel en plein écran"))
    }

    // MARK: - Leading Visual (remote video thumbnail or avatar)

    /// §7.6 — whenever the peer's video is flowing, show the live remote feed
    /// as a small thumbnail so the user still sees their interlocutor (a
    /// return-to-call pill that drops the video is a major gap). Keyed on the
    /// REMOTE stream only — the peer may have escalated an audio call to video
    /// while the local camera stays off. Falls back to the avatar when the
    /// peer's camera is off / no track yet. Only one renderer is live at a
    /// time: CallView is dismounted while in `.pip`, so this does not
    /// double-render the remote track.
    @ViewBuilder
    private var pillLeadingVisual: some View {
        if callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled {
            CallVideoView(track: callManager.remoteVideoTrack, contentMode: .scaleAspectFill)
                .frame(width: 44, height: 44)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Color.white.opacity(0.25), lineWidth: 1)
                )
                .accessibilityHidden(true)
        } else {
            avatarView
        }
    }

    // MARK: - Avatar

    private var avatarView: some View {
        let name = callManager.remoteUsername ?? "?"
        let initial = String(name.prefix(1)).uppercased()

        return ZStack {
            Circle()
                .fill(MeeshyColors.brandGradient)
                .frame(width: 44, height: 44)

            Text(initial)
                .font(.system(.callout, design: .rounded).weight(.bold))
                .foregroundColor(.white)
        }
        .accessibilityHidden(true)
    }

    // MARK: - User Info

    private var userInfoSection: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(callManager.remoteUsername ?? String(localized: "call.pill.unknown", defaultValue: "Inconnu", bundle: .main))
                .font(.subheadline.weight(.medium))
                .foregroundColor(.white)
                .lineLimit(1)

            Text(pillStatus.isConnected ? formattedDuration : pillStatus.label)
                .font(.caption.weight(.medium).monospacedDigit())
                .foregroundColor(pillStatus.isConnected ? MeeshyColors.success : MeeshyColors.warning)
        }
    }

    /// Status conveyed by the pill's second line — drives whether the live
    /// duration (green) or a pre-connection label (amber) is shown.
    private var pillStatus: CallPillStatus {
        CallPillStatus.from(callManager.callState)
    }

    // MARK: - Control Buttons

    private var controlButtons: some View {
        HStack(spacing: 8) {
            muteButton
            speakerButton
            expandButton
            hangupButton
        }
    }

    private var muteButton: some View {
        Button {
            callManager.toggleMute()
            HapticFeedback.light()
        } label: {
            Image(systemName: callManager.isMuted ? "mic.slash.fill" : "mic.fill")
                .font(.subheadline.weight(.medium))
                .foregroundColor(callManager.isMuted ? MeeshyColors.error : .white)
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(callManager.isMuted ? MeeshyColors.error.opacity(0.2) : Color.white.opacity(0.1))
                )
        }
        .pressable()
        .accessibilityLabel(callManager.isMuted
            ? String(localized: "call.pill.unmute", defaultValue: "Réactiver le micro")
            : String(localized: "call.pill.mute", defaultValue: "Couper le micro"))
        .callToggleAccessibility(isToggle: true, isActive: callManager.isMuted)
    }

    private var speakerButton: some View {
        Button {
            callManager.toggleSpeaker()
            HapticFeedback.light()
        } label: {
            Image(systemName: callManager.isSpeaker ? "speaker.wave.3.fill" : "speaker.fill")
                .font(.subheadline.weight(.medium))
                .foregroundColor(callManager.isSpeaker ? MeeshyColors.indigo400 : .white)
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(callManager.isSpeaker ? MeeshyColors.indigo400.opacity(0.2) : Color.white.opacity(0.1))
                )
        }
        .pressable()
        .accessibilityLabel(callManager.isSpeaker
            ? String(localized: "call.pill.speaker.off", defaultValue: "Désactiver le haut-parleur")
            : String(localized: "call.pill.speaker.on", defaultValue: "Activer le haut-parleur"))
        .callToggleAccessibility(isToggle: true, isActive: callManager.isSpeaker)
    }

    private var expandButton: some View {
        Button {
            expandToFullScreen()
        } label: {
            Image(systemName: "arrow.up.left.and.arrow.down.right")
                .font(.footnote.weight(.medium))
                .foregroundColor(.white)
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(Color.white.opacity(0.1))
                )
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.pill.expand", defaultValue: "Agrandir l'appel"))
        .accessibilityHint(String(localized: "call.pill.expand.hint", defaultValue: "Revient à l'affichage plein écran de l'appel"))
    }

    private var hangupButton: some View {
        Button {
            callManager.endCall()
            HapticFeedback.error()
        } label: {
            Image(systemName: "phone.down.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.white)
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [MeeshyColors.error, MeeshyColors.error.opacity(0.85)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                )
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.pill.hangup", defaultValue: "Raccrocher"))
        .accessibilityHint(String(localized: "call.end.hint", defaultValue: "Termine l'appel en cours", bundle: .main))
    }

    // MARK: - Actions

    private func expandToFullScreen() {
        withAnimation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.75)) {
            callManager.displayMode = .fullScreen
        }
        HapticFeedback.medium()
    }

    // MARK: - Formatting

    private var formattedDuration: String {
        let totalSeconds = Int(callManager.callDuration)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}
