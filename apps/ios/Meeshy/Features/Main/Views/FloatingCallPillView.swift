import SwiftUI
import MeeshyUI

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

    private let pillHeight: CGFloat = 64

    var body: some View {
        if callManager.displayMode == .pip && callManager.callState.isActive {
            pillContent
                .transition(.move(edge: .top).combined(with: .opacity))
                .animation(.spring(response: 0.5, dampingFraction: 0.75), value: callManager.displayMode)
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
        .frame(height: pillHeight)
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

    /// §7.6 — for a minimized VIDEO call, show the live remote feed as a small
    /// thumbnail so the user still sees their interlocutor (a return-to-call pill
    /// that drops the video is a major gap). Falls back to the avatar for audio
    /// calls, or when the peer's camera is off / no track yet. Only one renderer
    /// is live at a time: CallView is dismounted while in `.pip`, so this does
    /// not double-render the remote track.
    @ViewBuilder
    private var pillLeadingVisual: some View {
        if callManager.isVideoEnabled && callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled {
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
                .frame(width: 36, height: 36)

            Text(initial)
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        }
        .accessibilityHidden(true)
    }

    // MARK: - User Info

    private var userInfoSection: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(callManager.remoteUsername ?? "Inconnu")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.white)
                .lineLimit(1)

            Text(formattedDuration)
                .font(.caption.weight(.medium).monospacedDigit())
                .foregroundColor(MeeshyColors.success)
        }
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
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(callManager.isMuted ? MeeshyColors.error : .white)
                .frame(width: 36, height: 36)
                .background(
                    Circle()
                        .fill(callManager.isMuted ? MeeshyColors.error.opacity(0.2) : Color.white.opacity(0.1))
                )
        }
        .pressable()
        .accessibilityLabel(callManager.isMuted
            ? String(localized: "call.pill.unmute", defaultValue: "Réactiver le micro")
            : String(localized: "call.pill.mute", defaultValue: "Couper le micro"))
    }

    private var speakerButton: some View {
        Button {
            callManager.toggleSpeaker()
            HapticFeedback.light()
        } label: {
            Image(systemName: callManager.isSpeaker ? "speaker.wave.3.fill" : "speaker.fill")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(callManager.isSpeaker ? MeeshyColors.indigo400 : .white)
                .frame(width: 36, height: 36)
                .background(
                    Circle()
                        .fill(callManager.isSpeaker ? MeeshyColors.indigo400.opacity(0.2) : Color.white.opacity(0.1))
                )
        }
        .pressable()
        .accessibilityLabel(callManager.isSpeaker
            ? String(localized: "call.pill.speaker.off", defaultValue: "Désactiver le haut-parleur")
            : String(localized: "call.pill.speaker.on", defaultValue: "Activer le haut-parleur"))
    }

    private var expandButton: some View {
        Button {
            expandToFullScreen()
        } label: {
            Image(systemName: "arrow.up.left.and.arrow.down.right")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.white)
                .frame(width: 36, height: 36)
                .background(
                    Circle()
                        .fill(Color.white.opacity(0.1))
                )
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.pill.expand", defaultValue: "Agrandir l'appel"))
    }

    private var hangupButton: some View {
        Button {
            callManager.endCall()
            HapticFeedback.error()
        } label: {
            Image(systemName: "phone.down.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 36, height: 36)
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
    }

    // MARK: - Actions

    private func expandToFullScreen() {
        withAnimation(.spring(response: 0.5, dampingFraction: 0.75)) {
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
