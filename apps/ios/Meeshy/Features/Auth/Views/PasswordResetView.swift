//
//  PasswordResetView.swift
//  Meeshy
//
//  New password entry screen (from reset link)
//  Minimum iOS 16+
//

import SwiftUI

struct PasswordResetView: View {
    // MARK: - Properties

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = PasswordResetViewModel()

    let resetToken: String

    // MARK: - Initialization

    init(resetToken: String) {
        self.resetToken = resetToken
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                if viewModel.resetComplete {
                    successView
                } else {
                    resetFormView
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(.primary)
                    }
                }
            }
            .onTapGesture {
                hideKeyboard()
            }
        }
    }

    // MARK: - Reset Form View

    private var resetFormView: some View {
        VStack(spacing: 32) {
            // Header
            headerSection

            // Password Inputs
            VStack(spacing: 16) {
                AuthTextField(
                    title: "New Password",
                    placeholder: "Enter new password",
                    text: $viewModel.newPassword,
                    textContentType: .newPassword,
                    isSecure: true,
                    errorMessage: viewModel.newPasswordError,
                    autoFocus: true
                )

                AuthTextField(
                    title: "Confirm Password",
                    placeholder: "Confirm new password",
                    text: $viewModel.confirmPassword,
                    textContentType: .newPassword,
                    isSecure: true,
                    errorMessage: viewModel.confirmPasswordError
                )
            }

            // Password Strength & Requirements
            if !viewModel.newPassword.isEmpty {
                PasswordStrengthIndicator(password: viewModel.newPassword)
                    .transition(.opacity)
            }

            // Error Message
            if let errorMessage = viewModel.errorMessage {
                errorSection(errorMessage)
            }

            // Reset Button
            AuthButton(
                title: "Reset Password",
                isLoading: viewModel.isLoading,
                isEnabled: viewModel.isFormValid,
                style: .primary
            ) {
                Task {
                    await viewModel.resetPassword(token: resetToken)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 24)
        .padding(.top, 60)
        .padding(.bottom, 40)
    }

    // MARK: - Success View

    private var successView: some View {
        VStack(spacing: 32) {
            Spacer()

            // Success Icon
            ZStack {
                Circle()
                    .fill(Color(red: 52/255, green: 199/255, blue: 89/255).opacity(0.1))
                    .frame(width: 120, height: 120)

                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 64))
                    .foregroundColor(Color(red: 52/255, green: 199/255, blue: 89/255))
            }
            .accessibilityLabel("Success")

            // Success Message
            VStack(spacing: 16) {
                Text("Password Reset Complete")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(.primary)

                Text("Your password has been successfully reset. You can now sign in with your new password.")
                    .font(.system(size: 17))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer()

            // Sign In Button
            AuthButton(
                title: "Sign In",
                style: .primary
            ) {
                dismiss()
                // Navigate to login view
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 40)
    }

    // MARK: - View Components

    private var headerSection: some View {
        VStack(spacing: 16) {
            // Icon
            Image(systemName: "key.fill")
                .font(.system(size: 64))
                .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
                .accessibilityHidden(true)

            // Title
            Text("Reset Password")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.primary)

            // Description
            Text("Create a strong password to protect your account")
                .font(.system(size: 17))
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)
        }
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
    }

    // MARK: - Helper Methods

    private func hideKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
    }
}

// MARK: - Password Reset View Model

@MainActor
final class PasswordResetViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var newPassword: String = ""
    @Published var confirmPassword: String = ""
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var newPasswordError: String?
    @Published var confirmPasswordError: String?
    @Published var resetComplete: Bool = false

    // MARK: - Computed Properties

    var passwordStrength: PasswordStrength {
        PasswordStrength.calculate(for: newPassword)
    }

    var isFormValid: Bool {
        newPassword.count >= 8 &&
        passwordStrength != .weak &&
        newPassword == confirmPassword
    }

    // MARK: - Public Methods

    func resetPassword(token: String) async {
        guard validate() else { return }

        isLoading = true
        errorMessage = nil

        // Simulate API call
        try? await Task.sleep(nanoseconds: 1_500_000_000) // 1.5 seconds

        // In a real app, you would call the password reset API endpoint
        // POST /auth/reset-password with token and newPassword

        // Success haptic
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)

        resetComplete = true
        isLoading = false
    }

    // MARK: - Private Methods

    private func validate() -> Bool {
        var isValid = true

        newPasswordError = nil
        confirmPasswordError = nil
        errorMessage = nil

        // New password validation
        if newPassword.isEmpty {
            newPasswordError = "Password is required"
            isValid = false
        } else if newPassword.count < 8 {
            newPasswordError = "Password must be at least 8 characters"
            isValid = false
        } else if passwordStrength == .weak {
            newPasswordError = "Password is too weak"
            isValid = false
        }

        // Confirm password validation
        if confirmPassword.isEmpty {
            confirmPasswordError = "Please confirm your password"
            isValid = false
        } else if newPassword != confirmPassword {
            confirmPasswordError = "Passwords don't match"
            isValid = false
        }

        if !isValid {
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.error)
        }

        return isValid
    }
}

// MARK: - Preview

#Preview("Form") {
    PasswordResetView(resetToken: "sample-token")
}

#Preview("Success") {
    let view = PasswordResetView(resetToken: "sample-token")
    return view
}
