//
//  OnboardingFlowView.swift
//  Meeshy
//
//  v5 - Vue principale du flux d'inscription avec 8 étapes
//  Design semi-transparent avec ANIMATIONS PLEIN ÉCRAN et style Meeshy
//

import SwiftUI

struct OnboardingFlowView: View {
    @StateObject private var viewModel = RegistrationViewModel()
    @Environment(\.dismiss) private var dismiss

    var onComplete: (() -> Void)?

    @State private var keyboardHeight: CGFloat = 0

    var body: some View {
        ZStack {
            // ANIMATED Background - PLEIN ÉCRAN
            AnimatedStepBackground(step: viewModel.currentStep)

            // Main content with barely perceptible transparency
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

                // Page content with swipe - QUASI OPAQUE avec transparence à peine perceptible
                TabView(selection: $viewModel.currentStep) {
                    StepPseudoView(viewModel: viewModel)
                        .tag(RegistrationStep.pseudo)

                    StepPhoneView(viewModel: viewModel)
                        .tag(RegistrationStep.phone)

                    StepEmailView(viewModel: viewModel)
                        .tag(RegistrationStep.email)

                    StepIdentityView(viewModel: viewModel)
                        .tag(RegistrationStep.identity)

                    StepPasswordView(viewModel: viewModel)
                        .tag(RegistrationStep.password)

                    StepLanguageView(viewModel: viewModel)
                        .tag(RegistrationStep.language)

                    StepProfileView(viewModel: viewModel)
                        .tag(RegistrationStep.profile)

                    StepCompleteView(viewModel: viewModel)
                        .tag(RegistrationStep.complete)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.spring(response: 0.5, dampingFraction: 0.85), value: viewModel.currentStep)

                // Bottom bar
                bottomBar
                    .padding(.bottom, keyboardHeight > 0 ? 0 : 16)
            }
            .background(
                // Fond semi-transparent pour voir les animations (0.5)
                Color(.systemBackground)
                    .opacity(0.5)
                    .ignoresSafeArea()
            )
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
    let currentStep: RegistrationStep
    let onStepTapped: (RegistrationStep) -> Void

    @State private var pressedStep: RegistrationStep?

    var body: some View {
        HStack(spacing: 4) {
            ForEach(RegistrationStep.allCases) { step in
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

    private func stepColor(for step: RegistrationStep) -> Color {
        if step.rawValue < currentStep.rawValue {
            return step.accentColor
        } else if step == currentStep {
            return step.accentColor.opacity(0.6)
        } else {
            return Color(.systemGray4)
        }
    }

    private func stepHeight(for step: RegistrationStep) -> CGFloat {
        if step == currentStep || step == pressedStep {
            return 8
        }
        return 5
    }

    private func scaleEffect(for step: RegistrationStep) -> CGFloat {
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

// MARK: - Animated Step Background (Plein écran)

struct AnimatedStepBackground: View {
    let step: RegistrationStep

    @State private var animate = false
    @State private var wavePhase: CGFloat = 0

    var body: some View {
        GeometryReader { geo in
            ZStack {
                // Base gradient - PLUS TRANSPARENT
                LinearGradient(
                    colors: [
                        step.accentColor.opacity(0.08),
                        Color(.systemBackground).opacity(0.92),
                        step.accentColor.opacity(0.04)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                // Animation spécifique par étape - OPAQUE
                stepSpecificAnimation(in: geo.size)

                // Particules flottantes communes - OPAQUE
                floatingParticles(in: geo.size)

                // Vagues ondulantes en bas - OPAQUE
                wavesOverlay(in: geo.size)
            }
        }
        .ignoresSafeArea()
        .onAppear {
            startAnimations()
        }
        .onChange(of: step) { _, _ in
            // Redémarrer les animations quand l'étape change
            restartAnimations()
        }
        .animation(.easeInOut(duration: 0.6), value: step)
    }

    // MARK: - Animation Control

    private func startAnimations() {
        animate = false
        wavePhase = 0

        // Délai pour laisser la vue se mettre en place
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            withAnimation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true)) {
                animate = true
            }
            withAnimation(.linear(duration: 5).repeatForever(autoreverses: false)) {
                wavePhase = .pi * 2
            }
        }
    }

    private func restartAnimations() {
        // Reset et redémarrer
        animate = false
        wavePhase = 0

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            withAnimation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true)) {
                animate = true
            }
            withAnimation(.linear(duration: 5).repeatForever(autoreverses: false)) {
                wavePhase = .pi * 2
            }
        }
    }

    // MARK: - Step Specific Animations

    @ViewBuilder
    private func stepSpecificAnimation(in size: CGSize) -> some View {
        switch step {
        case .pseudo:
            // Cercles concentriques pulsants
            pseudoAnimation(in: size)
        case .phone:
            // Ondes de signal téléphonique
            phoneAnimation(in: size)
        case .email:
            // Enveloppes flottantes
            emailAnimation(in: size)
        case .identity:
            // Silhouettes qui apparaissent
            identityAnimation(in: size)
        case .password:
            // Bouclier avec serrure
            passwordAnimation(in: size)
        case .language:
            // Globe qui tourne avec drapeaux
            languageAnimation(in: size)
        case .profile:
            // Cadre photo animé
            profileAnimation(in: size)
        case .complete:
            // Confettis et célébration
            completeAnimation(in: size)
        }
    }

    // MARK: - Pseudo Animation (Cercles concentriques) - TRANSPARENT
    private func pseudoAnimation(in size: CGSize) -> some View {
        ZStack {
            ForEach(0..<5) { i in
                Circle()
                    .stroke(step.accentColor.opacity(0.12 - Double(i) * 0.02), lineWidth: 1.5)
                    .frame(width: 100 + CGFloat(i) * 80, height: 100 + CGFloat(i) * 80)
                    .scaleEffect(animate ? 1.1 : 0.9)
                    .animation(
                        .easeInOut(duration: 2.5)
                        .repeatForever(autoreverses: true)
                        .delay(Double(i) * 0.2),
                        value: animate
                    )
            }
            // @ symbol flottant
            Image(systemName: "at")
                .font(.system(size: 60, weight: .ultraLight))
                .foregroundColor(step.accentColor.opacity(0.08))
                .offset(y: animate ? -20 : 20)
                .animation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true), value: animate)
        }
        .position(x: size.width * 0.7, y: size.height * 0.3)
    }

