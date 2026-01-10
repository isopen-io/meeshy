//
//  ModernBubbleShape.swift
//  Meeshy
//
//  Modern message bubble shapes with dynamic corners and effects
//  iOS 16+
//

import SwiftUI

// MARK: - Modern Bubble Shape

/// Custom shape for message bubbles with dynamic corner radius
struct ModernBubbleShape: Shape {
    let isOwnMessage: Bool
    let hasReactions: Bool
    let cornerRadius: CGFloat

    func path(in rect: CGRect) -> Path {
        var path = Path()

        let tailSize: CGFloat = 8

        if isOwnMessage {
            // Own message - tail on bottom right
            path.move(to: CGPoint(x: rect.minX + cornerRadius, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX - cornerRadius, y: rect.minY))
            path.addQuadCurve(
                to: CGPoint(x: rect.maxX, y: rect.minY + cornerRadius),
                control: CGPoint(x: rect.maxX, y: rect.minY)
            )
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - cornerRadius - tailSize))

            // Bottom right corner with tail
            if !hasReactions {
                path.addQuadCurve(
                    to: CGPoint(x: rect.maxX - cornerRadius, y: rect.maxY - tailSize),
                    control: CGPoint(x: rect.maxX, y: rect.maxY - tailSize)
                )
                path.addLine(to: CGPoint(x: rect.maxX - cornerRadius + tailSize, y: rect.maxY - tailSize))
                path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
                path.addLine(to: CGPoint(x: rect.maxX - cornerRadius, y: rect.maxY - tailSize))
            } else {
                // No tail if has reactions (reactions go below)
                path.addQuadCurve(
                    to: CGPoint(x: rect.maxX - cornerRadius, y: rect.maxY),
                    control: CGPoint(x: rect.maxX, y: rect.maxY)
                )
            }

            path.addLine(to: CGPoint(x: rect.minX + cornerRadius, y: rect.maxY))
            path.addQuadCurve(
                to: CGPoint(x: rect.minX, y: rect.maxY - cornerRadius),
                control: CGPoint(x: rect.minX, y: rect.maxY)
            )
            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + cornerRadius))
            path.addQuadCurve(
                to: CGPoint(x: rect.minX + cornerRadius, y: rect.minY),
                control: CGPoint(x: rect.minX, y: rect.minY)
            )
        } else {
            // Received message - tail on bottom left
            path.move(to: CGPoint(x: rect.minX + cornerRadius, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.maxX - cornerRadius, y: rect.minY))
            path.addQuadCurve(
                to: CGPoint(x: rect.maxX, y: rect.minY + cornerRadius),
                control: CGPoint(x: rect.maxX, y: rect.minY)
            )
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - cornerRadius))
            path.addQuadCurve(
                to: CGPoint(x: rect.maxX - cornerRadius, y: rect.maxY),
                control: CGPoint(x: rect.maxX, y: rect.maxY)
            )
            path.addLine(to: CGPoint(x: rect.minX + cornerRadius, y: rect.maxY))

            // Bottom left corner with tail
            if !hasReactions {
                path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
                path.addLine(to: CGPoint(x: rect.minX + cornerRadius - tailSize, y: rect.maxY - tailSize))
                path.addLine(to: CGPoint(x: rect.minX + cornerRadius, y: rect.maxY - tailSize))
                path.addQuadCurve(
                    to: CGPoint(x: rect.minX, y: rect.maxY - cornerRadius - tailSize),
                    control: CGPoint(x: rect.minX, y: rect.maxY - tailSize)
                )
            } else {
                path.addQuadCurve(
                    to: CGPoint(x: rect.minX, y: rect.maxY - cornerRadius),
                    control: CGPoint(x: rect.minX, y: rect.maxY)
                )
            }

            path.addLine(to: CGPoint(x: rect.minX, y: rect.minY + cornerRadius))
            path.addQuadCurve(
                to: CGPoint(x: rect.minX + cornerRadius, y: rect.minY),
                control: CGPoint(x: rect.minX, y: rect.minY)
            )
        }

        return path
    }
}

// MARK: - Bubble Background Modifier

struct BubbleBackgroundModifier: ViewModifier {
    let config: BubbleStyleConfig
    let isOwnMessage: Bool
    let hasReactions: Bool
    @State private var isPressed = false

    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                ZStack {
                    // Base gradient background
                    ModernBubbleShape(
                        isOwnMessage: isOwnMessage,
                        hasReactions: hasReactions,
                        cornerRadius: 20
                    )
                    .fill(
                        LinearGradient(
                            colors: [
                                config.baseColor.opacity(config.opacity),
                                config.accentColor.opacity(config.opacity * 0.9)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .shadow(
                        color: config.shadowColor,
                        radius: config.shadowRadius,
                        x: 0,
                        y: 2
                    )

                    // Subtle border
                    ModernBubbleShape(
                        isOwnMessage: isOwnMessage,
                        hasReactions: hasReactions,
                        cornerRadius: 20
                    )
                    .stroke(
                        config.baseColor.opacity(0.3),
                        lineWidth: 0.5
                    )

                    // Shimmer overlay (top third only)
                    if config.glowIntensity > 0 {
                        ModernBubbleShape(
                            isOwnMessage: isOwnMessage,
                            hasReactions: hasReactions,
                            cornerRadius: 20
                        )
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color.white.opacity(config.glowIntensity),
                                    Color.clear
                                ],
                                startPoint: .top,
                                endPoint: .center
                            )
                        )
                    }

                    // Press overlay
                    if isPressed {
                        ModernBubbleShape(
                            isOwnMessage: isOwnMessage,
                            hasReactions: hasReactions,
                            cornerRadius: 20
                        )
                        .fill(Color.bubbleOverlay)
                    }
                }
            )
    }
}

// MARK: - View Extension

extension View {
    func modernBubbleBackground(
        config: BubbleStyleConfig,
        isOwnMessage: Bool,
        hasReactions: Bool = false
    ) -> some View {
        modifier(
            BubbleBackgroundModifier(
                config: config,
                isOwnMessage: isOwnMessage,
                hasReactions: hasReactions
            )
        )
    }
}

// MARK: - Animated Shimmer Effect

struct ShimmerEffect: ViewModifier {
    @State private var animateShimmer = false

    func body(content: Content) -> some View {
        content
            .overlay(
                Rectangle()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.clear,
                                Color.bubbleShimmer,
                                Color.clear
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .rotationEffect(.degrees(30))
                    .offset(x: animateShimmer ? 300 : -300)
                    .mask(content)
            )
            .onAppear {
                withAnimation(
                    .linear(duration: 2.5)
                    .repeatForever(autoreverses: false)
                ) {
                    animateShimmer = true
                }
            }
    }
}

extension View {
    func shimmerEffect() -> some View {
        modifier(ShimmerEffect())
    }
}
