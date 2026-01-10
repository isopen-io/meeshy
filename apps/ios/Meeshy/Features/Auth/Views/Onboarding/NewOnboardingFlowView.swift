//
//  NewOnboardingFlowView.swift
//  Meeshy
//
//  v4 - Vue principale du flux d'inscription avec 8 étapes
//  Design semi-transparent avec animations et style Meeshy
//

import SwiftUI

struct NewOnboardingFlowView: View {
    @StateObject private var viewModel = NewRegistrationViewModel()
    @Environment(\.dismiss) private var dismiss

    var onComplete: (() -> Void)?

    @State private var keyboardHeight: CGFloat = 0

    var body: some View {
        ZStack {
            // Background with gradient
            backgroundView

            // Main content
            VStack(spacing: 0) {
                // Top bar
                topBar

                // Interactive progress bar (8 steps) with grow effect
                InteractiveProgressBar(
                    currentStep: viewModel.currentStep,
                    onStepTapped: { step in
                        if step.rawValue <= viewModel.currentStep.rawValue {
                            viewModel.goToStep(step)
                        }
                    }
                )
                .padding(.horizontal, 16)
                .padding(.top, 8)

                // Step header
                stepHeader
                    .padding(.horizontal, 20)
                    .padding(.top, 16)

                // Page content with swipe
                TabView(selection: $viewModel.currentStep) {
                    StepPseudoView(viewModel: viewModel)
                        .tag(NewRegistrationStep.pseudo)

                    StepPhoneView(viewModel: viewModel)
                        .tag(NewRegistrationStep.phone)

                    StepEmailView(viewModel: viewModel)
                        .tag(NewRegistrationStep.email)

                    StepIdentityView(viewModel: viewModel)
                        .tag(NewRegistrationStep.identity)

                    StepPasswordView(viewModel: viewModel)
                        .tag(NewRegistrationStep.password)

                    StepLanguageView(viewModel: viewModel)
                        .tag(NewRegistrationStep.language)

                    StepProfileView(viewModel: viewModel)
                        .tag(NewRegistrationStep.profile)

                    StepCompleteView(viewModel: viewModel)
                        .tag(NewRegistrationStep.complete)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.spring(response: 0.5, dampingFraction: 0.85), value: viewModel.currentStep)

                // Bottom bar
                bottomBar
                    .padding(.bottom, keyboardHeight > 0 ? 0 : 16)
            }
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .onAppear { setupKeyboardObserver() }
        .onChange(of: viewModel.registrationComplete) { _, completed in
            if completed {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                    onComplete?()
                    dismiss()
                }
            }
        }
        .alert("Erreur", isPresented: $viewModel.showError) {
            Button("OK") { }
        } message: {
            Text(viewModel.errorMessage ?? "Une erreur est survenue")
        }
    }

    // MARK: - Background View

    private var backgroundView: some View {
        ZStack {
            // Base gradient avec couleur de l'étape
            LinearGradient(
                colors: [
                    viewModel.currentStep.accentColor.opacity(0.2),
                    Color(.systemBackground).opacity(0.98)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .animation(.easeInOut(duration: 0.6), value: viewModel.currentStep)

            // Cercles décoratifs
            GeometryReader { geo in
                Circle()
                    .fill(viewModel.currentStep.accentColor.opacity(0.12))
                    .frame(width: 280, height: 280)
                    .blur(radius: 50)
                    .offset(x: -80, y: -30)

                Circle()
                    .fill(viewModel.currentStep.accentColor.opacity(0.08))
                    .frame(width: 200, height: 200)
                    .blur(radius: 40)
                    .offset(x: geo.size.width - 80, y: geo.size.height - 250)
            }
        }
        .ignoresSafeArea()
    }

    // MARK: - Top Bar

    private var topBar: some View {
        HStack {
            if viewModel.currentStep != .pseudo {
                Button(action: {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        viewModel.previousStep()
                    }
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 15, weight: .semibold))
                        Text("Retour")
                            .font(.system(size: 14, weight: .medium))
                    }
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(
                        Capsule()
                            .fill(Color(.systemGray6).opacity(0.9))
                    )
                }
            } else {
                Button(action: {
                    dismiss()
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }) {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.secondary)
                        .frame(width: 38, height: 38)
                        .background(
                            Circle()
                                .fill(Color(.systemGray6).opacity(0.9))
                        )
                }
            }

            Spacer()

            // Step icon
            Image(systemName: viewModel.currentStep.iconName)
                .font(.system(size: 20, weight: .medium))
                .foregroundColor(viewModel.currentStep.accentColor)

