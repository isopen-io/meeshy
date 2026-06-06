import SwiftUI
import UIKit
import Combine
import MeeshySDK
import MeeshyUI
import os

// MARK: - Call View

struct CallView: View {
    @ObservedObject var callManager = CallManager.shared
    @Environment(\.colorScheme) private var colorScheme
    // Audit P2-iOS-9 — respect the user's Reduce Motion preference. Without
    // this check, the continuous pulse/ring animations ran indefinitely
    // even for motion-sensitive users (and burned battery).
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var transcriptionService = CallTranscriptionService()
    @State private var pulseScale: CGFloat = 1.0
    @State private var showControls = true
    @State private var showTranscript = false
    @State private var showEffectsToolbar = false
    // §7.2 — PiP placement is corner-anchored (snap-to-nearest-corner) and
    // computed from a GeometryReader, not a hardcoded point. `pipDragOffset`
    // tracks the in-flight drag; `pipCorner` is the resting corner.
    @State private var pipCorner: PiPCorner = .topTrailing
    @State private var pipDragOffset: CGSize = .zero
    // §7.2 — FaceTime-style swap: which stream is the full-area "primary".
    // false ⇒ remote is primary + local in the PiP; true ⇒ swapped. Tapping
    // the PiP toggles it.
    @State private var swapStreams = false

