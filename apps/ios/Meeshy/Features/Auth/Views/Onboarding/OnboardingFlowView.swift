//
//  OnboardingFlowView.swift
//  Meeshy
//
//  Main coordinator for the 5-step onboarding flow
//  Manages navigation, progress, and completion
//

import SwiftUI

struct OnboardingFlowView: View {
    @StateObject private var viewModel = RegistrationFlowViewModel()
    @Environment(\.dismiss) private var dismiss

    var onComplete: (() -> Void)?

    @State private var keyboardHeight: CGFloat = 0

    var body: some View {
        ZStack {
            // Background gradient
            backgroundGradient

            VStack(spacing: 0) {
                // Top navigation bar
                topBar

                // Progress bar
                OnboardingProgressBar(
                    currentStep: viewModel.currentStep,
                    totalSteps: RegistrationStep.allCases.count
                )
                .padding(.horizontal)
                .padding(.top, 8)

                // Step content
                TabView(selection: $viewModel.currentStep) {
                    OnboardingStep1IdentityView(viewModel: viewModel)
                        .tag(RegistrationStep.identity)

                    OnboardingStep2ContactView(viewModel: viewModel)
                        .tag(RegistrationStep.contact)

                    OnboardingStep3LanguagesView(viewModel: viewModel)
                        .tag(RegistrationStep.languages)

                    OnboardingStep4ProfileView(viewModel: viewModel)
                        .tag(RegistrationStep.profile)

                    OnboardingStep5CompleteView(viewModel: viewModel)
                        .tag(RegistrationStep.complete)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.spring(response: 0.5, dampingFraction: 0.8), value: viewModel.currentStep)

                // Bottom action bar
                bottomBar
                    .padding(.bottom, keyboardHeight > 0 ? 0 : 16)
            }
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .onAppear {
            setupKeyboardObserver()
        }
    }

    // MARK: - Background Gradient

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [
                (Color(hex: "E8D5F2") ?? .purple).opacity(0.3),
                (Color(hex: "FCE4EC") ?? .pink).opacity(0.3),
                Color(.systemBackground)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            // Back button (except on first step)
            if viewModel.currentStep != .identity {
                OnboardingBackButton {
                    viewModel.previousStep()
                }
            } else {
                // Close button on first step
                Button(action: {
                    dismiss()
                }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.secondary)
                        .frame(width: 44, height: 44)
                }
            }

            Spacer()

            // Skip button (on optional steps)
            if viewModel.currentStep == .profile {
                SkipButton {
                    viewModel.nextStep()
                }
            }
        }
        .padding(.horizontal)
        .padding(.top, 8)
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        VStack(spacing: 12) {
            // Continue / Complete button
            switch viewModel.currentStep {
            case .identity:
                ShimmerButton(
                    title: "Continuer",
                    accentColor: viewModel.currentStep.accentColor,
                    isEnabled: viewModel.canProceedFromStep1
                ) {
                    viewModel.nextStep()
                }

            case .contact:
                ShimmerButton(
                    title: "Continuer",
                    accentColor: viewModel.currentStep.accentColor,
                    isEnabled: viewModel.canProceedFromStep2
                ) {
                    viewModel.nextStep()
                }

            case .languages:
                ShimmerButton(
                    title: "Continuer",
                    accentColor: viewModel.currentStep.accentColor,
                    isEnabled: viewModel.canProceedFromStep3
                ) {
                    viewModel.nextStep()
                }

            case .profile:
                ShimmerButton(
                    title: "Continuer",
                    accentColor: viewModel.currentStep.accentColor,
                    isEnabled: viewModel.canProceedFromStep4
                ) {
                    viewModel.nextStep()
                }

            case .complete:
                if viewModel.showConfetti {
                    ShimmerButton(
                        title: "Commencer à chatter!",
                        icon: "message.fill",
                        accentColor: .green,
                        isEnabled: true
                    ) {
                        onComplete?()
                        dismiss()
                    }
                } else {
                    ShimmerButton(
                        title: "Créer mon compte",
                        icon: "sparkles",
                        accentColor: viewModel.currentStep.accentColor,
                        isEnabled: viewModel.canComplete,
                        isLoading: viewModel.isRegistering
                    ) {
                        Task {
                            let success = await viewModel.completeRegistration()
                            if success {
                                // Confetti will show, then user taps "Commencer"
                            }
                        }
                    }
                }
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 16)
        .background(
            Color(.systemBackground)
                .shadow(color: Color.black.opacity(0.05), radius: 10, y: -5)
        )
    }

    // MARK: - Keyboard Observer

    private func setupKeyboardObserver() {
        NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardWillShowNotification,
            object: nil,
            queue: .main
        ) { notification in
            if let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect {
                withAnimation(.easeOut(duration: 0.25)) {
                    keyboardHeight = frame.height
                }
            }
        }

        NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardWillHideNotification,
            object: nil,
            queue: .main
        ) { _ in
            withAnimation(.easeOut(duration: 0.25)) {
                keyboardHeight = 0
            }
        }
    }
}

// MARK: - Preview

#Preview {
    OnboardingFlowView()
}