    // MARK: - Phone Animation (Ondes de signal) - TRANSPARENT
    private func phoneAnimation(in size: CGSize) -> some View {
        ZStack {
            // Ondes de signal
            ForEach(0..<4) { i in
                RoundedRectangle(cornerRadius: 100)
                    .stroke(step.accentColor.opacity(0.15 - Double(i) * 0.03), lineWidth: 2)
                    .frame(width: 50 + CGFloat(i) * 60, height: 80 + CGFloat(i) * 40)
                    .rotationEffect(.degrees(-30))
                    .scaleEffect(animate ? 1.2 : 0.8)
                    .opacity(animate ? 0.2 : 0.5)
                    .animation(
                        .easeOut(duration: 1.8)
                        .repeatForever(autoreverses: false)
                        .delay(Double(i) * 0.3),
                        value: animate
                    )
            }
            // Icône téléphone
            Image(systemName: "phone.fill")
                .font(.system(size: 50))
                .foregroundColor(step.accentColor.opacity(0.1))
                .rotationEffect(.degrees(animate ? 5 : -5))
                .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: animate)
        }
        .position(x: size.width * 0.75, y: size.height * 0.35)
    }

    // MARK: - Email Animation (Enveloppes flottantes) - TRANSPARENT
    private func emailAnimation(in size: CGSize) -> some View {
        ZStack {
            ForEach(0..<6) { i in
                Image(systemName: i % 2 == 0 ? "envelope.fill" : "envelope")
                    .font(.system(size: 20 + CGFloat(i) * 8))
                    .foregroundColor(step.accentColor.opacity(0.08 - Double(i) * 0.01))
                    .offset(
                        x: CGFloat.random(in: -100...100),
                        y: animate ? CGFloat(i) * 40 - 100 : CGFloat(i) * 40 + 100
                    )
                    .rotationEffect(.degrees(Double(i) * 15))
                    .animation(
                        .easeInOut(duration: 3.5)
                        .repeatForever(autoreverses: true)
                        .delay(Double(i) * 0.2),
                        value: animate
                    )
            }
        }
        .position(x: size.width * 0.6, y: size.height * 0.4)
    }

    // MARK: - Identity Animation (Silhouettes) - TRANSPARENT
    private func identityAnimation(in size: CGSize) -> some View {
        ZStack {
            // Silhouettes
            ForEach(0..<3) { i in
                Image(systemName: "person.fill")
                    .font(.system(size: 80 - CGFloat(i) * 15))
                    .foregroundColor(step.accentColor.opacity(0.07 - Double(i) * 0.015))
                    .offset(x: CGFloat(i) * 30 - 30)
                    .scaleEffect(animate ? 1.05 : 0.95)
                    .animation(
                        .easeInOut(duration: 2.5)
                        .repeatForever(autoreverses: true)
                        .delay(Double(i) * 0.3),
                        value: animate
                    )
            }
            // Badge ID
            Image(systemName: "person.text.rectangle")
                .font(.system(size: 40))
                .foregroundColor(step.accentColor.opacity(0.1))
                .offset(y: 80)
                .rotationEffect(.degrees(animate ? 3 : -3))
                .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: animate)
        }
        .position(x: size.width * 0.7, y: size.height * 0.35)
    }

    // MARK: - Password Animation (Bouclier) - TRANSPARENT
    private func passwordAnimation(in size: CGSize) -> some View {
        ZStack {
            // Bouclier
            Image(systemName: "shield.fill")
                .font(.system(size: 120))
                .foregroundColor(step.accentColor.opacity(0.06))
                .scaleEffect(animate ? 1.1 : 0.9)
                .animation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true), value: animate)

            // Serrure
            Image(systemName: "lock.fill")
                .font(.system(size: 40))
                .foregroundColor(step.accentColor.opacity(0.12))
                .offset(y: animate ? -5 : 5)
                .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: animate)

            // Étoiles de sécurité
            ForEach(0..<6) { i in
                Image(systemName: "star.fill")
                    .font(.system(size: 12))
                    .foregroundColor(step.accentColor.opacity(0.1))
                    .offset(
                        x: cos(CGFloat(i) * .pi / 3) * (animate ? 80 : 60),
                        y: sin(CGFloat(i) * .pi / 3) * (animate ? 80 : 60)
                    )
                    .animation(
                        .easeInOut(duration: 2.5)
                        .repeatForever(autoreverses: true)
                        .delay(Double(i) * 0.1),
                        value: animate
                    )
            }
        }
        .position(x: size.width * 0.7, y: size.height * 0.35)
    }

    // MARK: - Language Animation (Globe) - TRANSPARENT
    private func languageAnimation(in size: CGSize) -> some View {
        ZStack {
            // Globe qui tourne
            Image(systemName: "globe.europe.africa.fill")
                .font(.system(size: 120))
                .foregroundColor(step.accentColor.opacity(0.07))
                .rotationEffect(.degrees(animate ? 10 : -10))
                .animation(.easeInOut(duration: 3).repeatForever(autoreverses: true), value: animate)

            // Drapeaux orbitant: FR, GB, ES, JP, PT, CN, IN (Hindi)
            ForEach(0..<7) { i in
                Text(["🇫🇷", "🇬🇧", "🇪🇸", "🇯🇵", "🇵🇹", "🇨🇳", "🇮🇳"][i])
                    .font(.system(size: 20))
                    .opacity(0.6)
                    .offset(
                        x: cos(CGFloat(i) * .pi * 2 / 7 + (animate ? 0.5 : 0)) * 85,
                        y: sin(CGFloat(i) * .pi * 2 / 7 + (animate ? 0.5 : 0)) * 85
                    )
                    .animation(
                        .easeInOut(duration: 4)
                        .repeatForever(autoreverses: true),
                        value: animate
                    )
            }
        }
        .position(x: size.width * 0.65, y: size.height * 0.35)
    }

    // MARK: - Profile Animation (Cadre photo) - TRANSPARENT
    private func profileAnimation(in size: CGSize) -> some View {
        ZStack {
            // Cadre principal
            RoundedRectangle(cornerRadius: 20)
                .stroke(step.accentColor.opacity(0.1), lineWidth: 2)
                .frame(width: 140, height: 180)
                .scaleEffect(animate ? 1.05 : 0.95)
                .animation(.easeInOut(duration: 2.5).repeatForever(autoreverses: true), value: animate)

            // Silhouette
            Image(systemName: "person.crop.circle.fill")
                .font(.system(size: 70))
                .foregroundColor(step.accentColor.opacity(0.08))

            // Icône caméra
            Image(systemName: "camera.fill")
                .font(.system(size: 30))
                .foregroundColor(step.accentColor.opacity(0.12))
                .offset(x: 50, y: 70)
                .scaleEffect(animate ? 1.2 : 0.8)
                .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: animate)

            // Étoiles scintillantes
            ForEach(0..<4) { i in
                Image(systemName: "sparkle")
                    .font(.system(size: 12))
                    .foregroundColor(step.accentColor.opacity(animate ? 0.2 : 0.05))
                    .offset(
                        x: [-60, 60, -40, 50][i],
                        y: [-80, -60, 70, 80][i]
                    )
                    .animation(
                        .easeInOut(duration: 1.5)
                        .repeatForever(autoreverses: true)
                        .delay(Double(i) * 0.25),
                        value: animate
                    )
            }
        }
        .position(x: size.width * 0.7, y: size.height * 0.35)
    }

    // MARK: - Complete Animation (Célébration) - TRANSPARENT
    private func completeAnimation(in size: CGSize) -> some View {
        ZStack {
            // Grand checkmark
            Image(systemName: "checkmark.seal.fill")
                .font(.system(size: 100))
                .foregroundColor(step.accentColor.opacity(0.1))
                .scaleEffect(animate ? 1.2 : 0.8)
                .animation(.easeInOut(duration: 2).repeatForever(autoreverses: true), value: animate)

            // Confettis - moins nombreux
            ForEach(0..<12) { i in
                Circle()
                    .fill(confettiColor(for: i))
                    .frame(width: 8 + CGFloat(i % 4) * 2)
                    .offset(
                        x: CGFloat(i % 6) * 50 - 125,
                        y: animate ? CGFloat(i / 2) * 80 - 50 : -100
                    )
                    .animation(
                        .easeIn(duration: 3 + Double(i % 3))
                        .repeatForever(autoreverses: false)
                        .delay(Double(i) * 0.15),
                        value: animate
                    )
            }

            // Étoiles
            ForEach(0..<6) { i in
                Image(systemName: "star.fill")
                    .font(.system(size: 15 + CGFloat(i % 3) * 4))
                    .foregroundColor(.yellow.opacity(0.3))
                    .offset(
                        x: cos(CGFloat(i) * .pi / 3) * (animate ? 120 : 70),
                        y: sin(CGFloat(i) * .pi / 3) * (animate ? 120 : 70)
                    )
                    .scaleEffect(animate ? 1.2 : 0.8)
                    .animation(
                        .easeInOut(duration: 1.5)
                        .repeatForever(autoreverses: true)
                        .delay(Double(i) * 0.15),
                        value: animate
                    )
            }
        }
        .position(x: size.width * 0.5, y: size.height * 0.4)
    }

    private func confettiColor(for index: Int) -> Color {
        let colors: [Color] = [.red, .orange, .yellow, .green, .blue, .purple, .pink]
        return colors[index % colors.count].opacity(0.4)
    }

    // MARK: - Floating Particles - PLUS TRANSPARENT
    private func floatingParticles(in size: CGSize) -> some View {
        ZStack {
            ForEach(0..<10) { i in
                Circle()
                    .fill(step.accentColor.opacity(0.04))
                    .frame(width: 30 + CGFloat(i % 4) * 15)
                    .blur(radius: 12)
                    .offset(
                        x: CGFloat(i % 5) * size.width / 5 - size.width / 2 + 50,
                        y: animate
                            ? CGFloat(i / 5) * size.height / 3 - 40
                            : CGFloat(i / 5) * size.height / 3 + 40
                    )
                    .animation(
                        .easeInOut(duration: 4 + Double(i % 3))
                        .repeatForever(autoreverses: true)
                        .delay(Double(i) * 0.15),
                        value: animate
                    )
            }
        }
    }

    // MARK: - Waves Overlay - PLUS TRANSPARENT
    private func wavesOverlay(in size: CGSize) -> some View {
        VStack {
            Spacer()
            ZStack {
                // Première vague
                WaveShape(phase: wavePhase, amplitude: 15, frequency: 1.5)
                    .fill(step.accentColor.opacity(0.04))
                    .frame(height: 80)

                // Deuxième vague
                WaveShape(phase: wavePhase + .pi, amplitude: 10, frequency: 2)
                    .fill(step.accentColor.opacity(0.025))
                    .frame(height: 60)
                    .offset(y: 15)
            }
        }
    }
}

// MARK: - Wave Shape

struct WaveShape: Shape {
    var phase: CGFloat
    var amplitude: CGFloat
    var frequency: CGFloat

    var animatableData: CGFloat {
        get { phase }
        set { phase = newValue }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 0, y: rect.midY))

        for x in stride(from: 0, through: rect.width, by: 1) {
            let relativeX = x / rect.width
            let y = sin(relativeX * .pi * 2 * frequency + phase) * amplitude + rect.midY
            path.addLine(to: CGPoint(x: x, y: y))
        }

        path.addLine(to: CGPoint(x: rect.width, y: rect.height))
        path.addLine(to: CGPoint(x: 0, y: rect.height))
        path.closeSubpath()

        return path
    }
}

// MARK: - Preview

#Preview {
    OnboardingFlowView()
}
