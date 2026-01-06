//
//  TypingIndicatorView.swift
//  Meeshy
//
//  Animated typing indicator showing who is typing
//  iOS 16+
//

import SwiftUI

struct TypingIndicatorView: View {
    // MARK: - Properties

    let users: [String]

    @State private var animationPhase = 0

    // MEMORY FIX: Store timer reference to properly invalidate on disappear
    @State private var animationTimer: Timer?

    // MARK: - Body

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            // Avatar (if single user)
            if users.count == 1 {
                Circle()
                    .fill(Color.blue.gradient)
                    .frame(width: 32, height: 32)
                    .overlay(
                        Text(users[0].prefix(1).uppercased())
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white)
                    )
            }

            // Typing Bubble
            HStack(spacing: 12) {
                // Typing Text
                Text(typingText)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.secondary)

                // Animated Dots
                animatedDots
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(.systemGray5))
            )

            Spacer()
        }
        .transition(.opacity.combined(with: .move(edge: .leading)))
        .animation(.easeInOut, value: users)
    }

    // MARK: - Animated Dots

    private var animatedDots: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(Color.secondary)
                    .frame(width: 6, height: 6)
                    .scaleEffect(animationPhase == index ? 1.2 : 0.8)
                    .opacity(animationPhase == index ? 1.0 : 0.5)
                    .animation(
                        .easeInOut(duration: 0.6)
                            .repeatForever(autoreverses: false)
                            .delay(Double(index) * 0.2),
                        value: animationPhase
                    )
            }
        }
        .onAppear {
            startAnimation()
        }
        // MEMORY FIX: Invalidate timer when view disappears
        .onDisappear {
            animationTimer?.invalidate()
            animationTimer = nil
        }
    }

    // MARK: - Typing Text

    private var typingText: String {
        if users.isEmpty {
            return "Someone is typing"
        } else if users.count == 1 {
            return "\(users[0]) is typing"
        } else if users.count == 2 {
            return "\(users[0]) and \(users[1]) are typing"
        } else if users.count == 3 {
            return "\(users[0]), \(users[1]), and \(users[2]) are typing"
        } else {
            return "\(users[0]), \(users[1]), and \(users.count - 2) others are typing"
        }
    }

    // MARK: - Animation

    private func startAnimation() {
        // MEMORY FIX: Invalidate any existing timer before creating new one
        animationTimer?.invalidate()

        // MEMORY FIX: Store timer reference for cleanup on disappear
        animationTimer = Timer.scheduledTimer(withTimeInterval: 0.6, repeats: true) { _ in
            animationPhase = (animationPhase + 1) % 3
        }
    }
}

// MARK: - Alternative Bubble Style Typing Indicator

struct BubbleTypingIndicatorView: View {
    @State private var animationPhase = 0

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            // Avatar
            Circle()
                .fill(Color.blue.gradient)
                .frame(width: 32, height: 32)

            // Typing Bubble
            HStack(spacing: 6) {
                ForEach(0..<3) { index in
                    Circle()
                        .fill(Color.white)
                        .frame(width: 8, height: 8)
                        .offset(y: animationPhase == index ? -4 : 0)
                        .animation(
                            .easeInOut(duration: 0.5)
                                .repeatForever(autoreverses: true)
                                .delay(Double(index) * 0.15),
                            value: animationPhase
                        )
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color(.systemGray4))
            )

            Spacer()
        }
        .padding(.horizontal, 16)
        .onAppear {
            animationPhase = 1
        }
    }
}

// MARK: - Minimal Typing Indicator

struct MinimalTypingIndicatorView: View {
    @State private var opacity: Double = 0.3

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "ellipsis")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.blue)
                .opacity(opacity)

            Text("typing...")
                .font(.system(size: 14))
                .foregroundColor(.secondary)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) {
                opacity = 1.0
            }
        }
    }
}

// MARK: - Preview

// Preview removed
