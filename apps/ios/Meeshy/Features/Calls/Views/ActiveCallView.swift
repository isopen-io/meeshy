//
//  ActiveCallView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//  Updated: Improved UI/UX for video calls
//  Updated: Added real-time translation support
//

import SwiftUI
#if canImport(WebRTC)
import WebRTC
#endif

struct ActiveCallView: View {
    let call: Call
    @StateObject private var callService = CallService.shared
    @StateObject private var translationService = CallTranslationService.shared
    @Environment(\.dismiss) private var dismiss: DismissAction
    @State private var showEffectsSheet = false
    @State private var showTranslationOverlay = true

    /// Whether the call is connected (answered)
    private var isConnected: Bool {
        callService.callState == .connected
    }

    var body: some View {
        ZStack {
            // Background layer
            backgroundView

            // Overlay content
            VStack(spacing: 0) {
                // Top bar with controls
                topControlsBar
                    .padding(.top, 60)
                    .padding(.horizontal, 16)

                Spacer()

                // Call info overlay (only when ringing/connecting)
                if !isConnected {
                    callInfoOverlay
                        .transition(.opacity)
                }

                Spacer()

                // Local video PIP (only when connected and video enabled)
                if isConnected && call.type == .video && callService.callInfo.isVideoEnabled {
                    HStack {
                        Spacer()
                        localVideoPIP
                            .padding(.trailing, 16)
                            .padding(.bottom, 16)
                    }
                }

                // Translation overlay (when active and connected)
                if isConnected && translationService.isTranslationActive && showTranslationOverlay {
                    VStack {
                        CallTranslationOverlay()
                            .transition(.move(edge: .top).combined(with: .opacity))
                        Spacer()
                    }
                }

                // Bottom controls
                bottomControlsBar
                    .padding(.bottom, 50)
                    .padding(.horizontal, 16)
            }
        }
        .ignoresSafeArea()
        .animation(.easeInOut(duration: 0.3), value: isConnected)
        .animation(.spring(response: 0.3), value: translationService.isTranslationActive)
        .sheet(isPresented: $showEffectsSheet) {
            CallEffectsSheet(callService: callService)
        }
    }

    // MARK: - Background View

    @ViewBuilder
    private var backgroundView: some View {
        if call.type == .video {
            videoBackground
        } else {
            audioBackground
        }
    }

