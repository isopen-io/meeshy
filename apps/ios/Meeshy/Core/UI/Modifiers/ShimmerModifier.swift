//
//  ShimmerModifier.swift
//  Meeshy
//
//  Shimmer effect modifier for loading states
//  iOS 16+
//

import SwiftUI

// MARK: - Shimmer View Modifier

struct ShimmerModifier: ViewModifier {
    @State private var phase: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .overlay(
                LinearGradient(
                    gradient: Gradient(colors: [
                        Color.white.opacity(0),
                        Color.white.opacity(0.3),
                        Color.white.opacity(0)
                    ]),
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .rotationEffect(.degrees(30))
                .offset(x: phase * 400 - 200)
                .mask(content)
            )
            .onAppear {
                withAnimation(
                    Animation
                        .linear(duration: 1.5)
                        .repeatForever(autoreverses: false)
                ) {
                    phase = 1
                }
            }
    }
}

// MARK: - View Extension

extension View {
    /// Adds a shimmer effect to the view
    /// - Returns: View with shimmer animation
    @available(iOS 16.0, *)
    func shimmer() -> some View {
        modifier(ShimmerModifier())
    }
}

// MARK: - Preview

#if DEBUG
struct ShimmerPreview: View {
    var body: some View {
        VStack(spacing: 20) {
            // Rectangle placeholder
            RoundedRectangle(cornerRadius: 8)
                .fill(Color.gray.opacity(0.3))
                .frame(height: 100)
                .shimmer()

            // Circle placeholder
            Circle()
                .fill(Color.gray.opacity(0.3))
                .frame(width: 80, height: 80)
                .shimmer()

            // Text-like placeholders
            VStack(alignment: .leading, spacing: 12) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 200, height: 20)
                    .shimmer()

                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 150, height: 16)
                    .shimmer()

                RoundedRectangle(cornerRadius: 4)
                    .fill(Color.gray.opacity(0.3))
                    .frame(width: 250, height: 16)
                    .shimmer()
            }
        }
        .padding()
    }
}

#Preview("Shimmer Effect") {
    ShimmerPreview()
}
#endif