    var body: some View {
        ZStack {
            // Background: camera locale pour appels video, gradient pour audio
            if callManager.isVideoEnabled && callManager.hasLocalVideoTrack {
                CallVideoView(track: callManager.localVideoTrack, mirror: true, contentMode: .scaleAspectFill)
                    .ignoresSafeArea()
                Color.black.opacity(0.25)
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
                    // Audit P1-16 — pass our own @ObservedObject down so
                    // SwiftUI reuses the same subscription instead of
                    // re-creating it on each parent body reval.
                    IncomingCallView(callManager: callManager)
                }
            case .offering:
                // `.offering` = SDP offer émis, en attente de l'answer du
                // peer = en attente que l'appelé tape "Accepter" sur CallKit.
                // L'utilisateur attend toujours une réponse humaine — afficher
                // l'UI de "Sonnerie" (outgoingRingingView), pas "Connexion".
                // La transition vers connectingView ne se fait qu'après que
                // handleRemoteAnswer ait reçu l'answer SDP = preuve formelle
                // que le peer a accepté.
                outgoingRingingView
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

            // Minimize-to-PiP affordance. The drag-down gesture on the call
            // view already minimizes video calls (see audio/video layouts),
            // but audio calls had no equivalent and users were forced to end
            // the call to get back to the rest of the app. This explicit
            // top-leading chevron covers both modes and is reachable with one
            // hand on any device size.
            if callManager.callState.isActive {
                VStack {
                    HStack {
                        Button {
                            withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
                                callManager.displayMode = .pip
                            }
                            HapticFeedback.medium()
                        } label: {
                            Image(systemName: "chevron.down")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white)
                                .frame(width: 40, height: 40)
                                .background(
                                    Circle()
                                        .fill(.ultraThinMaterial)
                                )
                        }
                        .accessibilityLabel(String(localized: "call.minimize", defaultValue: "Reduire l'appel", bundle: .main))
                        .accessibilityHint(String(localized: "call.minimize.hint", defaultValue: "Garde l'appel en cours dans une banniere flottante", bundle: .main))
                        Spacer()
                    }
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 50)
            }
        }
        .ignoresSafeArea()
        .statusBarHidden(true)
        .onAppear {
            startPulseAnimation()
        }
        .onDisappear {
            stopPulseAnimation()
        }
    }

    // MARK: - Background

    private var callBackground: some View {
        ZStack {
            theme.backgroundGradient
                .ignoresSafeArea()

            // Animated ambient orbs
            Circle()
                .fill(MeeshyColors.indigo500.opacity(0.15))
                .frame(width: 300, height: 300)
                .blur(radius: 80)
                .offset(x: -80, y: -200)
                .floating(range: 20, duration: 5)

            Circle()
                .fill(MeeshyColors.indigo400.opacity(0.12))
                .frame(width: 350, height: 350)
                .blur(radius: 90)
                .offset(x: 100, y: 200)
                .floating(range: 25, duration: 6)

            Circle()
                .fill(MeeshyColors.error.opacity(0.1))
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
            Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                .padding(.bottom, 8)

            // Status text
            Text(String(localized: "call.outgoing.ringing", defaultValue: "Appel en cours...", bundle: .main))
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

            Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                .padding(.bottom, 8)

            HStack(spacing: 8) {
                ProgressView()
                    .tint(MeeshyColors.indigo400)
                Text(String(localized: "call.connecting", defaultValue: "Connexion...", bundle: .main))
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

            // §7.2 — draggable, corner-snapping PiP showing the secondary
            // stream. Tap to swap it with the full-area primary (FaceTime).
            if callManager.isVideoEnabled && callManager.hasLocalVideoTrack {
                pipView
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

            Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            // Duration + audit P2-iOS-10 connection quality indicator
            HStack(spacing: 6) {
                connectionQualityDot
                Text(callManager.formattedDuration)
                    .font(.system(size: 18, weight: .medium).monospacedDigit())
                    .foregroundColor(durationColor)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(durationColor.opacity(0.15))
            )

            // Status indicators
            HStack(spacing: 12) {
                if callManager.isMuted {
                    statusPill(icon: "mic.slash.fill", text: String(localized: "call.status.muted", defaultValue: "Micro coupe", bundle: .main), color: "FF2E63")
                }
                if callManager.isSpeaker {
                    statusPill(icon: "speaker.wave.3.fill", text: String(localized: "call.status.speaker", defaultValue: "Haut-parleur", bundle: .main), color: "08D9D6")
                }
                if isConnectionDegraded {
                    statusPill(icon: "wifi.exclamationmark", text: String(localized: "call.status.unstable", defaultValue: "Connexion instable", bundle: .main), color: "FBBF24")
                }
            }
        }
    }

    // MARK: - Connection Quality (P2-iOS-10)

    /// Audit P2-iOS-10 — `CallManager.connectionQuality` was tracked but
    /// never surfaced in the UI. Without this dot the user has no feedback
    /// when the call degrades (disconnected/failed), until it actually drops.
    private var connectionQualityDot: some View {
        Circle()
            .fill(connectionQualityColor)
            .frame(width: 8, height: 8)
            .accessibilityLabel(connectionQualityAccessibilityLabel)
    }

    private var connectionQualityColor: Color {
        switch callManager.connectionQuality {
        case .connected: return MeeshyColors.success
        case .reconnecting, .checking, .new: return MeeshyColors.warning
        case .disconnected, .failed, .closed: return MeeshyColors.error
        default: return MeeshyColors.indigo400
        }
    }

    private var connectionQualityAccessibilityLabel: String {
        switch callManager.connectionQuality {
        case .connected: return String(localized: "call.quality.good", defaultValue: "Connexion bonne", bundle: .main)
        case .reconnecting, .checking, .new: return String(localized: "call.quality.reconnecting", defaultValue: "Reconnexion", bundle: .main)
        case .disconnected, .failed, .closed: return String(localized: "call.quality.lost", defaultValue: "Connexion perdue", bundle: .main)
        default: return String(localized: "call.quality.inProgress", defaultValue: "Connexion en cours", bundle: .main)
        }
    }

    private var isConnectionDegraded: Bool {
        switch callManager.connectionQuality {
        case .disconnected, .failed: return true
        default: return false
        }
    }

    private var durationColor: Color {
        isConnectionDegraded ? MeeshyColors.warning : MeeshyColors.indigo400
    }

    private var videoCallLayout: some View {
        ZStack {
            // §7.2 — full-area PRIMARY stream. `swapStreams` decides whether the
            // primary is the remote feed (default) or the local camera (after a
            // PiP tap). The OTHER stream is rendered in the draggable PiP.
            videoStream(local: swapStreams, contentMode: .scaleAspectFill)

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

    /// §7.2 — renders one call stream. `local == true` shows the (mirrored)
    /// local camera; otherwise the remote feed, degrading to a camera-off
    /// placeholder (peer's camera off) or a connecting placeholder (no track
    /// yet). Shared by the full-area primary and the PiP so a swap just flips
    /// the `local` flag on each.
    @ViewBuilder
    private func videoStream(local: Bool, contentMode: UIView.ContentMode) -> some View {
        if local {
            // Mirror the local preview. Conditional front-only mirroring is §7.7.
            CallVideoView(track: callManager.localVideoTrack, mirror: true, contentMode: contentMode)
        } else if callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled {
            CallVideoView(track: callManager.remoteVideoTrack, contentMode: contentMode)
        } else if callManager.hasRemoteVideoTrack {
            // P0-3 — peer turned its camera off: avatar placeholder, never the
            // frozen last frame.
            remoteCameraOffPlaceholder
        } else {
            connectingVideoPlaceholder
        }
    }

    private var connectingVideoPlaceholder: some View {
        Color.black.opacity(0.4)
            .overlay(
                VStack(spacing: 12) {
                    ProgressView()
                        .tint(.white.opacity(0.5))
                    Text(String(localized: "call.video.connecting", defaultValue: "Connexion video...", bundle: .main))
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white.opacity(0.4))
                }
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // P0-3 — shown full-area when the remote peer has a video track but turned
    // its camera off, so the user sees the peer's avatar rather than a frozen
    // last frame.
    private var remoteCameraOffPlaceholder: some View {
        ZStack {
            Color.black.opacity(0.5)
            VStack(spacing: 14) {
                avatarCircle(size: 96)
                HStack(spacing: 6) {
                    Image(systemName: "video.slash.fill")
                        .font(.system(size: 13, weight: .semibold))
                    Text(String(localized: "call.video.remoteOff", defaultValue: "Caméra désactivée", bundle: .main))
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundColor(.white.opacity(0.6))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Picture-in-Picture (§7.2)

    /// The four anchor corners a PiP can snap to.
    private enum PiPCorner: CaseIterable {
        case topLeading, topTrailing, bottomLeading, bottomTrailing
    }

    private static let pipSize = CGSize(width: 100, height: 140)

    /// Resting center for the PiP in a given container, accounting for safe-ish
    /// insets (top for the notch/duration badge, bottom for the control bar).
    private func pipCenter(_ corner: PiPCorner, in container: CGSize) -> CGPoint {
        let halfW = Self.pipSize.width / 2
        let halfH = Self.pipSize.height / 2
        let margin: CGFloat = 16
        let topInset: CGFloat = 64      // below the minimize chevron / notch
        let bottomInset: CGFloat = 160  // above the control bar
        let leadingX = margin + halfW
        let trailingX = container.width - margin - halfW
        let topY = topInset + halfH
        let bottomY = container.height - bottomInset - halfH
        switch corner {
        case .topLeading: return CGPoint(x: leadingX, y: topY)
        case .topTrailing: return CGPoint(x: trailingX, y: topY)
        case .bottomLeading: return CGPoint(x: leadingX, y: bottomY)
        case .bottomTrailing: return CGPoint(x: trailingX, y: bottomY)
        }
    }

    /// Nearest corner to a point — used to snap on drag end.
    private func nearestCorner(to point: CGPoint, in container: CGSize) -> PiPCorner {
        PiPCorner.allCases.min(by: { a, b in
            let ca = pipCenter(a, in: container)
            let cb = pipCenter(b, in: container)
            return hypot(point.x - ca.x, point.y - ca.y) < hypot(point.x - cb.x, point.y - cb.y)
        }) ?? .topTrailing
    }

    private var pipView: some View {
        GeometryReader { geo in
            let base = pipCenter(pipCorner, in: geo.size)
            // §7.2 — the PiP shows the SECONDARY stream (the opposite of the
            // primary). Swap flips both with one tap.
            videoStream(local: !swapStreams, contentMode: .scaleAspectFill)
                .frame(width: Self.pipSize.width, height: Self.pipSize.height)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.white.opacity(0.3), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
                .position(x: base.x + pipDragOffset.width, y: base.y + pipDragOffset.height)
                .gesture(
                    DragGesture()
                        .onChanged { pipDragOffset = $0.translation }
                        .onEnded { value in
                            let dropped = CGPoint(x: base.x + value.translation.width,
                                                  y: base.y + value.translation.height)
                            let corner = nearestCorner(to: dropped, in: geo.size)
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                                pipCorner = corner
                                pipDragOffset = .zero
                            }
                            HapticFeedback.light()
                        }
                )
                // §7.2 — tap PiP = swap which stream is full-screen (FaceTime).
                // Camera flip lives in the control bar now (was here, undiscoverable).
                .onTapGesture {
                    withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                        swapStreams.toggle()
                    }
                    HapticFeedback.light()
                }
                .accessibilityLabel(String(localized: "call.pip.swap", defaultValue: "Permuter les vidéos", bundle: .main))
                .accessibilityHint(String(localized: "call.pip.swap.hint", defaultValue: "Touchez pour échanger la petite et la grande vidéo ; faites glisser pour déplacer", bundle: .main))
        }
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
        // PERF-005: tell the transcription service when the panel is visible
        // so it can skip per-frame partial-result work while hidden.
        .adaptiveOnChange(of: showTranscript) { _, newValue in
            transcriptionService.isShowingOverlay = newValue
        }
        .onAppear {
            transcriptionService.isShowingOverlay = showTranscript
        }
    }

    // MARK: - Ended

    private func endedView(reason: CallEndReason) -> some View {
        VStack(spacing: 16) {
            Spacer()

            avatarCircle(size: 100)
                .opacity(0.6)

            Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
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
                // Audit P2-iOS-7 — dynamic VoiceOver label so users hear the
                // outcome of the tap, not just "Micro".
                callControlButton(
                    icon: callManager.isMuted ? "mic.slash.fill" : "mic.fill",
                    color: callManager.isMuted ? "FF2E63" : "FFFFFF",
                    bgColor: callManager.isMuted ? "FF2E63" : "FFFFFF",
                    isActive: callManager.isMuted,
                    label: callManager.isMuted ? String(localized: "call.control.unmute", defaultValue: "Réactiver le micro", bundle: .main) : String(localized: "call.control.mute", defaultValue: "Couper le micro", bundle: .main)
                ) {
                    callManager.toggleMute()
                }

                // Speaker
                callControlButton(
                    icon: callManager.isSpeaker ? "speaker.wave.3.fill" : "speaker.fill",
                    color: callManager.isSpeaker ? "08D9D6" : "FFFFFF",
                    bgColor: callManager.isSpeaker ? "08D9D6" : "FFFFFF",
                    isActive: callManager.isSpeaker,
                    label: callManager.isSpeaker ? String(localized: "call.control.speakerOff", defaultValue: "Désactiver le haut-parleur", bundle: .main) : String(localized: "call.control.speakerOn", defaultValue: "Activer le haut-parleur", bundle: .main)
                ) {
                    callManager.toggleSpeaker()
                }

                // Effects (Plus button)
                callControlButton(
                    icon: showEffectsToolbar ? "xmark" : "plus",
                    color: hasActiveEffects ? "6366F1" : "FFFFFF",
                    bgColor: hasActiveEffects ? "6366F1" : "FFFFFF",
                    isActive: showEffectsToolbar || hasActiveEffects,
                    label: String(localized: "call.control.effects", defaultValue: "Effets", bundle: .main)
                ) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showEffectsToolbar.toggle()
                    }
                }

                // Audit P3 — Camera flip only when video is currently
                // capturing; flipping a stopped capturer has no effect.
                if callManager.isVideoEnabled {
                    callControlButton(
                        icon: "camera.rotate.fill",
                        color: "FFFFFF",
                        bgColor: "FFFFFF",
                        isActive: false,
                        label: String(localized: "call.control.flipCamera", defaultValue: "Basculer la caméra avant/arrière", bundle: .main)
                    ) {
                        callManager.switchCamera()
                    }
                }

                // Audit P3 — toggle button stays visible even when video is
                // disabled so the user can re-enable it. Was gated by
                // `if isVideoEnabled` which left the user unable to bring
                // video back after disabling it.
                if callManager.hasLocalVideoTrack || callManager.isVideoEnabled {
                    callControlButton(
                        icon: callManager.isVideoEnabled ? "video.fill" : "video.slash.fill",
                        color: "A855F7",
                        bgColor: "A855F7",
                        isActive: !callManager.isVideoEnabled,
                        label: callManager.isVideoEnabled ? String(localized: "call.control.videoOff", defaultValue: "Désactiver la vidéo", bundle: .main) : String(localized: "call.control.videoOn", defaultValue: "Activer la vidéo", bundle: .main)
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
                            colors: [MeeshyColors.indigo500.opacity(0.3), MeeshyColors.indigo400.opacity(0.1)],
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
                        colors: [MeeshyColors.indigo500, MeeshyColors.indigo400],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: size, height: size)

            Text(initial)
                .font(.system(size: size * 0.4, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        }
        .shadow(color: MeeshyColors.indigo500.opacity(0.3), radius: 12, y: 4)
    }

    private var callTypeBadge: some View {
        HStack(spacing: 6) {
            Image(systemName: callManager.isVideoEnabled ? "video.fill" : "phone.fill")
                .font(.system(size: 12, weight: .semibold))
            Text(callManager.isVideoEnabled ? String(localized: "call.type.video", defaultValue: "Appel video", bundle: .main) : String(localized: "call.type.audio", defaultValue: "Appel audio", bundle: .main))
                .font(.system(size: 13, weight: .semibold))
        }
        .foregroundColor(MeeshyColors.indigo400)
        .padding(.horizontal, 14)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(MeeshyColors.indigo400.opacity(0.15))
                .overlay(
                    Capsule()
                        .stroke(MeeshyColors.indigo400.opacity(0.3), lineWidth: 0.5)
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
                Text(String(localized: "call.filters", defaultValue: "Filtres", bundle: .main))
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
            }
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.filters.a11y", defaultValue: "Filtres video", bundle: .main))
    }

    private var endCallButton: some View {
        Button {
            callManager.endCall()
        } label: {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [MeeshyColors.error, MeeshyColors.error.opacity(0.85)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 64, height: 64)
                    .shadow(color: MeeshyColors.error.opacity(0.4), radius: 8, y: 4)

                Image(systemName: "phone.down.fill")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.end", defaultValue: "Raccrocher", bundle: .main))
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
        // Audit P2-iOS-9 — skip the repeating animation when Reduce Motion
        // is enabled. A one-shot scale is still informative; the infinite
        // loop is what's problematic for motion-sensitive users.
        guard !reduceMotion else { return }
        withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
            pulseScale = 1.15
        }
    }

    private func stopPulseAnimation() {
        withTransaction(Transaction(animation: nil)) {
            pulseScale = 1.0
        }
    }

    private func endReasonText(_ reason: CallEndReason) -> String {
        switch reason {
        case .local: return String(localized: "call.ended.local")
        case .remote: return String(localized: "call.ended.remote")
        case .rejected: return String(localized: "call.ended.rejected")
        case .missed: return String(localized: "call.ended.missed")
        case .connectionLost: return String(localized: "call.ended.connectionLost")
        case .failed(let msg):
            // Use a static key with the message as a separate interpolation
            // arg via String.LocalizationValue. Putting `\(msg)` directly in
            // the key argument violates the StaticString requirement of
            // String(localized:) under Swift 6 strict mode.
            return String(
                localized: "call.ended.failed",
                defaultValue: "Échec de l'appel : \(msg)"
            )
        }
    }
}

// MARK: - Logger Extension

private extension Logger {
    nonisolated static let calls = Logger(subsystem: "me.meeshy.app", category: "calls")
}
