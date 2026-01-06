//
//  ChangePasswordView.swift
//  Meeshy
//
//  Secure password change flow
//  iOS 16+
//

import SwiftUI

struct ChangePasswordView: View {
    // MARK: - Properties

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = ProfileViewModel()
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var successMessage: String?
    @State private var showingSuccessAlert = false
    @FocusState private var focusedField: Field?

    enum Field {
        case current
        case new
        case confirm
    }

    // Password strength
    @State private var passwordStrength: PasswordStrength = .weak

    enum PasswordStrength {
        case weak
        case medium
        case strong

        var color: Color {
            switch self {
            case .weak: return .red
            case .medium: return .orange
            case .strong: return .green
            }
        }

        var text: String {
            switch self {
            case .weak: return "Faible"
            case .medium: return "Moyen"
            case .strong: return "Fort"
            }
        }
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            Form {
                currentPasswordSection
                newPasswordSection
                passwordRequirementsSection

                if let error = errorMessage {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Changer le mot de passe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Annuler") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Enregistrer") {
                        changePassword()
                    }
                    .fontWeight(.semibold)
                    .disabled(!isFormValid() || isLoading)
                }
            }
            .disabled(isLoading)
            .overlay {
                if isLoading {
                    ZStack {
                        Color.black.opacity(0.3)
                            .ignoresSafeArea()

                        VStack(spacing: 16) {
                            ProgressView()
                                .scaleEffect(1.2)
                            Text("Changement en cours...")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        .padding(24)
                        .background(Color(.systemBackground))
                        .cornerRadius(12)
                        .shadow(radius: 10)
                    }
                }
            }
            .alert("Mot de passe modifié", isPresented: $showingSuccessAlert) {
                Button("OK") {
                    dismiss()
                }
            } message: {
                Text("Votre mot de passe a été modifié avec succès. Vous devrez l'utiliser lors de votre prochaine connexion.")
            }
        }
        .interactiveDismissDisabled(isLoading)
    }

    // MARK: - Sections

    private var currentPasswordSection: some View {
        Section {
            SecureField("Mot de passe actuel", text: $currentPassword)
                .textContentType(.password)
                .focused($focusedField, equals: .current)
                .submitLabel(.next)
                .onSubmit {
                    focusedField = .new
                }
        } header: {
            Label("Mot de passe actuel", systemImage: "lock.fill")
        }
    }

    private var newPasswordSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                SecureField("Nouveau mot de passe", text: $newPassword)
                    .textContentType(.newPassword)
                    .focused($focusedField, equals: .new)
                    .submitLabel(.next)
                    .onChange(of: newPassword) { _, newValue in
                        updatePasswordStrength(newValue)
                    }
                    .onSubmit {
                        focusedField = .confirm
                    }

                // Password strength indicator
                if !newPassword.isEmpty {
                    HStack {
                        ForEach(0..<3) { index in
                            RoundedRectangle(cornerRadius: 2)
                                .fill(passwordStrengthColor(for: index))
                                .frame(height: 4)
                        }
                    }
                    .padding(.top, 4)

                    HStack {
                        Text("Force du mot de passe :")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(passwordStrength.text)
                            .font(.caption.bold())
                            .foregroundColor(passwordStrength.color)
                    }
                }

                Divider()

                SecureField("Confirmer le nouveau mot de passe", text: $confirmPassword)
                    .textContentType(.newPassword)
                    .focused($focusedField, equals: .confirm)
                    .submitLabel(.done)
                    .onSubmit {
                        if isFormValid() {
                            changePassword()
                        }
                    }
            }
        } header: {
            Label("Nouveau mot de passe", systemImage: "key.fill")
        } footer: {
            if !passwordsMatch() && !confirmPassword.isEmpty {
                Label("Les mots de passe ne correspondent pas", systemImage: "xmark.circle.fill")
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
    }

    private var passwordRequirementsSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
                requirementRow("Au moins 8 caractères", met: newPassword.count >= 8)
                requirementRow("Au moins une lettre majuscule", met: newPassword.rangeOfCharacter(from: .uppercaseLetters) != nil)
                requirementRow("Au moins une lettre minuscule", met: newPassword.rangeOfCharacter(from: .lowercaseLetters) != nil)
                requirementRow("Au moins un chiffre", met: newPassword.rangeOfCharacter(from: .decimalDigits) != nil)
                requirementRow("Au moins un caractère spécial", met: hasSpecialCharacter(newPassword))
            }
        } header: {
            Label("Exigences du mot de passe", systemImage: "checklist")
        }
    }

    // MARK: - Helper Views

    private func requirementRow(_ text: String, met: Bool) -> some View {
        HStack(spacing: 8) {
            Image(systemName: met ? "checkmark.circle.fill" : "circle")
                .font(.caption)
                .foregroundColor(met ? .green : .secondary)

            Text(text)
                .font(.caption)
                .foregroundColor(met ? .primary : .secondary)

            Spacer()
        }
    }

    // MARK: - Helper Methods

    private func passwordStrengthColor(for index: Int) -> Color {
        switch passwordStrength {
        case .weak:
            return index == 0 ? .red : Color(.systemGray5)
        case .medium:
            return index <= 1 ? .orange : Color(.systemGray5)
        case .strong:
            return .green
        }
    }

    private func updatePasswordStrength(_ password: String) {
        var strength = 0

        // Length check
        if password.count >= 8 { strength += 1 }
        if password.count >= 12 { strength += 1 }

        // Character variety checks
        if password.rangeOfCharacter(from: .uppercaseLetters) != nil { strength += 1 }
        if password.rangeOfCharacter(from: .lowercaseLetters) != nil { strength += 1 }
        if password.rangeOfCharacter(from: .decimalDigits) != nil { strength += 1 }
        if hasSpecialCharacter(password) { strength += 1 }

        // Determine strength level
        if strength >= 5 {
            passwordStrength = .strong
        } else if strength >= 3 {
            passwordStrength = .medium
        } else {
            passwordStrength = .weak
        }
    }

    private func hasSpecialCharacter(_ string: String) -> Bool {
        let specialCharacters = CharacterSet(charactersIn: "!@#$%^&*()_+-=[]{}|;:,.<>?")
        return string.rangeOfCharacter(from: specialCharacters) != nil
    }

    private func passwordsMatch() -> Bool {
        return newPassword == confirmPassword
    }

    private func isPasswordValid() -> Bool {
        guard newPassword.count >= 8 else { return false }
        guard newPassword.rangeOfCharacter(from: .uppercaseLetters) != nil else { return false }
        guard newPassword.rangeOfCharacter(from: .lowercaseLetters) != nil else { return false }
        guard newPassword.rangeOfCharacter(from: .decimalDigits) != nil else { return false }
        return true
    }

    private func isFormValid() -> Bool {
        return !currentPassword.isEmpty &&
               !newPassword.isEmpty &&
               !confirmPassword.isEmpty &&
               passwordsMatch() &&
               isPasswordValid()
    }

    // MARK: - Actions

    private func changePassword() {
        errorMessage = nil
        isLoading = true

        Task {
            let success = await viewModel.changePassword(
                currentPassword: currentPassword,
                newPassword: newPassword
            )

            await MainActor.run {
                isLoading = false
                if success {
                    showingSuccessAlert = true
                } else {
                    if let error = viewModel.error {
                        errorMessage = error.localizedDescription
                    } else {
                        errorMessage = "Le mot de passe actuel est incorrect"
                    }
                }
            }
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Change Password") {
    ChangePasswordView()
}
#endif