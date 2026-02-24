import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Incoming Call View

struct IncomingCallView: View {
    @ObservedObject var callManager = CallManager.shared
    @ObservedObject private var theme = ThemeManager.shared
    @State private var ringScale: CGFloat = 0.8
    @State private var ringOpacity: Double = 1.0
    @State private var avatarBounce: Bool = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Pulsing ring animation
            ringAnimation
                .padding(.bottom, 32)

            // Caller name
            Text(callManager.remoteUsername ?? "Inconnu")
                .font(.system(size: 30, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .padding(.bottom, 8)

            // Call type label
            Text(callManager.isVideoEnabled ? "Appel video entrant" : "Appel entrant")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(theme.textMuted)
                .padding(.bottom, 12)

            // Call type badge
            callTypeBadge
                .padding(.bottom, 60)

            Spacer()

            // Accept / Reject buttons
            actionButtons
                .padding(.bottom, 80)
        }
    }

    // MARK: - Ring Animation

    private var ringAnimation: some View {
        ZStack {
            // Expanding rings
            ForEach(0..<4, id: \.self) { index in
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [
                                Color(hex: "4ADE80").opacity(0.4 - Double(index) * 0.08),
                                Color(hex: "08D9D6").opacity(0.2 - Double(index) * 0.04)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: max(1, 3 - CGFloat(index) * 0.5)
                    )
                    .frame(
                        width: 120 + CGFloat(index) * 35,
                        height: 120 + CGFloat(index) * 35
                    )
                    .scaleEffect(ringScale)
                    .opacity(ringOpacity - Double(index) * 0.15)
                    .animation(
                        .easeInOut(duration: 1.2)
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * 0.2),
                        value: ringScale
                    )
            }

            // Avatar
            avatarView
                .scaleEffect(avatarBounce ? 1.05 : 1.0)
                .animation(
                    .spring(response: 0.6, dampingFraction: 0.5)
                        .repeatForever(autoreverses: true),
                    value: avatarBounce
                )
        }
        .onAppear {
            ringScale = 1.1
            ringOpacity = 0.6
            avatarBounce = true
        }
    }

    private var avatarView: some View {
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
                .frame(width: 110, height: 110)

            Text(initial)
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        }
        .shadow(color: Color(hex: "A855F7").opacity(0.4), radius: 16, y: 6)
    }

    // MARK: - Call Type Badge

    private var callTypeBadge: some View {
        HStack(spacing: 6) {
            Image(systemName: callManager.isVideoEnabled ? "video.fill" : "phone.fill")
                .font(.system(size: 12, weight: .semibold))
            Text(callManager.isVideoEnabled ? "Video" : "Audio")
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

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack(spacing: 60) {
            // Reject
            Button {
                callManager.rejectCall()
            } label: {
                VStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 70, height: 70)
                            .shadow(color: Color(hex: "FF2E63").opacity(0.4), radius: 10, y: 4)

                        Image(systemName: "phone.down.fill")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundColor(.white)
                    }

                    Text("Refuser")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(hex: "FF2E63"))
                }
            }
            .pressable()
            .accessibilityLabel("Refuser l'appel")

            // Accept
            Button {
                callManager.answerCall()
            } label: {
                VStack(spacing: 10) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: "4ADE80"), Color(hex: "08D9D6")],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 70, height: 70)
                            .shadow(color: Color(hex: "4ADE80").opacity(0.4), radius: 10, y: 4)

                        Image(systemName: callManager.isVideoEnabled ? "video.fill" : "phone.fill")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundColor(.white)
                    }

                    Text("Accepter")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(hex: "4ADE80"))
                }
            }
            .pressable()
            .accessibilityLabel("Accepter l'appel")
        }
    }
}
