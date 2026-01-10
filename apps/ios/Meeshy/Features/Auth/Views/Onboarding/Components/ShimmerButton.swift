//
//  ShimmerButton.swift
//  Meeshy
//
//  Animated button with shimmer effect for onboarding
//  Features gradient animation and bouncy feedback
//

import SwiftUI

struct ShimmerButton: View {
    let title: String
    let icon: String?
    let accentColor: Color
    let isEnabled: Bool
    let isLoading: Bool
    let action: () -> Void

    @State private var shimmerOffset: CGFloat = -1
    @State private var isPressed = false

    init(
        title: String,
        icon: String? = "arrow.right",
        accentColor: Color = .blue,
        isEnabled: Bool = true,
        isLoading: Bool = false,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.icon = icon
        self.accentColor = accentColor
        self.isEnabled = isEnabled
        self.isLoading = isLoading
        self.action = action
    }

    var body: some View {
        Button(action: {
            guard isEnabled && !isLoading else { return }
            HapticFeedback.medium.trigger()
            action()
        }) {
            HStack(spacing: 12) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.9)
                } else {
                    Text(title)
                        .font(.system(size: 17, weight: .semibold))

                    if let icon = icon {
                        Image(systemName: icon)
                            .font(.system(size: 16, weight: .semibold))
                            .offset(x: isPressed ? 4 : 0)
                    }
                }
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(
                ZStack {
                    // Base gradient
                    RoundedRectangle(cornerRadius: 16)
                        .fill(
                            LinearGradient(
                                colors: isEnabled ? [
                                    accentColor,
                                    accentColor.opacity(0.8)
                                ] : [Color.gray, Color.gray.opacity(0.8)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )

                    // Shimmer overlay
                    if isEnabled && !isLoading {
                        GeometryReader { geometry in
                            LinearGradient(
                                colors: [
                                    .clear,
                                    .white.opacity(0.3),
                                    .clear
                                ],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                            .frame(width: geometry.size.width * 0.5)
                            .offset(x: shimmerOffset * geometry.size.width)
                            .mask(
                                RoundedRectangle(cornerRadius: 16)
                            )
                        }
                    }
                }
            )
            .shadow(
                color: isEnabled ? accentColor.opacity(0.4) : Color.clear,
                radius: isPressed ? 4 : 8,
                y: isPressed ? 2 : 4
            )
            .scaleEffect(isPressed ? 0.97 : 1)
        }
        .disabled(!isEnabled || isLoading)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isPressed)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in isPressed = true }
                .onEnded { _ in isPressed = false }
        )
        .onAppear {
            startShimmerAnimation()
        }
    }

    private func startShimmerAnimation() {
        withAnimation(
            .linear(duration: 2.5)
            .repeatForever(autoreverses: false)
        ) {
            shimmerOffset = 2
        }
    }
}

// MARK: - Secondary Button

struct OnboardingSecondaryButton: View {
    let title: String
    let icon: String?
    let action: () -> Void

    @State private var isPressed = false

    init(
        title: String,
        icon: String? = nil,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.icon = icon
        self.action = action
    }

    var body: some View {
        Button(action: {
            HapticFeedback.light.trigger()
            action()
        }) {
            HStack(spacing: 8) {
                if let icon = icon {
                    Image(systemName: icon)
                        .font(.system(size: 15))
                }

                Text(title)
                    .font(.system(size: 15, weight: .medium))
            }
            .foregroundColor(.secondary)
            .padding(.vertical, 12)
            .padding(.horizontal, 20)
            .background(
                Capsule()
                    .fill(Color(.secondarySystemBackground))
            )
            .scaleEffect(isPressed ? 0.95 : 1)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isPressed)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in isPressed = true }
                .onEnded { _ in isPressed = false }
        )
    }
}

// MARK: - Skip Button

struct SkipButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: {
            HapticFeedback.light.trigger()
            action()
        }) {
            Text("Passer")
                .font(.system(size: 15))
                .foregroundColor(.secondary)
                .padding(.vertical, 8)
                .padding(.horizontal, 16)
        }
    }
}

// MARK: - Back Button

struct OnboardingBackButton: View {
    let action: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: {
            HapticFeedback.light.trigger()
            action()
        }) {
            HStack(spacing: 6) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                Text("Retour")
                    .font(.system(size: 16))
            }
            .foregroundColor(.secondary)
            .scaleEffect(isPressed ? 0.95 : 1)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isPressed)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in isPressed = true }
                .onEnded { _ in isPressed = false }
        )
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 20) {
        ShimmerButton(
            title: "Continuer",
            accentColor: .blue,
            isEnabled: true
        ) {
            print("Tapped!")
        }

        ShimmerButton(
            title: "Continuer",
            accentColor: .purple,
            isEnabled: false
        ) {}

        ShimmerButton(
            title: "Création...",
            accentColor: .green,
            isEnabled: true,
            isLoading: true
        ) {}

        HStack {
            OnboardingBackButton {
                print("Back")
            }
            Spacer()
            SkipButton {
                print("Skip")
            }
        }

        OnboardingSecondaryButton(
            title: "Vérifier plus tard",
            icon: "clock"
        ) {
            print("Secondary")
        }
    }
    .padding()
}
