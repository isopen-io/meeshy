//
//  RegistrationStep1IdentityView.swift
//  Meeshy
//
//  Step 1: Identity - First name, Last name, Username
//  "Bienvenue!" with playful animations
//

import SwiftUI

struct RegistrationStep1IdentityView: View {
    @ObservedObject var viewModel: RegistrationFlowViewModel

    @State private var headerAppeared = false

    private let accentColor = RegistrationStep.identity.accentColor

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Header with illustration
                headerSection

                // Form fields
                VStack(spacing: 16) {
                    // First Name
                    OnboardingFieldCard(
                        explanation: .firstName,
                        accentColor: accentColor,
                        delay: 0.1
                    ) {
                        OnboardingTextField(
                            placeholder: "Jean-Pierre",
                            text: $viewModel.firstName,
                            autocapitalization: .words,
                            errorMessage: viewModel.firstNameError
                        )
                    }

                    // Last Name
                    OnboardingFieldCard(
                        explanation: .lastName,
                        accentColor: accentColor,
                        delay: 0.2
                    ) {
                        OnboardingTextField(
                            placeholder: "Kamga",
                            text: $viewModel.lastName,
                            autocapitalization: .words,
                            errorMessage: viewModel.lastNameError
                        )
                    }

                    // Username
                    OnboardingFieldCard(
                        explanation: .username,
                        accentColor: accentColor,
                        delay: 0.3
                    ) {
                        VStack(alignment: .leading, spacing: 10) {
                            OnboardingTextField(
                                placeholder: "@tonpseudo",
                                text: $viewModel.username,
                                autocapitalization: .never,
                                trailingView: AnyView(
                                    UsernameStatusView(
                                        isChecking: viewModel.isCheckingUsername,
                                        isAvailable: viewModel.isUsernameAvailable
                                    )
                                )
                            )

                            // Username suggestions if not available
                            if viewModel.isUsernameAvailable == false && !viewModel.usernameSuggestions.isEmpty {
                                usernameSuggestions
                            }
                        }
                    }
                }

                Spacer(minLength: 100)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: 16) {
            // Illustration
            ZStack {
                Circle()
                    .fill(accentColor.opacity(0.1))
                    .frame(width: 100, height: 100)

                Text("👋")
                    .font(.system(size: 50))
                    .scaleEffect(headerAppeared ? 1 : 0.5)
                    .rotationEffect(.degrees(headerAppeared ? 0 : -20))
            }

            VStack(spacing: 8) {
                Text("Bienvenue sur Meeshy!")
                    .font(.system(size: 26, weight: .bold))
                    .foregroundColor(.primary)

                Text("Dis-nous qui tu es pour qu'on puisse t'accueillir comme il faut! 😊")
                    .font(.system(size: 15))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            .opacity(headerAppeared ? 1 : 0)
            .offset(y: headerAppeared ? 0 : 20)
        }
        .onAppear {
            withAnimation(.spring(response: 0.6, dampingFraction: 0.7)) {
                headerAppeared = true
            }
        }
    }

    // MARK: - Username Suggestions

    private var usernameSuggestions: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Ce pseudo est déjà pris! Essaie un de ceux-ci:")
                .font(.system(size: 13))
                .foregroundColor(.secondary)

            HStack(spacing: 8) {
                ForEach(viewModel.usernameSuggestions.prefix(3), id: \.self) { suggestion in
                    Button(action: {
                        viewModel.selectSuggestion(suggestion)
                    }) {
                        Text("@\(suggestion)")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(accentColor)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(
                                Capsule()
                                    .fill(accentColor.opacity(0.1))
                            )
                    }
                }
            }
        }
        .padding(.top, 4)
        .transition(.opacity.combined(with: .move(edge: .top)))
    }
}

// MARK: - Preview

#Preview {
    RegistrationStep1IdentityView(viewModel: RegistrationFlowViewModel())
}
