import SwiftUI
import MeeshySDK
import MeeshyUI

struct OnboardingFlowView: View {
    @StateObject private var viewModel = RegistrationViewModel()
    @EnvironmentObject var authManager: AuthManager
    @Environment(\.dismiss) private var dismiss

    var onComplete: (() -> Void)?

    @State private var keyboardHeight: CGFloat = 0

    var body: some View {
        ZStack {
            AnimatedStepBackground(step: viewModel.currentStep)

            VStack(spacing: 0) {
                topBar

                InteractiveProgressBar(
                    currentStep: viewModel.currentStep,
                    onStepTapped: { step in
                        if step.rawValue <= viewModel.currentStep.rawValue {
                            withAnimation(.spring(response: 0.3)) {
                                viewModel.currentStep = step
                            }
                        }
                    }
                )
                .padding(.horizontal, 16)
                .padding(.top, 8)

                stepHeader
                    .padding(.horizontal, 20)
                    .padding(.top, 16)

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

                    StepRecapView(viewModel: viewModel)
                        .tag(RegistrationStep.recap)
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .animation(.spring(response: 0.5, dampingFraction: 0.85), value: viewModel.currentStep)

                bottomBar
                    .padding(.bottom, keyboardHeight > 0 ? 0 : 16)
            }
            .background(
                Color(.systemBackground)
                    .opacity(0.5)
                    .ignoresSafeArea()
            )
        }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .onAppear { setupKeyboardObserver() }
        .onChange(of: authManager.isAuthenticated) { _, authenticated in
            if authenticated {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                    onComplete?()
                    dismiss()
                }
            }
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
                    .background(Capsule().fill(Color(.systemGray6).opacity(0.9)))
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
                        .background(Circle().fill(Color(.systemGray6).opacity(0.9)))
                }
            }

            Spacer()

            Image(systemName: viewModel.currentStep.iconName)
                .font(.system(size: 20, weight: .medium))
                .foregroundColor(viewModel.currentStep.accentColor)

            Text("\(viewModel.currentStep.rawValue + 1)/\(viewModel.totalSteps)")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundColor(.secondary)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Capsule().fill(Color(.systemGray6).opacity(0.9)))
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
        }
    }

    // MARK: - Bottom Bar

    private var bottomBar: some View {
        VStack(spacing: 10) {
            GlowingButton(
                title: buttonTitle,
                icon: buttonIcon,
                accentColor: viewModel.currentStep.accentColor,
                isEnabled: viewModel.canProceed && !viewModel.isLoading,
                isLoading: viewModel.isLoading
            ) {
                if viewModel.currentStep == .recap {
                    Task { await viewModel.register() }
                } else {
                    viewModel.nextStep()
                }
            }

            if viewModel.currentStep == .profile {
                Button(action: { viewModel.nextStep() }) {
                    Text("Passer cette etape")
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
        case .recap:
            return "Creer mon compte"
        case .profile:
            return "Continuer"
        default:
            return "C'est bon, suivant!"
        }
    }

    private var buttonIcon: String? {
        switch viewModel.currentStep {
        case .recap: return "sparkles"
        default: return "arrow.right"
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
