//
//  IncomingCallView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI

struct IncomingCallView: View {
    let call: Call
    @StateObject private var callService = CallService.shared
    @State private var isAnimating = false

    var body: some View {
        ZStack {
            // Background blur
            Color.black
                .opacity(0.95)
                .ignoresSafeArea()

            VStack(spacing: 40) {
                Spacer()

                // Caller info
                VStack(spacing: 20) {
                    // Avatar with pulse animation
                    ZStack {
                        // Pulse rings
                        ForEach(0..<3) { index in
                            Circle()
                                .stroke(Color.white.opacity(0.2), lineWidth: 2)
                                .frame(width: 160 + CGFloat(index * 30), height: 160 + CGFloat(index * 30))
                                .scaleEffect(isAnimating ? 1.2 : 1.0)
                                .opacity(isAnimating ? 0.0 : 0.5)
                                .animation(
                                    Animation.easeOut(duration: 1.5)
                                        .repeatForever(autoreverses: false)
                                        .delay(Double(index) * 0.3),
                                    value: isAnimating
                                )
                        }

                        // Avatar
                        Circle()
                            .fill(Color.gray.opacity(0.3))
                            .frame(width: 160, height: 160)
                            .overlay {
                                Text(initials)
                                    .font(.system(size: 60, weight: .semibold))
                                    .foregroundColor(.white)
                            }
                    }

                    // Caller name
                    Text(call.userName)
                        .font(.system(size: 34, weight: .bold))
                        .foregroundColor(.white)

                    // Call type
                    HStack(spacing: 6) {
                        Image(systemName: call.type.iconName)
                            .font(.system(size: 16))

                        Text(call.type.displayName)
                            .font(.system(size: 18))
                    }
                    .foregroundColor(.white.opacity(0.8))
                }

                Spacer()

                // Action buttons
                HStack(spacing: 80) {
                    // Decline button
                    Button {
                        handleDecline()
                    } label: {
                        ZStack {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 80, height: 80)

                            Image(systemName: "phone.down.fill")
                                .font(.system(size: 32))
                                .foregroundColor(.white)
                        }
                        .shadow(color: .red.opacity(0.5), radius: 10, x: 0, y: 5)
                    }
                    .buttonStyle(.plain)

                    // Accept button
                    Button {
                        handleAccept()
                    } label: {
                        ZStack {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 80, height: 80)

                            Image(systemName: "phone.fill")
                                .font(.system(size: 32))
                                .foregroundColor(.white)
                        }
                        .shadow(color: .green.opacity(0.5), radius: 10, x: 0, y: 5)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.bottom, 50)
            }
        }
        .onAppear {
            isAnimating = true
            playRingtone()
        }
        .onDisappear {
            stopRingtone()
        }
    }

    // MARK: - Computed Properties

    private var initials: String {
        let components = call.userName.split(separator: " ")
        let firstInitial = components.first?.first.map(String.init) ?? ""
        let lastInitial = components.dropFirst().first?.first.map(String.init) ?? ""
        return firstInitial + lastInitial
    }

    // MARK: - Actions

    private func handleAccept() {
        stopRingtone()
        Task {
            await callService.answerCall()
        }

        // Haptic feedback
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)
    }

    private func handleDecline() {
        stopRingtone()
        Task {
            await callService.declineCall()
        }

        // Haptic feedback
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.error)
    }

    // MARK: - Ringtone

    private func playRingtone() {
        // TODO: Implement ringtone playback
        print("Playing ringtone")
    }

    private func stopRingtone() {
        // TODO: Stop ringtone playback
        print("Stopping ringtone")
    }
}

#Preview {
    IncomingCallView(
        call: Call(
            id: "call1",
            callUUID: UUID(),
            userId: "user1",
            userName: "Alice Johnson",
            userAvatar: nil,
            type: .video,
            direction: .incoming,
            state: .ringing,
            startTime: Date(),
            endTime: nil,
            duration: nil
        )
    )
}
