//
//  OnboardingProgressBar.swift
//  Meeshy
//
//  Animated progress bar for onboarding flow
//  Shows current step with playful animations
//

import SwiftUI

struct OnboardingProgressBar: View {
    let currentStep: RegistrationStep
    let totalSteps: Int

    @State private var animatedProgress: CGFloat = 0

    private var progress: CGFloat {
        CGFloat(currentStep.rawValue + 1) / CGFloat(totalSteps)
    }

    var body: some View {
        VStack(spacing: 12) {
            // Step indicators
            HStack(spacing: 8) {
                ForEach(RegistrationStep.allCases, id: \.rawValue) { step in
                    StepIndicator(
                        step: step,
                        isCurrentOrPast: step.rawValue <= currentStep.rawValue,
                        isCurrent: step == currentStep
                    )
                }
            }

            // Progress bar
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    // Background
                    Capsule()
                        .fill(Color.gray.opacity(0.2))
                        .frame(height: 6)

                    // Progress with gradient
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [
                                    currentStep.accentColor,
                                    currentStep.accentColor.opacity(0.7)
                                ],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geometry.size.width * animatedProgress, height: 6)

                    // Sparkle on current position
                    Circle()
                        .fill(Color.white)
                        .frame(width: 10, height: 10)
                        .shadow(color: currentStep.accentColor, radius: 4)
                        .offset(x: (geometry.size.width * animatedProgress) - 5)
                        .opacity(animatedProgress > 0 ? 1 : 0)
                }
            }
            .frame(height: 10)
        }
        .padding(.horizontal)
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
                animatedProgress = progress
            }
        }
        .onChange(of: currentStep) { _ in
            withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
                animatedProgress = progress
            }
        }
    }
}

// MARK: - Step Indicator

struct StepIndicator: View {
    let step: RegistrationStep
    let isCurrentOrPast: Bool
    let isCurrent: Bool

    @State private var scale: CGFloat = 0.8
    @State private var rotation: Double = -10

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                // Background circle
                Circle()
                    .fill(isCurrentOrPast ? step.accentColor : Color.gray.opacity(0.3))
                    .frame(width: isCurrent ? 44 : 36, height: isCurrent ? 44 : 36)

                // Emoji
                Text(step.emoji)
                    .font(.system(size: isCurrent ? 20 : 16))
            }
            .scaleEffect(scale)
            .rotationEffect(.degrees(rotation))

            // Step label (only for current)
            if isCurrent {
                Text(step.title)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(step.accentColor)
            }
        }
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.6)) {
                scale = 1.0
                rotation = 0
            }
        }
        .onChange(of: isCurrent) { newValue in
            if newValue {
                // Bounce animation when becoming current
                withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
                    scale = 1.2
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                        scale = 1.0
                    }
                }
            }
        }
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 40) {
        OnboardingProgressBar(currentStep: .identity, totalSteps: 5)
        OnboardingProgressBar(currentStep: .contact, totalSteps: 5)
        OnboardingProgressBar(currentStep: .languages, totalSteps: 5)
        OnboardingProgressBar(currentStep: .profile, totalSteps: 5)
        OnboardingProgressBar(currentStep: .complete, totalSteps: 5)
    }
    .padding()
}
