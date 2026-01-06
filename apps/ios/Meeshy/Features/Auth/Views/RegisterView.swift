//
//  RegisterView.swift
//  Meeshy
//
//  Modern user registration screen with all required fields
//  Minimum iOS 16+
//

import SwiftUI

struct RegisterView: View {
    // MARK: - Properties

    @Environment(\.dismiss) private var dismiss: DismissAction
    @StateObject private var viewModel = RegisterViewModel()
    @FocusState private var focusedField: Field?

    /// Callback to pass redirect info to login view
    var onRedirectToLogin: ((RegistrationRedirectInfo) -> Void)?

    // Field focus enum
    private enum Field: Hashable {
        case firstName
        case lastName
        case username
        case email
        case password
        case confirmPassword
        case phoneNumber
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header
                    headerSection

                    // Registration Form
                    registrationFormSection

                    // Password Strength Indicator
                    if !viewModel.password.isEmpty {
                        PasswordStrengthIndicator(password: viewModel.password)
                            .transition(.opacity)
                            .animation(.easeInOut(duration: 0.2), value: !viewModel.password.isEmpty)
                    }

                    // Language Selection
                    languageSection

                    // Terms & Privacy
                    termsSection

                    // Error Message
                    if let errorMessage = viewModel.errorMessage {
                        errorSection(errorMessage)
                    }

                    // Success Message
                    if viewModel.registrationComplete {
                        successSection
                    }

                    // Create Account Button
                    AuthButton(
                        title: "Create Account",
                        isLoading: viewModel.isLoading,
                        isEnabled: viewModel.isFormValid,
                        style: .primary
                    ) {
                        Task {
                            await viewModel.register()
                        }
                    }

                    Spacer(minLength: 20)

