import SwiftUI
import MeeshyUI

// MARK: - Floating Call Pill View

struct FloatingCallPillView: View {
    @EnvironmentObject var callManager: CallManager

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
            avatarView
            userInfoSection
            Spacer()
            controlButtons
        }
        .padding(.horizontal, 16)
        .frame(height: pillHeight)
        .background(.ultraThinMaterial)
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
        .accessibilityLabel("Appel en cours avec \(callManager.remoteUsername ?? "inconnu")")
        .accessibilityHint("Touchez pour revenir a l'appel en plein ecran")
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
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundColor(.white)
                .lineLimit(1)

            Text(formattedDuration)
                .font(.system(size: 12, weight: .medium).monospacedDigit())
                .foregroundColor(MeeshyColors.success)
        }
    }

    // MARK: - Control Buttons

    private var controlButtons: some View {
        HStack(spacing: 8) {
            muteButton
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
        .accessibilityLabel(callManager.isMuted ? "Reactiver le micro" : "Couper le micro")
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
        .accessibilityLabel("Agrandir l'appel")
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
                                colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                )
        }
        .pressable()
        .accessibilityLabel("Raccrocher")
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
