//
//  ChangePhoneView.swift
//  Meeshy
//
//  Secure phone number change flow
//  iOS 16+
//

import SwiftUI

struct ChangePhoneView: View {
    // MARK: - Properties

    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = ProfileViewModel()
    @State private var newPhone = ""
    @State private var confirmPhone = ""
    @State private var password = ""
    @State private var verificationCode = ""
    @State private var showingVerification = false
    @State private var isLoading = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?

    enum Field {
        case phone
        case confirmPhone
        case password
        case code
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            Form {
                if !showingVerification {
                    phoneSection
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
            .navigationTitle(showingVerification ? "Vérifier le numéro" : "Changer le téléphone")
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
                            requestPhoneChange()
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
                            Text(showingVerification ? "Vérification..." : "Envoi du code SMS...")
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

    private var phoneSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                // Current phone display
                VStack(alignment: .leading, spacing: 4) {
                    Text("Numéro actuel")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(viewModel.user?.phoneNumber ?? "Non renseigné")
                        .font(.body)
                        .foregroundColor(.primary)
                }
                .padding(.vertical, 4)

                Divider()

                // New phone input
                TextField("Nouveau numéro", text: $newPhone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .focused($focusedField, equals: .phone)
                    .submitLabel(.next)
                    .onChange(of: newPhone) { _, newValue in
                        newPhone = formatPhoneNumber(newValue)
                    }

                // Confirm phone input
                TextField("Confirmer le nouveau numéro", text: $confirmPhone)
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .focused($focusedField, equals: .confirmPhone)
                    .submitLabel(.next)
                    .onChange(of: confirmPhone) { _, newValue in
                        confirmPhone = formatPhoneNumber(newValue)
                    }
            }
        } header: {
            Label("Nouveau numéro de téléphone", systemImage: "phone.fill")
        } footer: {
            if !phonesMatch() && !confirmPhone.isEmpty {
                Text("Les numéros ne correspondent pas")
                    .foregroundColor(.red)
            } else if !isValidPhone(newPhone) && !newPhone.isEmpty {
                Text("Veuillez entrer un numéro de téléphone valide")
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
                        requestPhoneChange()
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
                Text("Un code de vérification a été envoyé par SMS à :")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Text(newPhone)
                    .font(.body.bold())
                    .foregroundColor(.green)

                Divider()

                TextField("Code à 6 chiffres", text: $verificationCode)
                    .keyboardType(.numberPad)
                    .textContentType(.oneTimeCode)
                    .focused($focusedField, equals: .code)
                    .font(.system(.title3, design: .monospaced))
                    .multilineTextAlignment(.center)
                    .onChange(of: verificationCode) { _, newValue in
                        // Limit to 6 digits
                        verificationCode = String(newValue.filter { $0.isNumber }.prefix(6))
                    }
            }
        } header: {
            Label("Code de vérification", systemImage: "number.circle.fill")
        } footer: {
            VStack(alignment: .leading, spacing: 8) {
                Text("Veuillez vérifier vos SMS et entrer le code reçu")

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

    private func formatPhoneNumber(_ number: String) -> String {
        // Keep only digits and + for international format
        let filtered = number.filter { $0.isNumber || $0 == "+" }
        return filtered
    }

    private func isValidPhone(_ phone: String) -> Bool {
        // Basic phone validation: at least 8 digits
        let digits = phone.filter { $0.isNumber }
        return digits.count >= 8 && digits.count <= 15
    }

    private func phonesMatch() -> Bool {
        return newPhone == confirmPhone
    }

    private func isFormValid() -> Bool {
        if showingVerification {
            return verificationCode.count == 6
        } else {
            return !newPhone.isEmpty &&
                   !confirmPhone.isEmpty &&
                   !password.isEmpty &&
                   phonesMatch() &&
                   isValidPhone(newPhone)
        }
    }

    // MARK: - Actions

    private func requestPhoneChange() {
        errorMessage = nil
        isLoading = true

        Task {
            // Simulate API call for phone change request
            let success = await viewModel.changePhoneNumber(
                newPhone: newPhone,
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
                    errorMessage = "Mot de passe incorrect ou numéro déjà utilisé"
                }
            }
        }
    }

    private func verifyCode() {
        errorMessage = nil
        isLoading = true

        Task {
            // Simulate verification API call
            let success = await viewModel.verifyPhoneChangeCode(code: verificationCode)

            await MainActor.run {
                isLoading = false
                if success {
                    dismiss()
                } else {
                    errorMessage = "Code de vérification invalide"
                    verificationCode = ""
                    focusedField = .code
                }
            }
        }
    }

    private func resendCode() {
        errorMessage = nil
        isLoading = true

        Task {
            // Simulate resend API call
            try? await Task.sleep(for: .seconds(1))

            await MainActor.run {
                isLoading = false
                errorMessage = "Un nouveau code a été envoyé par SMS"
            }
        }
    }
}

// MARK: - Preview

#if DEBUG
#Preview("Change Phone") {
    ChangePhoneView()
}
#endif