                    // Sign In Link
                    signInSection
                }
                .padding(.horizontal, 24)
                .padding(.top, 40)
                .padding(.bottom, 40)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.primary)
                    }
                    .accessibilityLabel("Close")
                }
            }
            .onTapGesture {
                hideKeyboard()
            }
            .onChange(of: viewModel.registrationComplete) { completed in
                if completed {
                    // Add a slight delay for user to see success message
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                        dismiss()
                    }
                }
            }
            .onChange(of: viewModel.shouldRedirectToLogin) { shouldRedirect in
                if shouldRedirect, let redirectInfo = viewModel.redirectInfo {
                    // Pass redirect info and dismiss
                    onRedirectToLogin?(redirectInfo)
                    viewModel.resetRedirectState()
                    dismiss()
                }
            }
            .alert("Compte existant", isPresented: $viewModel.shouldRedirectToLogin) {
                Button("Se connecter") {
                    if let redirectInfo = viewModel.redirectInfo {
                        onRedirectToLogin?(redirectInfo)
                        dismiss()
                    }
                }
                Button("Annuler", role: .cancel) {
                    viewModel.resetRedirectState()
                }
            } message: {
                Text(viewModel.redirectInfo?.message ?? "Un compte existe déjà. Connectez-vous.")
            }
        }
    }

    // MARK: - View Components

    private var headerSection: some View {
        VStack(spacing: 12) {
            // App Icon
            Image(systemName: "message.circle.fill")
                .font(.system(size: 64))
                .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
                .accessibilityHidden(true)

            Text("Create Account")
                .font(.system(size: 32, weight: .bold))
                .foregroundColor(.primary)

            Text("Join Meeshy to start messaging")
                .font(.system(size: 17))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.bottom, 8)
    }

    private var registrationFormSection: some View {
        VStack(spacing: 16) {
            // Name fields in horizontal stack on iPad, vertical on iPhone
            Group {
                if UIDevice.current.userInterfaceIdiom == .pad {
                    HStack(spacing: 16) {
                        nameFields
                    }
                } else {
                    nameFields
                }
            }

            // Username with availability checking
            VStack(alignment: .leading, spacing: 8) {
                UsernameTextField(
                    username: $viewModel.username,
                    isAvailable: $viewModel.isUsernameAvailable,
                    isChecking: $viewModel.isCheckingUsername,
                    errorMessage: viewModel.usernameError,
                    onAvailabilityCheck: { username in
                        await viewModel.checkUsernameAvailability(username)
                    }
                )
                .focused($focusedField, equals: .username)

                // Username suggestions when taken
                if !viewModel.usernameSuggestions.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Suggestions disponibles :")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(.secondary)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(viewModel.usernameSuggestions, id: \.self) { suggestion in
                                    Button {
                                        viewModel.selectSuggestedUsername(suggestion)
                                    } label: {
                                        Text(suggestion)
                                            .font(.system(size: 14, weight: .medium))
                                            .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 6)
                                            .background(
                                                RoundedRectangle(cornerRadius: 8)
                                                    .fill(Color(red: 0, green: 122/255, blue: 1).opacity(0.1))
                                            )
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 4)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                    .animation(.easeInOut(duration: 0.2), value: viewModel.usernameSuggestions)
                }
            }

            // Email
            AuthTextField(
                title: "Email",
                placeholder: "Enter your email",
                text: $viewModel.email,
                keyboardType: .emailAddress,
                textContentType: .emailAddress,
                errorMessage: viewModel.emailError
            )
            .focused($focusedField, equals: .email)

            // Password
            AuthTextField(
                title: "Password",
                placeholder: "Create a strong password",
                text: $viewModel.password,
                textContentType: .newPassword,
                isSecure: true,
                errorMessage: viewModel.passwordError
            )
            .focused($focusedField, equals: .password)

            // Confirm Password
            AuthTextField(
                title: "Confirm Password",
                placeholder: "Re-enter your password",
                text: $viewModel.confirmPassword,
                textContentType: .newPassword,
                isSecure: true,
                errorMessage: viewModel.confirmPasswordError
            )
            .focused($focusedField, equals: .confirmPassword)

            // Country Selection (Mandatory)
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Country")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(.primary)

                    Text("*")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(.red)
                }

                CountryPicker(
                    selectedCountry: $viewModel.selectedCountry,
                    placeholder: "Sélectionner votre pays",
                    isRequired: true
                )

                if let countryError = viewModel.countryError {
                    Text(countryError)
                        .font(.system(size: 13))
                        .foregroundColor(.red)
                        .padding(.horizontal, 4)
                }
            }

            // Phone Number (Required)
            VStack(alignment: .leading, spacing: 8) {
                AuthTextField(
                    title: "Phone Number *",
                    placeholder: viewModel.selectedCountry != nil ? "0610424242" : "Enter phone number",
                    text: $viewModel.phoneNumber,
                    keyboardType: .phonePad,
                    textContentType: .telephoneNumber,
                    errorMessage: viewModel.phoneNumberError
                )
                .focused($focusedField, equals: .phoneNumber)

                // Helper text with country code preview
                if let country = viewModel.selectedCountry {
                    HStack(spacing: 4) {
                        Text("\(country.flag) \(country.dialCode)")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Color(red: 0, green: 122/255, blue: 1))

                        if !viewModel.phoneNumber.isEmpty, let formatted = viewModel.formattedPhoneNumber {
                            Text("→ \(formatted)")
                                .font(.system(size: 13))
                                .foregroundColor(.secondary)
                        } else {
                            Text("+ votre numéro")
                                .font(.system(size: 13))
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding(.horizontal, 4)
                } else {
                    Text("Veuillez d'abord sélectionner un pays")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .padding(.horizontal, 4)
                }
            }
        }
    }

    @ViewBuilder
    private var nameFields: some View {
        // First Name
        AuthTextField(
            title: "First Name",
            placeholder: "Enter your first name",
            text: $viewModel.firstName,
            textContentType: .givenName,
            errorMessage: viewModel.firstNameError,
            autoFocus: true
        )
        .focused($focusedField, equals: .firstName)

        // Last Name
        AuthTextField(
            title: "Last Name",
            placeholder: "Enter your last name",
            text: $viewModel.lastName,
            textContentType: .familyName,
            errorMessage: viewModel.lastNameError
        )
        .focused($focusedField, equals: .lastName)
    }

    private var languageSection: some View {
        VStack(spacing: 16) {
            // Première langue parlée (Primary Language)
            LanguageSelector(
                title: "Première langue parlée",
                selectedLanguage: $viewModel.primaryLanguage,
                languages: AuthLanguage.supportedLanguages,
                errorMessage: nil
            )

            // Seconde langue parlée (Secondary Language)
            LanguageSelector(
                title: "Seconde langue parlée",
                selectedLanguage: $viewModel.secondaryLanguage,
                languages: AuthLanguage.supportedLanguages,
                errorMessage: nil
            )

            // Language helper text
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "1.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(Color(red: 0, green: 122/255, blue: 1))

                    Text("Langue dans laquelle vous rédigez vos messages et vers laquelle tous les messages reçus seront traduits.")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "2.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(Color(red: 0, green: 122/255, blue: 1))

                    Text("Langue alternative vers laquelle traduire vos messages si vous l'autorisez dans vos paramètres.")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(.horizontal, 4)
        }
    }

    private var termsSection: some View {
        HStack(alignment: .top, spacing: 12) {
            Button(action: {
                viewModel.acceptedTerms.toggle()

                // Haptic feedback
                let generator = UIImpactFeedbackGenerator(style: .light)
                generator.impactOccurred()
            }) {
                Image(systemName: viewModel.acceptedTerms ? "checkmark.square.fill" : "square")
                    .font(.system(size: 22))
                    .foregroundColor(viewModel.acceptedTerms ?
                        Color(red: 0, green: 122/255, blue: 1) : .secondary)
            }
            .accessibilityLabel(viewModel.acceptedTerms ? "Terms accepted" : "Terms not accepted")

            VStack(alignment: .leading, spacing: 4) {
                Text("I agree to the ")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                +
                Text("Terms & Conditions")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
                +
                Text(" and ")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                +
                Text("Privacy Policy")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(red: 0, green: 122/255, blue: 1))

                Text("By creating an account, you agree to receive communications from Meeshy.")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                    .padding(.top, 2)
            }

            Spacer()
        }
        .padding(.top, 8)
    }

    private func errorSection(_ message: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 16))

            Text(message)
                .font(.system(size: 15))
                .multilineTextAlignment(.leading)

            Spacer()
        }
        .foregroundColor(Color(red: 1, green: 59/255, blue: 48/255))
        .padding(16)
        .background(
            Color(red: 1, green: 59/255, blue: 48/255).opacity(0.1)
        )
        .cornerRadius(12)
        .transition(.opacity)
        .animation(.easeInOut(duration: 0.3), value: message)
    }

    private var successSection: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 16))

            Text("Account created successfully! Signing you in...")
                .font(.system(size: 15))
                .multilineTextAlignment(.leading)

            Spacer()
        }
        .foregroundColor(Color(red: 52/255, green: 199/255, blue: 89/255))
        .padding(16)
        .background(
            Color(red: 52/255, green: 199/255, blue: 89/255).opacity(0.1)
        )
        .cornerRadius(12)
        .transition(.opacity)
    }

    private var signInSection: some View {
        HStack(spacing: 4) {
            Text("Already have an account?")
                .font(.system(size: 15))
                .foregroundColor(.secondary)

            Button(action: {
                dismiss()
            }) {
                Text("Sign In")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
            }
        }
    }

    // MARK: - Helper Methods

    private func hideKeyboard() {
        focusedField = nil
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
    }
}

// MARK: - Preview

#Preview("Light Mode") {
    RegisterView()
}

#Preview("Dark Mode") {
    RegisterView()
        .preferredColorScheme(.dark)
}

#Preview("iPad") {
    RegisterView()
        .previewDevice("iPad Pro (11-inch) (4th generation)")
}