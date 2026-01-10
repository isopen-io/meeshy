//
//  RegistrationStepContainer.swift
//  Meeshy
//
//  Container réutilisable pour chaque étape d'inscription
//  Avec fond animé et layout standardisé
//

import SwiftUI

// MARK: - Registration Step Container

struct RegistrationStepContainer<Content: View>: View {
    let step: NewRegistrationStep
    let content: Content

    @Environment(\.colorScheme) private var colorScheme

    init(step: NewRegistrationStep, @ViewBuilder content: () -> Content) {
        self.step = step
        self.content = content()
    }

    var body: some View {
        ZStack {
            // Arrière-plan animé
            RegistrationBackgroundView(step: step)

            // Contenu avec effet glassmorphism
            VStack(spacing: 0) {
                // Header avec icône et texte fun
                headerSection
                    .padding(.top, 60)
                    .padding(.horizontal, 24)

                // Zone de contenu scrollable
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 24) {
                        content
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 20)
                    .padding(.bottom, 100)
                }

                Spacer(minLength: 0)
            }
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: 16) {
            // Icône avec effet glow
            ZStack {
                // Glow effect
                Circle()
                    .fill(step.accentColor.opacity(0.3))
                    .frame(width: 100, height: 100)
                    .blur(radius: 20)

                // Cercle de fond
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 80, height: 80)

                // Icône
                Image(systemName: step.iconName)
                    .font(.system(size: 36))
                    .foregroundStyle(step.accentColor)
            }

            // Titre fun
            Text(step.funHeader)
                .font(.system(size: 28, weight: .bold, design: .rounded))
                .foregroundColor(.white)
                .multilineTextAlignment(.center)
                .shadow(color: .black.opacity(0.3), radius: 2, x: 0, y: 2)

            // Sous-titre
            Text(step.funSubtitle)
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(.white.opacity(0.8))
                .multilineTextAlignment(.center)
                .lineSpacing(4)
                .padding(.horizontal, 10)
        }
    }
}

// MARK: - Glassmorphic Card

struct GlassmorphicCard<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(20)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(.white.opacity(0.2), lineWidth: 1)
            )
            .shadow(color: .black.opacity(0.2), radius: 10, x: 0, y: 5)
    }
}

// MARK: - Registration Input Field

struct RegistrationInputField: View {
    let icon: String
    let placeholder: String
    @Binding var text: String
    var isSecure: Bool = false
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization = .sentences
    var error: String?
    var isLoading: Bool = false
    var isValid: Bool?
    let accentColor: Color

    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                // Icône
                Image(systemName: icon)
                    .font(.system(size: 18))
                    .foregroundColor(isFocused ? accentColor : .white.opacity(0.6))
                    .frame(width: 24)

                // Champ de texte
                inputField

                // Indicateur de statut
                statusIndicator
            }
            .padding(16)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(borderOverlay)

            // Message d'erreur
            errorMessage
        }
    }

    @ViewBuilder
    private var inputField: some View {
        if isSecure {
            SecureField(placeholder, text: $text)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.white)
                .focused($isFocused)
        } else {
            TextField(placeholder, text: $text)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.white)
                .keyboardType(keyboardType)
                .textInputAutocapitalization(autocapitalization)
                .focused($isFocused)
        }
    }

    @ViewBuilder
    private var statusIndicator: some View {
        if isLoading {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: accentColor))
                .scaleEffect(0.8)
        } else if let isValid = isValid {
            Image(systemName: isValid ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundColor(isValid ? .green : .red)
                .font(.system(size: 20))
        }
    }

    private var borderOverlay: some View {
        let borderColor: Color = {
            if isFocused {
                return accentColor
            } else if error != nil {
                return .red
            } else {
                return .white.opacity(0.2)
            }
        }()
        let lineWidth: CGFloat = isFocused ? 2 : 1

        return RoundedRectangle(cornerRadius: 14)
            .stroke(borderColor, lineWidth: lineWidth)
    }

    @ViewBuilder
    private var errorMessage: some View {
        if let error = error {
            HStack(spacing: 4) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 12))
                Text(error)
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundColor(.red)
            .padding(.leading, 4)
        }
    }
}

// MARK: - Registration Button

struct RegistrationButton: View {
    let title: String
    let icon: String?
    let accentColor: Color
    let isEnabled: Bool
    let isLoading: Bool
    let action: () -> Void

    @State private var isPressed = false

    init(
        title: String,
        icon: String? = nil,
        accentColor: Color,
        isEnabled: Bool = true,
        isLoading: Bool = false,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.icon = icon
        self.accentColor = accentColor
        self.isEnabled = isEnabled
        self.isLoading = isLoading
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.9)
                } else {
                    if let icon = icon {
                        Image(systemName: icon)
                            .font(.system(size: 18, weight: .semibold))
                    }
                    Text(title)
                        .font(.system(size: 17, weight: .bold))
                }
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .frame(height: 56)
            .background(buttonBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .shadow(color: isEnabled ? accentColor.opacity(0.4) : .clear, radius: 10, x: 0, y: 5)
            .scaleEffect(isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.3), value: isPressed)
        }
        .disabled(!isEnabled || isLoading)
        .simultaneousGesture(
            DragGesture(minimumDistance: 0)
                .onChanged { _ in isPressed = true }
                .onEnded { _ in isPressed = false }
        )
    }

    @ViewBuilder
    private var buttonBackground: some View {
        if isEnabled {
            LinearGradient(
                colors: [accentColor, accentColor.opacity(0.8)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        } else {
            Color.gray.opacity(0.5)
        }
    }
}

// MARK: - Quote View

struct MotivationalQuoteView: View {
    let quote: String
    let accentColor: Color

    var body: some View {
        HStack(spacing: 12) {
            Rectangle()
                .fill(accentColor)
                .frame(width: 3)

            Text(quote)
                .font(.system(size: 14, weight: .medium, design: .serif))
                .italic()
                .foregroundColor(.white.opacity(0.7))
                .lineSpacing(4)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .background(.ultraThinMaterial.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

// MARK: - Progress Indicator

struct RegistrationProgressView: View {
    let currentStep: Int
    let totalSteps: Int
    let accentColor: Color

    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<totalSteps, id: \.self) { index in
                Capsule()
                    .fill(index <= currentStep ? accentColor : .white.opacity(0.3))
                    .frame(height: 4)
                    .animation(.spring(response: 0.4), value: currentStep)
            }
        }
        .padding(.horizontal, 24)
    }
}

// MARK: - Preview

#Preview("Step Container") {
    RegistrationStepContainer(step: .pseudo) {
        VStack(spacing: 20) {
            RegistrationInputField(
                icon: "person.fill",
                placeholder: "Choisis ton pseudo",
                text: .constant(""),
                accentColor: .blue
            )

            MotivationalQuoteView(
                quote: NewRegistrationStep.pseudo.motivationalQuote,
                accentColor: .blue
            )

            RegistrationButton(
                title: "Continuer",
                icon: "arrow.right",
                accentColor: .blue,
                action: {}
            )
        }
    }
}