            // Step indicator
            Text("\(viewModel.currentStep.rawValue + 1)/8")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(Color(.systemGray6).opacity(0.9))
                )
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // MARK: - Step Header

    private var stepHeader: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(viewModel.currentStep.funHeader)
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .foregroundColor(.primary)

            Text(viewModel.currentStep.funSubtitle)
                .font(.system(size: 14, weight: .regular))
                .foregroundColor(.secondary)
                .lineLimit(3)
                .fixedSize(horizontal: false, vertical: true)

            // Citation motivationnelle
            Text(viewModel.currentStep.motivationalQuote)
                .font(.system(size: 12, weight: .medium, design: .serif))
                .italic()
                .foregroundColor(.secondary.opacity(0.8))
                .padding(.top, 4)
        }
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        VStack(spacing: 10) {
            // Bouton principal
            GlowingButton(
                title: buttonTitle,
                icon: buttonIcon,
                accentColor: viewModel.currentStep.accentColor,
                isEnabled: viewModel.canProceed && !viewModel.isLoading,
                isLoading: viewModel.isLoading
            ) {
                if viewModel.currentStep == .complete {
                    Task { await viewModel.register() }
                } else {
                    viewModel.nextStep()
                }
            }

            // Skip pour le profil (optionnel)
            if viewModel.currentStep == .profile {
                Button(action: { viewModel.nextStep() }) {
                    Text("Passer cette étape")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.secondary)
                }
                .padding(.top, 4)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(
            Rectangle()
                .fill(Color(.systemBackground).opacity(0.95))
                .shadow(color: .black.opacity(0.05), radius: 10, y: -5)
        )
    }

    private var buttonTitle: String {
        switch viewModel.currentStep {
        case .complete:
            return viewModel.registrationComplete ? "On est ensemble!" : "Créer mon compte"
        case .profile:
            return "Continuer"
        default:
            return "C'est bon, suivant!"
        }
    }

    private var buttonIcon: String? {
        switch viewModel.currentStep {
        case .complete:
            return viewModel.registrationComplete ? "checkmark.seal.fill" : "sparkles"
        default:
            return "arrow.right"
        }
    }

    // MARK: - Keyboard

    private func setupKeyboardObserver() {
        NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardWillShowNotification,
            object: nil, queue: .main
        ) { notification in
            if let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect {
                withAnimation(.easeOut(duration: 0.25)) {
                    keyboardHeight = frame.height
                }
            }
        }
        NotificationCenter.default.addObserver(
            forName: UIResponder.keyboardWillHideNotification,
            object: nil, queue: .main
        ) { _ in
            withAnimation(.easeOut(duration: 0.25)) {
                keyboardHeight = 0
            }
        }
    }
}

// MARK: - Interactive Progress Bar (8 steps with grow effect)

struct InteractiveProgressBar: View {
    let currentStep: NewRegistrationStep
    let onStepTapped: (NewRegistrationStep) -> Void

    @State private var pressedStep: NewRegistrationStep?

    var body: some View {
        HStack(spacing: 4) {
            ForEach(NewRegistrationStep.allCases) { step in
                Button(action: {
                    onStepTapped(step)
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                }) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(stepColor(for: step))
                        .frame(height: stepHeight(for: step))
                        .overlay(
                            RoundedRectangle(cornerRadius: 3)
                                .stroke(step == currentStep ? step.accentColor : .clear, lineWidth: 1.5)
                        )
                        .scaleEffect(y: scaleEffect(for: step))
                        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: pressedStep)
                        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: currentStep)
                }
                .disabled(step.rawValue > currentStep.rawValue)
                .simultaneousGesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { _ in
                            if step.rawValue <= currentStep.rawValue {
                                pressedStep = step
                            }
                        }
                        .onEnded { _ in
                            pressedStep = nil
                        }
                )
            }
        }
    }

    private func stepColor(for step: NewRegistrationStep) -> Color {
        if step.rawValue < currentStep.rawValue {
            return step.accentColor
        } else if step == currentStep {
            return step.accentColor.opacity(0.6)
        } else {
            return Color(.systemGray4)
        }
    }

    private func stepHeight(for step: NewRegistrationStep) -> CGFloat {
        if step == currentStep || step == pressedStep {
            return 8
        }
        return 5
    }

    private func scaleEffect(for step: NewRegistrationStep) -> CGFloat {
        if step == pressedStep {
            return 1.4
        } else if step == currentStep {
            return 1.2
        }
        return 1.0
    }
}

// MARK: - Glowing Button

struct GlowingButton: View {
    let title: String
    var icon: String? = nil
    let accentColor: Color
    let isEnabled: Bool
    var isLoading: Bool = false
    let action: () -> Void

    @State private var isPressed = false

    var body: some View {
        Button(action: {
            guard isEnabled && !isLoading else { return }
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            action()
        }) {
            HStack(spacing: 8) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.85)
                } else {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                    if let icon = icon {
                        Image(systemName: icon)
                            .font(.system(size: 15, weight: .semibold))
                    }
                }
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                ZStack {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(
                            LinearGradient(
                                colors: isEnabled ? [accentColor, accentColor.opacity(0.85)] : [.gray.opacity(0.5), .gray.opacity(0.4)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                    if isEnabled && !isLoading {
                        RoundedRectangle(cornerRadius: 14)
                            .fill(accentColor)
                            .blur(radius: 12)
                            .opacity(isPressed ? 0.5 : 0.25)
                            .offset(y: 4)
                    }
                }
            )
            .scaleEffect(isPressed ? 0.98 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isPressed)
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(!isEnabled || isLoading)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in isPressed = true }
                .onEnded { _ in isPressed = false }
        )
    }
}

// MARK: - Preview

#Preview {
    NewOnboardingFlowView()
}
