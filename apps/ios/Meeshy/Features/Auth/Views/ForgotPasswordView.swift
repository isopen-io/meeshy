//
//  ForgotPasswordView.swift
//  Meeshy
//
//  Password reset request screen
//  Minimum iOS 16+
//

import SwiftUI

struct ForgotPasswordView: View {
    // MARK: - Properties

    @Environment(\.dismiss) private var dismiss: DismissAction
    @StateObject private var viewModel = ForgotPasswordViewModel()

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                if viewModel.emailSent {
                    successView
                } else {
                    requestView
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

    // MARK: - Request View

    private var requestView: some View {
        VStack(spacing: 32) {
            // Header
            headerSection

            // Email Input
            AuthTextField(
                title: "Email",
                placeholder: "Enter your email address",
                text: $viewModel.email,
                keyboardType: .emailAddress,
                textContentType: .emailAddress,
                errorMessage: viewModel.emailError,
                autoFocus: true
            )

            // Error Message
            if let errorMessage = viewModel.errorMessage {
                errorSection(errorMessage)
            }

            // Send Button
            AuthButton(
                title: "Send Reset Link",
                isLoading: viewModel.isLoading,
                isEnabled: !viewModel.email.isEmpty,
                style: .primary
            ) {
                Task {
                    await viewModel.sendResetLink()
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

                Image(systemName: "envelope.badge.fill")
                    .font(.system(size: 56))
                    .foregroundColor(Color(red: 52/255, green: 199/255, blue: 89/255))
            }
            .accessibilityLabel("Success")

            // Success Message
            VStack(spacing: 16) {
                Text("Check Your Email")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(.primary)

                Text("We've sent a password reset link to")
                    .font(.system(size: 17))
                    .foregroundColor(.secondary)
                +
                Text("\n\(viewModel.email)")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundColor(.primary)
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, 32)

            // Instructions
            VStack(alignment: .leading, spacing: 12) {
                InstructionRow(
                    number: "1",
                    text: "Check your email inbox"
                )
                InstructionRow(
                    number: "2",
                    text: "Click the reset link in the email"
                )
                InstructionRow(
                    number: "3",
                    text: "Create a new password"
                )
            }
            .padding(.horizontal, 40)

            Spacer()

            // Done Button
            AuthButton(
                title: "Done",
                style: .primary
            ) {
                dismiss()
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 40)
    }

    // MARK: - View Components

    private var headerSection: some View {
        VStack(spacing: 16) {
            // Icon
            Image(systemName: "lock.rotation")
                .font(.system(size: 64))
                .foregroundColor(Color(red: 0, green: 122/255, blue: 1))
                .accessibilityHidden(true)

            // Title
            Text("Forgot Password?")
                .font(.system(size: 28, weight: .bold))
                .foregroundColor(.primary)

            // Description
            Text("Enter your email address and we'll send you a link to reset your password")
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

// MARK: - Instruction Row

private struct InstructionRow: View {
    let number: String
    let text: String

    var body: some View {
        HStack(spacing: 16) {
            Text(number)
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(.white)
                .frame(width: 32, height: 32)
                .background(Color(red: 0, green: 122/255, blue: 1))
                .clipShape(Circle())

            Text(text)
                .font(.system(size: 17))
                .foregroundColor(.primary)

            Spacer()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Step \(number): \(text)")
    }
}

// MARK: - Forgot Password View Model

@MainActor
final class ForgotPasswordViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var email: String = ""
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var emailError: String?
    @Published var emailSent: Bool = false

    // MARK: - Public Methods

    func sendResetLink() async {
        guard validate() else { return }

        isLoading = true
        errorMessage = nil

        // Simulate API call
        try? await Task.sleep(nanoseconds: 1_500_000_000) // 1.5 seconds

        // In a real app, you would call the password reset API endpoint
        // For now, we'll just show success

        // Success haptic
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.success)

        emailSent = true
        isLoading = false
    }

    // MARK: - Private Methods

    private func validate() -> Bool {
        emailError = nil
        errorMessage = nil

        let trimmedEmail = email.trimmingCharacters(in: .whitespaces)

        if trimmedEmail.isEmpty {
            emailError = "Email is required"
            return false
        }

        if !isValidEmail(trimmedEmail) {
            emailError = "Please enter a valid email address"
            return false
        }

        return true
    }

    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        return emailPredicate.evaluate(with: email)
    }
}

// MARK: - Preview

#Preview("Request") {
    ForgotPasswordView()
}

#Preview("Success") {
    let viewModel = ForgotPasswordViewModel()
    let view = ForgotPasswordView()
    view.onAppear {
        viewModel.email = "user@example.com"
        viewModel.emailSent = true
    }
}
