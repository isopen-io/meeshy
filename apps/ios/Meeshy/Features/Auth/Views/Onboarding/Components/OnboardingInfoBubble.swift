//
//  OnboardingInfoBubble.swift
//  Meeshy
//
//  Animated info bubble that explains field purpose
//  With Cameroonian humor and Meeshy-specific context
//

import SwiftUI

struct OnboardingInfoBubble: View {
    let explanation: RegistrationFieldExplanation
    let accentColor: Color

    @State private var appeared = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Main explanation
            HStack(alignment: .top, spacing: 10) {
                // Decorative quote mark
                Text("\"")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundColor(accentColor.opacity(0.3))

                Text(explanation.explanation)
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            // Tip if available
            if let tip = explanation.tip {
                HStack(spacing: 8) {
                    Image(systemName: "lightbulb.fill")
                        .font(.system(size: 12))
                        .foregroundColor(.yellow)

                    Text(tip)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(accentColor)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(accentColor.opacity(0.1))
                )
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(.systemBackground),
                            accentColor.opacity(0.05)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
        )
        .overlay(
            // Speech bubble pointer
            OnboardingTriangle()
                .fill(Color(.systemBackground))
                .frame(width: 16, height: 10)
                .rotationEffect(.degrees(180))
                .offset(y: -5)
                .shadow(color: accentColor.opacity(0.1), radius: 2, y: -1),
            alignment: .top
        )
        .scaleEffect(appeared ? 1 : 0.9)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                appeared = true
            }
        }
    }
}

// MARK: - Triangle Shape (renamed to avoid conflict)

struct OnboardingTriangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

// MARK: - Floating Info Tooltip

struct FloatingTooltip: View {
    let text: String
    let accentColor: Color
    @Binding var isShowing: Bool

    var body: some View {
        if isShowing {
            VStack(spacing: 0) {
                Text(text)
                    .font(.system(size: 13))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 10)
                            .fill(accentColor)
                    )

                OnboardingTriangle()
                    .fill(accentColor)
                    .frame(width: 12, height: 8)
            }
            .transition(.scale.combined(with: .opacity))
            .onTapGesture {
                withAnimation {
                    isShowing = false
                }
            }
        }
    }
}

// MARK: - Animated Explanation Row

struct AnimatedExplanationRow: View {
    let icon: String
    let text: String
    let delay: Double
    let accentColor: Color

    @State private var appeared = false

    var body: some View {
        HStack(spacing: 12) {
            Text(icon)
                .font(.system(size: 20))
                .frame(width: 32, height: 32)
                .background(
                    Circle()
                        .fill(accentColor.opacity(0.15))
                )

            Text(text)
                .font(.system(size: 14))
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.secondarySystemBackground))
        )
        .offset(x: appeared ? 0 : -30)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7).delay(delay)) {
                appeared = true
            }
        }
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 30) {
        OnboardingInfoBubble(
            explanation: .firstName,
            accentColor: .blue
        )

        OnboardingInfoBubble(
            explanation: .password,
            accentColor: .purple
        )

        AnimatedExplanationRow(
            icon: "💡",
            text: "Meeshy traduit automatiquement vos messages!",
            delay: 0,
            accentColor: .green
        )
    }
    .padding()
}
