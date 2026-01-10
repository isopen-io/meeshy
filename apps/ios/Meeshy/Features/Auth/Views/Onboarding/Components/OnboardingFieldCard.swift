//
//  OnboardingFieldCard.swift
//  Meeshy
//
//  Stylized card for form fields with explanation bubbles
//  Features bouncy animations and playful design
//

import SwiftUI
import UIKit

struct OnboardingFieldCard<Content: View>: View {
    let explanation: RegistrationFieldExplanation
    let accentColor: Color
    let content: Content
    let showExplanation: Bool
    let delay: Double

    @State private var isExpanded = false
    @State private var appeared = false

    init(
        explanation: RegistrationFieldExplanation,
        accentColor: Color = .blue,
        showExplanation: Bool = true,
        delay: Double = 0,
        @ViewBuilder content: () -> Content
    ) {
        self.explanation = explanation
        self.accentColor = accentColor
        self.showExplanation = showExplanation
        self.delay = delay
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header with icon and title
            HStack(spacing: 10) {
                Text(explanation.icon)
                    .font(.title2)

                Text(explanation.title)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.primary)

                Spacer()

                // Info button
                if showExplanation {
                    Button(action: {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                            isExpanded.toggle()
                        }
                        HapticFeedback.light.trigger()
                    }) {
                        Image(systemName: isExpanded ? "info.circle.fill" : "info.circle")
                            .font(.system(size: 20))
                            .foregroundColor(accentColor)
                            .rotationEffect(.degrees(isExpanded ? 180 : 0))
                    }
                }
            }

            // Explanation bubble
            if isExpanded && showExplanation {
                OnboardingInfoBubble(
                    explanation: explanation,
                    accentColor: accentColor
                )
                .transition(.asymmetric(
                    insertion: .scale(scale: 0.8).combined(with: .opacity).combined(with: .move(edge: .top)),
                    removal: .scale(scale: 0.8).combined(with: .opacity)
                ))
            }

            // Content (text field, picker, etc.)
            content
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(Color(.systemBackground))
                .shadow(
                    color: accentColor.opacity(0.15),
                    radius: 10,
                    x: 0,
                    y: 4
                )
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(
                    LinearGradient(
                        colors: [accentColor.opacity(0.3), accentColor.opacity(0.1)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
        .scaleEffect(appeared ? 1 : 0.8)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.7).delay(delay)) {
                appeared = true
            }
        }
    }
}

// MARK: - Onboarding Text Field

struct OnboardingTextField: View {
    let placeholder: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .words
    var isSecure: Bool = false
    var errorMessage: String? = nil
    var trailingView: AnyView? = nil

    @FocusState private var isFocused: Bool
    @State private var showPassword = false

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                if isSecure && !showPassword {
                    SecureField(placeholder, text: $text)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($isFocused)
                } else {
                    TextField(placeholder, text: $text)
                        .keyboardType(keyboardType)
                        .textInputAutocapitalization(autocapitalization)
                        .autocorrectionDisabled()
                        .focused($isFocused)
                }

                if isSecure {
                    Button(action: {
                        showPassword.toggle()
                        HapticFeedback.light.trigger()
                    }) {
                        Image(systemName: showPassword ? "eye.slash.fill" : "eye.fill")
                            .foregroundColor(.gray)
                    }
                }

                if let trailing = trailingView {
                    trailing
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.secondarySystemBackground))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(
                        errorMessage != nil ? Color.red :
                            (isFocused ? Color.blue : Color.clear),
                        lineWidth: 2
                    )
            )
            .animation(.easeInOut(duration: 0.2), value: isFocused)

            // Error message
            if let error = errorMessage {
                HStack(spacing: 4) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.system(size: 12))
                    Text(error)
                        .font(.system(size: 12))
                }
                .foregroundColor(.red)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }
}

// MARK: - Username Status View

struct UsernameStatusView: View {
    let isChecking: Bool
    let isAvailable: Bool?

    var body: some View {
        Group {
            if isChecking {
                ProgressView()
                    .scaleEffect(0.8)
            } else if let available = isAvailable {
                Image(systemName: available ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .foregroundColor(available ? .green : .red)
                    .transition(.scale.combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isChecking)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isAvailable)
    }
}

// MARK: - Preview

#Preview {
    ScrollView {
        VStack(spacing: 20) {
            OnboardingFieldCard(
                explanation: .firstName,
                accentColor: .blue,
                delay: 0
            ) {
                OnboardingTextField(
                    placeholder: "Jean-Pierre",
                    text: .constant(""),
                    autocapitalization: .words
                )
            }

            OnboardingFieldCard(
                explanation: .password,
                accentColor: .purple,
                delay: 0.1
            ) {
                OnboardingTextField(
                    placeholder: "••••••••",
                    text: .constant(""),
                    isSecure: true
                )
            }

            OnboardingFieldCard(
                explanation: .username,
                accentColor: .blue,
                delay: 0.2
            ) {
                OnboardingTextField(
                    placeholder: "@username",
                    text: .constant("jean_pierre"),
                    autocapitalization: .never,
                    trailingView: AnyView(
                        UsernameStatusView(isChecking: false, isAvailable: true)
                    )
                )
            }
        }
        .padding()
    }
}
