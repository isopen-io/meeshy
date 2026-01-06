//
//  ButtonStyles.swift
//  Meeshy
//
//  Shared button styles for the Meeshy design system
//  iOS 16+
//

import SwiftUI

// MARK: - Quick Reactions Configuration

/// Common quick reaction emojis used across the app
struct QuickReactionsConfig {
    static let defaultEmojis = ["❤️", "👍", "😂", "😮", "😢", "🙏"]
    static let extendedEmojis = ["❤️", "👍", "😂", "😮", "😢", "🙏", "🔥", "👏", "🎉"]
}

// MARK: - Scale Button Style

/// A configurable button style that scales on press with spring animation
/// Used for emoji reactions, quick actions, and interactive elements
struct MeeshyScaleButtonStyle: ButtonStyle {
    /// Scale factor when pressed (default: 1.2)
    let pressedScale: CGFloat

    /// Spring response time (default: 0.2)
    let springResponse: Double

    /// Spring damping fraction (default: 0.6)
    let springDamping: Double

    init(
        pressedScale: CGFloat = 1.2,
        springResponse: Double = 0.2,
        springDamping: Double = 0.6
    ) {
        self.pressedScale = pressedScale
        self.springResponse = springResponse
        self.springDamping = springDamping
    }

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? pressedScale : 1.0)
            .animation(
                .spring(response: springResponse, dampingFraction: springDamping),
                value: configuration.isPressed
            )
    }
}

// MARK: - Preset Scale Styles (accessible via .buttonStyle(.reaction))

extension ButtonStyle where Self == MeeshyScaleButtonStyle {
    /// Standard reaction style (scale: 1.2)
    static var reaction: MeeshyScaleButtonStyle {
        MeeshyScaleButtonStyle(pressedScale: 1.2)
    }

    /// Emoji picker style (scale: 1.25)
    static var emoji: MeeshyScaleButtonStyle {
        MeeshyScaleButtonStyle(pressedScale: 1.25)
    }

    /// Large reaction style (scale: 1.3)
    static var largeReaction: MeeshyScaleButtonStyle {
        MeeshyScaleButtonStyle(pressedScale: 1.3)
    }

    /// Subtle press style (scale: 0.95)
    static var subtle: MeeshyScaleButtonStyle {
        MeeshyScaleButtonStyle(pressedScale: 0.95)
    }

    /// Bounce style with higher damping
    static var bounce: MeeshyScaleButtonStyle {
        MeeshyScaleButtonStyle(
            pressedScale: 1.15,
            springResponse: 0.25,
            springDamping: 0.5
        )
    }
}

// MARK: - View Extension for Convenience

extension View {
    /// Apply the Meeshy scale button style with default settings
    func meeshyScaleButton(scale: CGFloat = 1.2) -> some View {
        self.buttonStyle(MeeshyScaleButtonStyle(pressedScale: scale))
    }
}

// MARK: - Preview

#Preview("Scale Button Styles") {
    VStack(spacing: 24) {
        Text("Meeshy Button Styles")
            .font(.headline)

        HStack(spacing: 16) {
            Button("Reaction") {}
                .buttonStyle(.reaction)

            Button("Emoji") {}
                .buttonStyle(.emoji)

            Button("Large") {}
                .buttonStyle(.largeReaction)
        }
        .padding()
        .background(Color(.systemGray6))
        .cornerRadius(12)

        HStack(spacing: 12) {
            ForEach(["❤️", "👍", "😂", "😮", "😢", "🙏"], id: \.self) { emoji in
                Button {
                    print("Tapped \(emoji)")
                } label: {
                    Text(emoji)
                        .font(.system(size: 32))
                        .frame(width: 50, height: 50)
                        .background(Circle().fill(Color(.systemGray6)))
                }
                .buttonStyle(.reaction)
            }
        }
    }
    .padding()
}
