//
//  VideoCallInitiatorView.swift
//  Meeshy
//
//  View to initiate a video call from a conversation
//  Shows local camera stream as background with callee info overlay
//  Transitions to ActiveCallView once connected
//

import SwiftUI
#if canImport(WebRTC)
import WebRTC
#endif

struct VideoCallInitiatorView: View {
    let conversation: Conversation
    let currentUserId: String
    let onDismiss: () -> Void

    @StateObject private var callService = CallService.shared
    @State private var isInitiating = false
    @State private var pulseAnimation = false

    // Get display name for the call
    private var calleeDisplayName: String {
        if conversation.isDirect {
            return conversation.displayNameForUser(currentUserId)
        }
        return conversation.displayName
    }

    // Get avatar URL - use displayAvatarForUser for direct conversations
    private var avatarURL: String? {
        conversation.displayAvatarForUser(currentUserId)
    }

    // Get initials for avatar placeholder
    private var calleeInitials: String {
        let components = calleeDisplayName.split(separator: " ")
        let firstInitial = components.first?.first.map(String.init) ?? ""
        let lastInitial = components.dropFirst().first?.first.map(String.init) ?? ""
        return (firstInitial + lastInitial).uppercased()
    }

    var body: some View {
        ZStack {
            // Background - local camera stream
            localCameraBackground
                .ignoresSafeArea()

            // Dark overlay for better visibility
            Color.black.opacity(0.4)
                .ignoresSafeArea()

            if let call = callService.activeCall, callService.callState == .connected {
                // Active call - show the call view
                ActiveCallView(call: call)
            } else {
                // Initiating call - show connecting state with callee info
                initiatingOverlay
            }
        }
        .statusBarHidden(true)
        .task {
            await initiateCall()
        }
        .onAppear {
            // Start pulse animation
            withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                pulseAnimation = true
            }
        }
        .onChange(of: callService.callState) { _, newState in
            if newState == .ended && !isInitiating {
                onDismiss()
            }
        }
    }

    // MARK: - Local Camera Background

    private var localCameraBackground: some View {
        ZStack {
            Color.black

            // Show local video if available
            if callService.hasLocalVideo, let localTrack = callService.getLocalVideoTrack() {
                WebRTCVideoView(
                    track: localTrack,
                    contentMode: .scaleAspectFill,
                    isMirrored: callService.isFrontCamera
                )
            } else {
                // Fallback gradient while camera initializes
                LinearGradient(
                    colors: [
                        Color(red: 0.1, green: 0.1, blue: 0.18),
                        Color(red: 0.086, green: 0.13, blue: 0.24)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
    }

    // MARK: - Initiating Overlay

    private var initiatingOverlay: some View {
        VStack(spacing: 0) {
            // Top bar with controls
            topControlsBar
                .padding(.top, 60)
                .padding(.horizontal, 16)

            Spacer()

            // Callee info in center
            calleeInfoSection

            Spacer()

            // Bottom controls
            bottomControlsBar
                .padding(.bottom, 50)
                .padding(.horizontal, 16)
        }
    }

    // MARK: - Top Controls Bar

    private var topControlsBar: some View {
        HStack {
            // Minimize button
            Button {
                Task {
                    await callService.endCall()
                    onDismiss()
                }
            } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.black.opacity(0.4))
                    .clipShape(Circle())
            }

            Spacer()

            // Camera switch button
            Button {
                callService.switchCamera()
            } label: {
                Image(systemName: "camera.rotate.fill")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .background(Color.black.opacity(0.4))
                    .clipShape(Circle())
            }
        }
    }

    // MARK: - Callee Info Section

    private var calleeInfoSection: some View {
        VStack(spacing: 24) {
            // Avatar with pulsating rings
            ZStack {
                // Pulsating rings
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .stroke(Color.green.opacity(0.3), lineWidth: 2)
                        .frame(width: 140 + CGFloat(index * 35), height: 140 + CGFloat(index * 35))
                        .scaleEffect(pulseAnimation ? 1.2 : 1.0)
                        .opacity(pulseAnimation ? 0 : 0.4)
                        .animation(
                            .easeOut(duration: 1.5)
                            .repeatForever(autoreverses: false)
                            .delay(Double(index) * 0.4),
                            value: pulseAnimation
                        )
                }

                // Avatar
                avatarView
                    .frame(width: 140, height: 140)
                    .clipShape(Circle())
                    .shadow(color: .black.opacity(0.4), radius: 20, x: 0, y: 10)
            }

            // Name
            Text(calleeDisplayName)
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.3), radius: 5, x: 0, y: 2)

            // Status
            statusView
        }
    }

    private var avatarView: some View {
        ZStack {
            Circle()
                .fill(Color.white.opacity(0.2))

            if let avatarURLString = avatarURL, let url = URL(string: avatarURLString) {
                AsyncImage(url: url) { image in
                    image
                        .resizable()
                        .scaledToFill()
                } placeholder: {
                    Text(calleeInitials)
                        .font(.system(size: 56, weight: .semibold))
                        .foregroundColor(.white)
                }
            } else {
                Text(calleeInitials)
                    .font(.system(size: 56, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
    }

    private var statusView: some View {
        HStack(spacing: 10) {
            Image(systemName: "phone.arrow.up.right.fill")
                .font(.system(size: 18))
                .foregroundColor(.green)
                .symbolEffect(.pulse, isActive: true)

            Text(callService.formattedCallDuration())
                .font(.system(size: 20, weight: .medium))
                .foregroundColor(.green)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(Color.black.opacity(0.4))
        .cornerRadius(25)
    }

    // MARK: - Bottom Controls Bar

    private var bottomControlsBar: some View {
        HStack(spacing: 0) {
            Spacer()

            // Mute button
            ControlButton(
                icon: callService.callInfo.isMuted ? "mic.slash.fill" : "mic.fill",
                label: callService.callInfo.isMuted ? "Activer" : "Muet",
                isActive: callService.callInfo.isMuted
            ) {
                callService.toggleMute()
            }

            Spacer()

            // End call button (larger, red)
            Button {
                Task {
                    await callService.endCall()
                    onDismiss()
                }
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

            // Video toggle button
            ControlButton(
                icon: callService.callInfo.isVideoEnabled ? "video.fill" : "video.slash.fill",
                label: callService.callInfo.isVideoEnabled ? "Vidéo" : "Vidéo",
                isActive: !callService.callInfo.isVideoEnabled
            ) {
                callService.toggleVideo()
            }

            Spacer()
        }
    }

    // MARK: - Call Initiation

    private func initiateCall() async {
        isInitiating = true

        // Set current user ID for signaling
        callService.setCurrentUserId(currentUserId)

        // Initiate the video call with correct display info
        // For direct conversations: use the other participant's name/avatar
        // For group conversations: use the conversation title/avatar
        await callService.initiateCall(
            conversationId: conversation.id,
            type: .video,
            recipientName: calleeDisplayName,
            recipientAvatar: avatarURL
        )

        isInitiating = false
    }
}

// MARK: - Control Button

private struct ControlButton: View {
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

// MARK: - Preview

#Preview {
    VideoCallInitiatorView(
        conversation: Conversation(
            id: "preview",
            identifier: "preview",
            type: .direct,
            title: "Test User",
            isActive: true,
            isArchived: false,
            lastMessageAt: Date(),
            createdAt: Date(),
            updatedAt: Date()
        ),
        currentUserId: "user1",
        onDismiss: {}
    )
}
