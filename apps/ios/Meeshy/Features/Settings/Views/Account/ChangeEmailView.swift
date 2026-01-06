//
//  ChangeEmailView.swift
//  Meeshy
//
//  Secure email change flow
//  iOS 16+
//

import SwiftUI

struct ChangeEmailView: View {
    // MARK: - Properties

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = ProfileViewModel()
    @State private var newEmail = ""
    @State private var confirmEmail = ""
    @State private var password = ""
    @State private var verificationCode = ""
    @State private var showingVerification = false
    @State private var isLoading = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?

    enum Field {
        case email
        case confirmEmail
        case password
        case code
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            Form {
                if !showingVerification {
                    emailSection
                    passwordSection
                } else {
                    verificationSection
                }

                if let error = errorMessage {
                    Section {
                        Text(error)
                            .font(.footnote)
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle(showingVerification ? "Vérifier l'email" : "Changer l'email")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Annuler") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(showingVerification ? "Vérifier" : "Continuer") {
                        if showingVerification {
                            verifyCode()
                        } else {
                            requestEmailChange()
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(!isFormValid())
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
                            Text(showingVerification ? "Vérification..." : "Envoi du code...")
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
        }
        .interactiveDismissDisabled(isLoading)
    }

    // MARK: - Sections

    private var emailSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                // Current email display
                VStack(alignment: .leading, spacing: 4) {
                    Text("Email actuel")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(viewModel.user?.email ?? "")
                        .font(.body)
                        .foregroundColor(.primary)
                }
                .padding(.vertical, 4)

                Divider()

                // New email input
                TextField("Nouveau email", text: $newEmail)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .autocapitalization(.none)
                    .focused($focusedField, equals: .email)
                    .submitLabel(.next)
                    .onSubmit {
                        focusedField = .confirmEmail
                    }

                // Confirm email input
                TextField("Confirmer le nouveau email", text: $confirmEmail)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .autocapitalization(.none)
                    .focused($focusedField, equals: .confirmEmail)
                    .submitLabel(.next)
                    .onSubmit {
                        focusedField = .password
                    }
            }
        } header: {
            Label("Nouvelle adresse email", systemImage: "envelope.fill")
        } footer: {
            if !emailsMatch() && !confirmEmail.isEmpty {
                Text("Les adresses email ne correspondent pas")
                    .foregroundColor(.red)
            } else if !isValidEmail(newEmail) && !newEmail.isEmpty {
                Text("Veuillez entrer une adresse email valide")
                    .foregroundColor(.orange)
            }
        }
    }

    private var passwordSection: some View {
        Section {
            SecureField("Mot de passe actuel", text: $password)
                .textContentType(.password)
                .focused($focusedField, equals: .password)
                .submitLabel(.done)
                .onSubmit {
                    if isFormValid() {
                        requestEmailChange()
                    }
                }
        } header: {
            Label("Confirmation de sécurité", systemImage: "lock.fill")
        } footer: {
            Text("Pour des raisons de sécurité, veuillez entrer votre mot de passe actuel")
        }
    }

    private var verificationSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 16) {
                Text("Un code de vérification a été envoyé à :")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Text(newEmail)
                    .font(.body.bold())
                    .foregroundColor(.blue)

                Divider()

                TextField("Code à 6 chiffres", text: $verificationCode)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .focused($focusedField, equals: .code)
                    .font(.system(.title3, design: .monospaced))
                    .multilineTextAlignment(.center)
            }
        } header: {
            Label("Code de vérification", systemImage: "number.circle.fill")
        } footer: {
            VStack(alignment: .leading, spacing: 8) {
                Text("Veuillez vérifier votre boîte de réception et entrer le code reçu")

                Button {
                    resendCode()
                } label: {
                    Text("Renvoyer le code")
                        .font(.footnote)
                        .foregroundColor(.blue)
                }
                .padding(.top, 4)
            }
        }
    }

    // MARK: - Helper Methods

    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}"
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        return emailPredicate.evaluate(with: email)
    }

    private func emailsMatch() -> Bool {
        return newEmail == confirmEmail
    }

    private func isFormValid() -> Bool {
        if showingVerification {
            return verificationCode.count == 6
        } else {
            return !newEmail.isEmpty &&
                   !confirmEmail.isEmpty &&
                   !password.isEmpty &&
                   emailsMatch() &&
                   isValidEmail(newEmail)
        }
    }

    // MARK: - Actions

    private func requestEmailChange() {
        errorMessage = nil
        isLoading = true

        Task {
            do {
                // Simulate API call for email change request
                let success = await viewModel.changeEmail(
                    newEmail: newEmail,
                    password: password
                )

                await MainActor.run {
                    isLoading = false
                    if success {
                        withAnimation {
                            showingVerification = true
                            focusedField = .code
                        }
                    } else {
                        errorMessage = "Mot de passe incorrect ou email déjà utilisé"
                    }
                }
            }
        }
    }

    private func verifyCode() {
        errorMessage = nil
        isLoading = true

        // Simulate verification
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            isLoading = false
            // In real implementation, verify the code with the backend
            if verificationCode == "123456" { // Mock validation
                dismiss()
            } else {
                errorMessage = "Code de vérification invalide"
                verificationCode = ""
                focusedField = .code
            }
        }
    }

    private func resendCode() {
        errorMessage = nil
        isLoading = true

        DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
            isLoading = false
            errorMessage = "Un nouveau code a été envoyé"
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Change Email") {
    ChangeEmailView()
}
#endif