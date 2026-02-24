import SwiftUI
import MeeshySDK
import MeeshyUI
import os

// MARK: - Call View

struct CallView: View {
    @ObservedObject var callManager = CallManager.shared
    @ObservedObject private var theme = ThemeManager.shared
    @State private var pulseScale: CGFloat = 1.0
    @State private var showControls = true

    var body: some View {
        ZStack {
            // Background
            callBackground

            // Content based on state
            switch callManager.callState {
            case .ringing(let isOutgoing):
                if isOutgoing {
                    outgoingRingingView
                } else {
                    IncomingCallView()
                }
            case .connecting:
                connectingView
            case .connected:
                connectedView
            case .ended(let reason):
                endedView(reason: reason)
            case .idle:
                EmptyView()
            }
        }
        .ignoresSafeArea()
        .statusBarHidden(true)
        .onAppear {
            startPulseAnimation()
        }
    }

    // MARK: - Background

    private var callBackground: some View {
        ZStack {
            theme.backgroundGradient
                .ignoresSafeArea()

            // Animated ambient orbs
            Circle()
                .fill(Color(hex: "A855F7").opacity(0.15))
                .frame(width: 300, height: 300)
                .blur(radius: 80)
                .offset(x: -80, y: -200)
                .floating(range: 20, duration: 5)

            Circle()
                .fill(Color(hex: "08D9D6").opacity(0.12))
                .frame(width: 350, height: 350)
                .blur(radius: 90)
                .offset(x: 100, y: 200)
                .floating(range: 25, duration: 6)

            Circle()
                .fill(Color(hex: "FF2E63").opacity(0.1))
                .frame(width: 250, height: 250)
                .blur(radius: 70)
                .offset(x: 80, y: -100)
                .floating(range: 15, duration: 4.5)
        }
    }

    // MARK: - Outgoing Ringing

    private var outgoingRingingView: some View {
        VStack(spacing: 0) {
            Spacer()

            // Pulsing avatar
            pulsingAvatar
                .padding(.bottom, 24)

            // Name
            Text(callManager.remoteUsername ?? "Inconnu")
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .padding(.bottom, 8)

            // Status text
            Text("Appel en cours...")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(theme.textMuted)
                .padding(.bottom, 8)

            // Call type badge
            callTypeBadge
                .padding(.bottom, 60)

            Spacer()

            // End call button
            endCallButton
                .padding(.bottom, 80)
        }
    }

    // MARK: - Connecting

    private var connectingView: some View {
        VStack(spacing: 0) {
            Spacer()

            pulsingAvatar
                .padding(.bottom, 24)

            Text(callManager.remoteUsername ?? "Inconnu")
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .padding(.bottom, 8)

            HStack(spacing: 8) {
                ProgressView()
                    .tint(Color(hex: "08D9D6"))
                Text("Connexion...")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
            .padding(.bottom, 60)

            Spacer()

            endCallButton
                .padding(.bottom, 80)
        }
    }

    // MARK: - Connected

    private var connectedView: some View {
        VStack(spacing: 0) {
            Spacer()

            if callManager.isVideoEnabled {
                // Video call layout
                videoCallLayout
            } else {
                // Audio call layout
                audioCallLayout
            }

            Spacer()

            // Control bar
            controlBar
                .padding(.bottom, 60)
        }
    }

    private var audioCallLayout: some View {
        VStack(spacing: 16) {
            // Avatar (no pulse)
            avatarCircle(size: 120)
                .padding(.bottom, 8)

            Text(callManager.remoteUsername ?? "Inconnu")
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            // Duration
            Text(callManager.formattedDuration)
                .font(.system(size: 18, weight: .medium).monospacedDigit())
                .foregroundColor(Color(hex: "08D9D6"))
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(Color(hex: "08D9D6").opacity(0.15))
                )

            // Status indicators
            HStack(spacing: 12) {
                if callManager.isMuted {
                    statusPill(icon: "mic.slash.fill", text: "Micro coupe", color: "FF2E63")
                }
                if callManager.isSpeaker {
                    statusPill(icon: "speaker.wave.3.fill", text: "Haut-parleur", color: "08D9D6")
                }
            }
        }
    }