    /// Video background - shows local video when ringing, remote video when connected
    private var videoBackground: some View {
        ZStack {
            Color.black

            if isConnected {
                // After connected: Show remote video as background
                if callService.hasRemoteVideo, let remoteTrack = callService.getRemoteVideoTrack() {
                    WebRTCVideoView(
                        track: remoteTrack,
                        contentMode: .scaleAspectFill,
                        isMirrored: false
                    )
                } else {
                    // Remote video not available - show placeholder
                    remoteVideoPlaceholder
                }
            } else {
                // Before connected: Show local video as background
                if callService.callInfo.isVideoEnabled, let localTrack = callService.getLocalVideoTrack() {
                    WebRTCVideoView(
                        track: localTrack,
                        contentMode: .scaleAspectFill,
                        isMirrored: callService.isFrontCamera
                    )
                    .blur(radius: 3) // Slight blur for aesthetic
                } else {
                    // Local video not available - show gradient
                    LinearGradient(
                        colors: [Color.black, Color.gray.opacity(0.8)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
            }
        }
    }

    /// Audio call background with avatar and call info
    private var audioBackground: some View {
        ZStack {
            // Gradient background (dark navy to deep blue)
            LinearGradient(
                colors: [
                    Color(red: 0.1, green: 0.1, blue: 0.18),
                    Color(red: 0.086, green: 0.13, blue: 0.24)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            // Ambient circles
            GeometryReader { geo in
                Circle()
                    .fill(Color.blue.opacity(0.1))
                    .frame(width: geo.size.width * 0.8)
                    .offset(x: -geo.size.width * 0.2, y: -geo.size.height * 0.1)
                    .blur(radius: 60)

                Circle()
                    .fill(Color.purple.opacity(0.1))
                    .frame(width: geo.size.width * 0.6)
                    .offset(x: geo.size.width * 0.5, y: geo.size.height * 0.6)
                    .blur(radius: 50)
            }
        }
    }

    /// Placeholder when remote video is off
    private var remoteVideoPlaceholder: some View {
        VStack(spacing: 16) {
            // Avatar circle
            ZStack {
                Circle()
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 120, height: 120)

                if let avatarUrl = call.userAvatar, let url = URL(string: avatarUrl) {
                    AsyncImage(url: url) { image in
                        image
                            .resizable()
                            .scaledToFill()
                    } placeholder: {
                        Text(initials)
                            .font(.system(size: 48, weight: .semibold))
                            .foregroundColor(.white)
                    }
                    .frame(width: 120, height: 120)
                    .clipShape(Circle())
                } else {
                    Text(initials)
                        .font(.system(size: 48, weight: .semibold))
                        .foregroundColor(.white)
                }
            }

            Text(call.userName)
                .font(.system(size: 24, weight: .semibold))
                .foregroundColor(.white)

            HStack(spacing: 8) {
                Image(systemName: "video.slash.fill")
                    .font(.system(size: 14))
                Text("Camera off")
                    .font(.system(size: 16))
            }
            .foregroundColor(.white.opacity(0.6))
        }
    }

    // MARK: - Call Info Overlay (Ringing State)

    private var callInfoOverlay: some View {
        VStack(spacing: 24) {
            // Avatar with pulsating rings
            ZStack {
                // Pulsating rings
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .stroke(Color.green.opacity(0.4), lineWidth: 2)
                        .frame(width: 140 + CGFloat(index * 35), height: 140 + CGFloat(index * 35))
                        .scaleEffect(callService.isConnecting ? 1.3 : 1.0)
                        .opacity(callService.isConnecting ? 0 : 0.4)
                        .animation(
                            .easeOut(duration: 1.5)
                            .repeatForever(autoreverses: false)
                            .delay(Double(index) * 0.4),
                            value: callService.isConnecting
                        )
                }

                // Avatar
                Circle()
                    .fill(Color.white.opacity(0.2))
                    .frame(width: 140, height: 140)
                    .overlay {
                        if let avatarUrl = call.userAvatar, let url = URL(string: avatarUrl) {
                            AsyncImage(url: url) { image in
                                image
                                    .resizable()
                                    .scaledToFill()
                            } placeholder: {
                                Text(initials)
                                    .font(.system(size: 56, weight: .semibold))
                                    .foregroundColor(.white)
                            }
                            .frame(width: 140, height: 140)
                            .clipShape(Circle())
                        } else {
                            Text(initials)
                                .font(.system(size: 56, weight: .semibold))
                                .foregroundColor(.white)
                        }
                    }
                    .shadow(color: .black.opacity(0.3), radius: 20, x: 0, y: 10)
            }

            // Name
            Text(call.userName)
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.3), radius: 5, x: 0, y: 2)

            // Status
            HStack(spacing: 10) {
                Image(systemName: "phone.arrow.up.right.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.green)
                    .symbolEffect(.pulse, isActive: callService.isConnecting)

                Text(callService.formattedCallDuration())
                    .font(.system(size: 20, weight: .medium))
                    .foregroundColor(.green)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(Color.black.opacity(0.3))
            .cornerRadius(25)
        }
        .padding(.bottom, 60)
    }

    // MARK: - Top Controls Bar

    private var topControlsBar: some View {
        HStack(alignment: .top) {
            // Left side: Minimize, Camera toggle, Effects
            HStack(spacing: 12) {
                // Minimize button
                CircleButton(icon: "chevron.down") {
                    callService.callInfo.isMinimized = true
                    dismiss()
                }

                // Camera toggle (video calls only)
                if call.type == .video {
                    CircleButton(
                        icon: callService.callInfo.isVideoEnabled ? "video.fill" : "video.slash.fill",
                        isActive: !callService.callInfo.isVideoEnabled
                    ) {
                        callService.toggleVideo()
                    }

                    // Effects button
                    CircleButton(icon: "sparkles") {
                        showEffectsSheet = true
                    }
                }
            }

            Spacer()

            // Right side: Add participant, Connection quality
            VStack(alignment: .trailing, spacing: 12) {
                // Add participant button
                CircleButton(icon: "person.badge.plus") {
                    // TODO: Add participant
                }
                .opacity(0.6)

                // Connection quality indicator
                HStack(spacing: 6) {
                    Image(systemName: callService.callInfo.connectionQuality.iconName)
                        .font(.system(size: 12))

                    Text(callService.callInfo.connectionQuality.displayName)
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(connectionQualityColor)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.black.opacity(0.4))
                .cornerRadius(16)
            }
        }
    }

    // MARK: - Local Video PIP

    private var localVideoPIP: some View {
        ZStack(alignment: .topTrailing) {
            // Local video frame
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.black)
                .frame(width: 120, height: 160)
                .overlay {
                    if let localTrack = callService.getLocalVideoTrack() {
                        WebRTCVideoView(
                            track: localTrack,
                            contentMode: .scaleAspectFill,
                            isMirrored: callService.isFrontCamera
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                    } else {
                        Text(myInitials)
                            .font(.system(size: 32, weight: .semibold))
                            .foregroundColor(.white)
                    }
                }
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.white.opacity(0.3), lineWidth: 1)
                )
                .shadow(color: .black.opacity(0.4), radius: 10, x: 0, y: 5)

            // Switch camera button
            Button {
                callService.switchCamera()
            } label: {
                Image(systemName: "camera.rotate.fill")
                    .font(.system(size: 12))
                    .foregroundColor(.white)
                    .frame(width: 28, height: 28)
                    .background(Color.black.opacity(0.6))
                    .clipShape(Circle())
            }
            .offset(x: 6, y: -6)
        }
        .onTapGesture(count: 2) {
            callService.switchCamera()
        }
    }

    // MARK: - Bottom Controls Bar

    private var bottomControlsBar: some View {
        VStack(spacing: 16) {
            // Main controls row
            HStack(spacing: 0) {
                Spacer()

                // Mute button
                LargeControlButton(
                    icon: callService.callInfo.isMuted ? "mic.slash.fill" : "mic.fill",
                    label: callService.callInfo.isMuted ? "Unmute" : "Mute",
                    isActive: callService.callInfo.isMuted
                ) {
                    callService.toggleMute()
                }

                Spacer()

                // End call button (larger, red)
                Button {
                    handleEndCall()
                } label: {
                    ZStack {
                        Circle()
                            .fill(Color.red)
                            .frame(width: 72, height: 72)

                        Image(systemName: "phone.down.fill")
                            .font(.system(size: 28))
                            .foregroundColor(.white)
                    }
                    .shadow(color: Color.red.opacity(0.4), radius: 10, x: 0, y: 5)
                }
                .buttonStyle(.plain)

                Spacer()

                // Speaker button
                LargeControlButton(
                    icon: callService.callInfo.isSpeakerOn ? "speaker.wave.3.fill" : "speaker.fill",
                    label: callService.callInfo.isSpeakerOn ? "Speaker" : "Speaker",
                    isActive: callService.callInfo.isSpeakerOn
                ) {
                    callService.toggleSpeaker()
                }

                Spacer()
            }

            // Secondary controls row (translation, etc.)
            if isConnected {
                HStack(spacing: 24) {
                    // Translation button
                    CallTranslationButton()

                    // Toggle captions visibility (when translation active)
                    if translationService.isTranslationActive {
                        Button {
                            withAnimation {
                                showTranslationOverlay.toggle()
                            }
                        } label: {
                            VStack(spacing: 4) {
                                ZStack {
                                    Circle()
                                        .fill(showTranslationOverlay ? Color.blue : Color.white.opacity(0.2))
                                        .frame(width: 44, height: 44)

                                    Image(systemName: "captions.bubble")
                                        .font(.system(size: 18))
                                        .foregroundStyle(showTranslationOverlay ? .white : .white)
                                }

                                Text(showTranslationOverlay ? "Hide" : "Show")
                                    .font(.system(size: 10))
                                    .foregroundStyle(.white.opacity(0.8))
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .padding(.horizontal, 24)
        .animation(.spring(response: 0.3), value: isConnected)
    }

    // MARK: - Computed Properties

    private var initials: String {
        let components = call.userName.split(separator: " ")
        let firstInitial = components.first?.first.map(String.init) ?? ""
        let lastInitial = components.dropFirst().first?.first.map(String.init) ?? ""
        return firstInitial + lastInitial
    }

    private var myInitials: String {
        // For local video PIP - could get from current user
        "Me"
    }

    private var connectionQualityColor: Color {
        switch callService.callInfo.connectionQuality {
        case .excellent, .good: return .green
        case .fair: return .orange
        case .poor: return .red
        }
    }

    // MARK: - Actions

    private func handleEndCall() {
        Task {
            // Stop translation if active
            if translationService.isTranslationActive {
                await translationService.stopTranslation()
            }
            await callService.endCall()
        }
        dismiss()
    }
}

// MARK: - Circle Button

private struct CircleButton: View {
    let icon: String
    var isActive: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .medium))
                .foregroundColor(isActive ? .black : .white)
                .frame(width: 44, height: 44)
                .background(isActive ? Color.white : Color.black.opacity(0.4))
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Large Control Button

private struct LargeControlButton: View {
    let icon: String
    let label: String
    var isActive: Bool = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                ZStack {
                    Circle()
                        .fill(isActive ? Color.white : Color.white.opacity(0.2))
                        .frame(width: 56, height: 56)

                    Image(systemName: icon)
                        .font(.system(size: 22))
                        .foregroundColor(isActive ? .black : .white)
                }

                Text(label)
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.8))
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Call Effects Sheet

struct CallEffectsSheet: View {
    @ObservedObject var callService: CallService
    @Environment(\.dismiss) private var dismiss
    @State private var selectedAudioEffect: AudioEffectType = .normal

    var body: some View {
        NavigationStack {
            List {
                // Video Effects Section
                Section("Effets Vidéo") {
                    VideoEffectRow(icon: "camera.filters", title: "Filtres", subtitle: "Appliquer des filtres visuels")
                    VideoEffectRow(icon: "person.crop.rectangle", title: "Flou d'arrière-plan", subtitle: "Flouter votre arrière-plan")
                    VideoEffectRow(icon: "photo", title: "Arrière-plan virtuel", subtitle: "Remplacer l'arrière-plan")
                    VideoEffectRow(icon: "face.smiling", title: "Retouche", subtitle: "Améliorer l'apparence")
                }

                // Audio Effects Section - Using the catalog
                Section("Effets Audio") {
                    ForEach(AudioEffectsCatalog.shared.callEffects) { effect in
                        AudioEffectListRow(
                            effect: effect,
                            isSelected: selectedAudioEffect == effect.type
                        ) {
                            selectedAudioEffect = effect.type
                            // TODO: Apply audio effect to call
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        }
                    }
                }

                // Utility Section
                Section("Utilitaires") {
                    VideoEffectRow(icon: "speaker.wave.2", title: "Suppression du bruit", subtitle: "Réduire le bruit de fond")
                    VideoEffectRow(icon: "waveform.badge.mic", title: "Amélioration vocale", subtitle: "Clarifier votre voix")
                }
            }
            .navigationTitle("Effets d'appel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("OK") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Row for video effects
private struct VideoEffectRow: View {
    let icon: String
    let title: String
    let subtitle: String

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 24))
                .foregroundColor(.blue)
                .frame(width: 44, height: 44)
                .background(Color.blue.opacity(0.1))
                .cornerRadius(10)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 16, weight: .medium))

                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 14))
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }
}

/// Row for audio effects from the catalog
private struct AudioEffectListRow: View {
    let effect: AudioEffectDefinition
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                Image(systemName: effect.icon)
                    .font(.system(size: 24))
                    .foregroundColor(isSelected ? .white : effect.color)
                    .frame(width: 44, height: 44)
                    .background(isSelected ? effect.color : effect.color.opacity(0.15))
                    .cornerRadius(10)

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(effect.displayName)
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.primary)

                        if effect.isPremium {
                            Image(systemName: "star.fill")
                                .font(.system(size: 10))
                                .foregroundColor(.yellow)
                        }
                    }

                    Text(effect.description)
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(effect.color)
                }
            }
            .padding(.vertical, 4)
        }
        .buttonStyle(.plain)
    }
}

// Preview removed - ActiveCallView uses @Environment(\.dismiss) which cannot be initialized in previews
