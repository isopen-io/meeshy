import SwiftUI
import MeeshySDK
import MeeshyUI
import os

// MARK: - Call View

struct CallView: View {
    @ObservedObject var callManager = CallManager.shared
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var transcriptionService = CallTranscriptionService()
    @State private var pulseScale: CGFloat = 1.0
    @State private var showControls = true
    @State private var showTranscript = false
    @State private var showEffectsToolbar = false
    @State private var localPreviewOffset: CGSize = .zero
    @State private var localPreviewPosition: CGPoint = CGPoint(x: UIScreen.main.bounds.width - 70, y: 100)

    var body: some View {
        ZStack {
            // Background: camera locale pour appels video, gradient pour audio
            if callManager.isVideoEnabled {
                CallVideoView(track: callManager.localVideoTrack, mirror: true, contentMode: .scaleAspectFill)
                    .ignoresSafeArea()
                Color.black.opacity(0.3)
                    .ignoresSafeArea()
            } else {
                callBackground
            }

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
            case .reconnecting:
                connectingView
            case .idle:
                EmptyView()
            }

            // Effects overlay — accessible dans tous les etats actifs (pas seulement connected)
            if callManager.callState.isActive && !callManager.callState.isRinging {
                CallEffectsOverlay(
                    isExpanded: $showEffectsToolbar,
                    isVideoEnabled: callManager.isVideoEnabled
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
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
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                .padding(.bottom, 8)

            // Status text
            Text("Appel en cours...")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.white.opacity(0.7))
                .padding(.bottom, 8)

            // Call type badge
            callTypeBadge
                .padding(.bottom, 60)

            Spacer()

            // Effects + End call row
            HStack(spacing: 40) {
                if callManager.isVideoEnabled {
                    effectsToggleButton
                }
                endCallButton
            }
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
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                .padding(.bottom, 8)

            HStack(spacing: 8) {
                ProgressView()
                    .tint(Color(hex: "08D9D6"))
                Text("Connexion...")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
            }
            .padding(.bottom, 60)

            Spacer()

            HStack(spacing: 40) {
                if callManager.isVideoEnabled {
                    effectsToggleButton
                }
                endCallButton
            }
            .padding(.bottom, 80)
        }
    }

    // MARK: - Connected

    private var connectedView: some View {
        ZStack {
            VStack(spacing: 0) {
                Spacer()

                if callManager.isVideoEnabled {
                    videoCallLayout
                } else {
                    audioCallLayout
                }

                Spacer()

                controlBar
                    .padding(.bottom, 60)
            }

            // Transcript overlay
            transcriptOverlay

            // Draggable local preview (video only)
            if callManager.isVideoEnabled {
                draggableLocalPreview
            }
        }
        .simultaneousGesture(
            DragGesture(minimumDistance: 50)
                .onEnded { value in
                    guard !showEffectsToolbar else { return }
                    if value.translation.height > 100 && callManager.isVideoEnabled {
                        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                            callManager.displayMode = .pip
                        }
                    }
                }
        )
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
            // Remote video (full area)
            if callManager.hasRemoteVideoTrack {
                CallVideoView(track: callManager.remoteVideoTrack, contentMode: .scaleAspectFill)
            } else {
                Color.black.opacity(0.4)
                    .overlay(
                        VStack(spacing: 12) {
                            ProgressView()
                                .tint(.white.opacity(0.5))
                            Text("Connexion video...")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(.white.opacity(0.4))
                        }
                    )
            }

            // Duration badge top-left
            VStack {
                HStack {
                    Text(callManager.formattedDuration)
                        .font(.system(size: 13, weight: .medium).monospacedDigit())
                        .foregroundColor(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(.ultraThinMaterial)
                        .clipShape(Capsule())
                        .padding(12)
                    Spacer()
                }
                Spacer()
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Draggable Local Preview

    private var draggableLocalPreview: some View {
        CallVideoView(track: callManager.localVideoTrack, mirror: true, contentMode: .scaleAspectFill)
            .frame(width: 100, height: 140)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.white.opacity(0.3), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
            .position(localPreviewPosition)
            .offset(localPreviewOffset)
            .gesture(
                DragGesture()
                    .onChanged { localPreviewOffset = $0.translation }
                    .onEnded { value in
                        let finalX = localPreviewPosition.x + value.translation.width
                        let finalY = localPreviewPosition.y + value.translation.height
                        let screenW = UIScreen.main.bounds.width
                        let screenH = UIScreen.main.bounds.height
                        let snappedX: CGFloat = finalX < screenW / 2 ? 70 : screenW - 70
                        let snappedY: CGFloat = max(80, min(finalY, screenH - 180))
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                            localPreviewPosition = CGPoint(x: snappedX, y: snappedY)
                            localPreviewOffset = .zero
                        }
                    }
            )
            .onTapGesture { callManager.switchCamera() }
    }

    // MARK: - Transcript Overlay

    private var transcriptOverlay: some View {
        let localUserId = AuthManager.shared.currentUser?.id ?? ""
        return VStack(alignment: .leading, spacing: 6) {
            ForEach(transcriptionService.displayedSegments) { segment in
                HStack(alignment: .top, spacing: 8) {
                    Circle()
                        .fill(segment.speakerId == localUserId ? Color.blue : Color.green)
                        .frame(width: 8, height: 8)
                        .padding(.top, 6)
                    Text(segment.text)
                        .font(.system(size: 14, weight: segment.isFinal ? .regular : .light))
                        .foregroundColor(.white)
                        .opacity(segment.isFinal ? 1.0 : 0.7)
                }
            }
        }
        .padding(12)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 16)
        .padding(.bottom, 100)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .opacity(showTranscript ? 1 : 0)
        .animation(.easeInOut(duration: 0.2), value: showTranscript)
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

    private var hasActiveEffects: Bool {
        callManager.activeAudioEffect != nil || callManager.videoFilters.config.isEnabled
    }

    private var controlBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 24) {
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

                // Effects (Plus button)
                callControlButton(
                    icon: showEffectsToolbar ? "xmark" : "plus",
                    color: hasActiveEffects ? "6366F1" : "FFFFFF",
                    bgColor: hasActiveEffects ? "6366F1" : "FFFFFF",
                    isActive: showEffectsToolbar || hasActiveEffects,
                    label: "Effets"
                ) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showEffectsToolbar.toggle()
                    }
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
            .padding(.horizontal, 16)
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

    private var effectsToggleButton: some View {
        Button {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showEffectsToolbar.toggle()
            }
        } label: {
            VStack(spacing: 6) {
                ZStack {
                    Circle()
                        .fill(hasActiveEffects ? MeeshyColors.indigo500.opacity(0.2) : Color.white.opacity(0.1))
                        .frame(width: 64, height: 64)
                        .overlay(
                            Circle()
                                .stroke(hasActiveEffects ? MeeshyColors.indigo500.opacity(0.5) : Color.white.opacity(0.2), lineWidth: 1)
                        )

                    Image(systemName: showEffectsToolbar ? "xmark" : "camera.filters")
                        .font(.system(size: 24, weight: .medium))
                        .foregroundColor(hasActiveEffects ? MeeshyColors.indigo500 : .white.opacity(0.9))
                }
                Text("Filtres")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
            }
        }
        .pressable()
        .accessibilityLabel("Filtres video")
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
        case .connectionLost: return "Connexion perdue"
        case .failed(let msg): return "Echec: \(msg)"
        }
    }
}

// MARK: - Logger Extension

private extension Logger {
    static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