    private var videoCallLayout: some View {
        ZStack {
            // Remote video placeholder (full screen)
            RoundedRectangle(cornerRadius: 20)
                .fill(Color.black.opacity(0.4))
                .overlay(
                    VStack(spacing: 12) {
                        Image(systemName: "video.fill")
                            .font(.system(size: 40))
                            .foregroundColor(.white.opacity(0.3))
                        Text("Video en attente...")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.white.opacity(0.4))
                    }
                )
                .frame(maxWidth: .infinity, maxHeight: 400)
                .padding(.horizontal, 20)

            // Local video PiP (corner)
            VStack {
                HStack {
                    Spacer()
                    localVideoPiP
                }
                Spacer()
            }
            .padding(.top, 20)
            .padding(.trailing, 30)
        }
    }

    private var localVideoPiP: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(Color.black.opacity(0.6))
            .frame(width: 100, height: 140)
            .overlay(
                VStack(spacing: 4) {
                    Image(systemName: "person.fill")
                        .font(.system(size: 24))
                        .foregroundColor(.white.opacity(0.4))
                    Text("Vous")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.3))
                }
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.white.opacity(0.2), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
    }

    // MARK: - Ended

    private func endedView(reason: CallEndReason) -> some View {
        VStack(spacing: 16) {
            Spacer()

            avatarCircle(size: 100)
                .opacity(0.6)

            Text(callManager.remoteUsername ?? "Inconnu")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary.opacity(0.7))

            Text(endReasonText(reason))
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(theme.textMuted)

            if callManager.callDuration > 0 {
                Text(callManager.formattedDuration)
                    .font(.system(size: 14, weight: .medium).monospacedDigit())
                    .foregroundColor(theme.textMuted.opacity(0.6))
            }

            Spacer()
        }
    }

    // MARK: - Control Bar

    private var controlBar: some View {
        HStack(spacing: 28) {
            // Mute
            callControlButton(
                icon: callManager.isMuted ? "mic.slash.fill" : "mic.fill",
                color: callManager.isMuted ? "FF2E63" : "FFFFFF",
                bgColor: callManager.isMuted ? "FF2E63" : "FFFFFF",
                isActive: callManager.isMuted,
                label: "Micro"
            ) {
                callManager.toggleMute()
            }

            // Speaker
            callControlButton(
                icon: callManager.isSpeaker ? "speaker.wave.3.fill" : "speaker.fill",
                color: callManager.isSpeaker ? "08D9D6" : "FFFFFF",
                bgColor: callManager.isSpeaker ? "08D9D6" : "FFFFFF",
                isActive: callManager.isSpeaker,
                label: "HP"
            ) {
                callManager.toggleSpeaker()
            }

            if callManager.isVideoEnabled {
                // Camera flip
                callControlButton(
                    icon: "camera.rotate.fill",
                    color: "FFFFFF",
                    bgColor: "FFFFFF",
                    isActive: false,
                    label: "Camera"
                ) {
                    callManager.switchCamera()
                }

                // Toggle video
                callControlButton(
                    icon: callManager.isVideoEnabled ? "video.fill" : "video.slash.fill",
                    color: "A855F7",
                    bgColor: "A855F7",
                    isActive: false,
                    label: "Video"
                ) {
                    callManager.toggleVideo()
                }
            }

            // End call
            endCallButton
        }
    }

    // MARK: - UI Components

    private var pulsingAvatar: some View {
        ZStack {
            // Pulse rings
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [Color(hex: "A855F7").opacity(0.3), Color(hex: "08D9D6").opacity(0.1)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 2
                    )
                    .frame(width: 120 + CGFloat(index) * 30, height: 120 + CGFloat(index) * 30)
                    .scaleEffect(pulseScale)
                    .opacity(2.0 - Double(pulseScale) * 0.8)
                    .animation(
                        .easeInOut(duration: 1.5)
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * 0.3),
                        value: pulseScale
                    )
            }

            avatarCircle(size: 100)
        }
    }

    private func avatarCircle(size: CGFloat) -> some View {
        let name = callManager.remoteUsername ?? "?"
        let initial = String(name.prefix(1)).uppercased()

        return ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [Color(hex: "A855F7"), Color(hex: "08D9D6")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: size, height: size)

            Text(initial)
                .font(.system(size: size * 0.4, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        }
        .shadow(color: Color(hex: "A855F7").opacity(0.3), radius: 12, y: 4)
    }

    private var callTypeBadge: some View {
        HStack(spacing: 6) {
            Image(systemName: callManager.isVideoEnabled ? "video.fill" : "phone.fill")
                .font(.system(size: 12, weight: .semibold))
            Text(callManager.isVideoEnabled ? "Appel video" : "Appel audio")
                .font(.system(size: 13, weight: .semibold))
        }
        .foregroundColor(Color(hex: "08D9D6"))
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(Color(hex: "08D9D6").opacity(0.15))
                .overlay(
                    Capsule()
                        .stroke(Color(hex: "08D9D6").opacity(0.3), lineWidth: 0.5)
                )
        )
    }

    private func callControlButton(icon: String, color: String, bgColor: String, isActive: Bool, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    Circle()
                        .fill(isActive ? Color(hex: bgColor).opacity(0.2) : Color.white.opacity(0.1))
                        .frame(width: 56, height: 56)
                        .overlay(
                            Circle()
                                .stroke(Color(hex: color).opacity(isActive ? 0.5 : 0.2), lineWidth: 1)
                        )

                    Image(systemName: icon)
                        .font(.system(size: 22, weight: .medium))
                        .foregroundColor(isActive ? Color(hex: color) : .white.opacity(0.9))
                }

                Text(label)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
        .pressable()
        .accessibilityLabel(label)
    }

    private var endCallButton: some View {
        Button {
            callManager.endCall()
        } label: {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 64, height: 64)
                    .shadow(color: Color(hex: "FF2E63").opacity(0.4), radius: 8, y: 4)

                Image(systemName: "phone.down.fill")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
        .pressable()
        .accessibilityLabel("Raccrocher")
    }

    private func statusPill(icon: String, text: String, color: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 10, weight: .semibold))
            Text(text)
                .font(.system(size: 11, weight: .medium))
        }
        .foregroundColor(Color(hex: color))
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(Color(hex: color).opacity(0.12))
        )
    }

    // MARK: - Helpers

    private func startPulseAnimation() {
        withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
            pulseScale = 1.15
        }
    }

    private func endReasonText(_ reason: CallEndReason) -> String {
        switch reason {
        case .local: return "Appel termine"
        case .remote: return "Appel termine"
        case .rejected: return "Appel refuse"
        case .missed: return "Appel manque"
        case .failed(let msg): return "Echec: \(msg)"
        }
    }
}

// MARK: - Logger Extension

private extension Logger {
    static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
