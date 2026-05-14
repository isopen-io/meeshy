import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Incoming Call View

struct IncomingCallView: View {
    // Audit P1-16 — `@ObservedObject var x = CallManager.shared` would
    // re-create the subscription every time the parent CallView re-evaluates
    // its body (which happens often during the ringing pulse animation).
    // Receive the manager from the parent so SwiftUI keeps the same
    // subscription throughout the view's lifetime.
    @ObservedObject var callManager: CallManager
    @Environment(\.colorScheme) private var colorScheme
    // Audit P2-iOS-9 — see CallView; skip repeating animations for
    // motion-sensitive users.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
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
                                MeeshyColors.success.opacity(0.4 - Double(index) * 0.08),
                                MeeshyColors.indigo400.opacity(0.2 - Double(index) * 0.04)
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
                        reduceMotion
                            ? nil
                            : .easeInOut(duration: 1.2)
                                .repeatForever(autoreverses: true)
                                .delay(Double(index) * 0.2),
                        value: ringScale
                    )
            }

            // Avatar
            avatarView
                .scaleEffect(avatarBounce ? 1.05 : 1.0)
                .animation(
                    reduceMotion
                        ? nil
                        : .spring(response: 0.6, dampingFraction: 0.5).repeatForever(autoreverses: true),
                    value: avatarBounce
                )
        }
        .onAppear {
            // Audit P2-iOS-9 — only kick off the infinite animations when
            // Reduce Motion is OFF. Otherwise the static layout is shown.
            ringScale = reduceMotion ? 1.0 : 1.1
            ringOpacity = reduceMotion ? 0.85 : 0.6
            avatarBounce = !reduceMotion
        }
        .onDisappear {
            withTransaction(Transaction(animation: nil)) {
                ringScale = 1.0
                ringOpacity = 0.0
                avatarBounce = false
            }
        }
    }

    private var avatarView: some View {
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
                .frame(width: 110, height: 110)

            Text(initial)
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        }
        .shadow(color: MeeshyColors.indigo500.opacity(0.4), radius: 16, y: 6)
    }

    // MARK: - Call Type Badge

    private var callTypeBadge: some View {
        HStack(spacing: 6) {
            Image(systemName: callManager.isVideoEnabled ? "video.fill" : "phone.fill")
                .font(.system(size: 12, weight: .semibold))
            Text(callManager.isVideoEnabled ? "Video" : "Audio")
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
                                    colors: [MeeshyColors.error, MeeshyColors.error.opacity(0.85)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 70, height: 70)
                            .shadow(color: MeeshyColors.error.opacity(0.4), radius: 10, y: 4)

                        Image(systemName: "phone.down.fill")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundColor(.white)
                    }

                    Text("Refuser")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
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
                                    colors: [MeeshyColors.success, MeeshyColors.indigo400],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 70, height: 70)
                            .shadow(color: MeeshyColors.success.opacity(0.4), radius: 10, y: 4)

                        Image(systemName: callManager.isVideoEnabled ? "video.fill" : "phone.fill")
                            .font(.system(size: 28, weight: .semibold))
                            .foregroundColor(.white)
                    }

                    Text("Accepter")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(MeeshyColors.success)
                }
            }
            .pressable()
            .accessibilityLabel("Accepter l'appel")
        }
    }
}
