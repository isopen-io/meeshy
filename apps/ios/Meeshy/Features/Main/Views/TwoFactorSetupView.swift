import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct TwoFactorSetupView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject var viewModel: TwoFactorViewModel

    let onComplete: () -> Void
    let onCancel: () -> Void

    enum SetupStep {
        case loading
        case showSecret(TwoFactorSetup)
        case enterCode(TwoFactorSetup)
        case showBackupCodes([String])
        case error(String)
    }

    @State private var step: SetupStep = .loading
    @State private var verificationCode = ""
    @State private var verifying = false
    @State private var codeError: String?
    @State private var copiedKey = false

    private let tfaColor = MeeshyColors.indigo500

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 20) {
                        switch step {
                        case .loading:
                            ProgressView()
                                .scaleEffect(1.2)
                                .padding(.top, 60)

                        case .showSecret(let setup):
                            secretView(setup)

                        case .enterCode(let setup):
                            codeEntryView(setup)

                        case .showBackupCodes(let codes):
                            backupCodesView(codes)

                        case .error(let message):
                            errorView(message)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                }
            }
            .navigationTitle(String(localized: "2fa_setup_title", defaultValue: "Configurer 2FA"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "2fa_cancel", defaultValue: "Annuler")) {
                        onCancel()
                    }
                    .foregroundColor(tfaColor)
                }
            }
        }
        .onAppear { initiateSetup() }
    }

    // MARK: - Secret / QR Code Step

    private func secretView(_ setup: TwoFactorSetup) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "qrcode")
                .font(.system(size: 80))
                .foregroundColor(tfaColor)
                .padding(.top, 20)

            Text(String(localized: "2fa_scan_instruction", defaultValue: "Scannez ce QR code avec votre application d'authentification"))
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)

            if let base64String = setup.qrCodeDataUrl.components(separatedBy: ",").last,
               let data = Data(base64Encoded: base64String),
               let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .interpolation(.none)
                    .scaledToFit()
                    .frame(width: 200, height: 200)
                    .background(Color.white)
                    .cornerRadius(12)
            } else {
                Image(systemName: "exclamationmark.triangle")
                    .font(.system(size: 40))
                    .foregroundColor(MeeshyColors.warning)
                    .frame(width: 200, height: 200)
            }

            VStack(spacing: 8) {
                Text(String(localized: "2fa_manual_entry_label", defaultValue: "Ou entrez cette cle manuellement :"))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textMuted)

                HStack(spacing: 8) {
                    Text(setup.otpauthUrl)
                        .font(.system(size: 14, weight: .semibold, design: .monospaced))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)

                    Button {
                        UIPasteboard.general.string = setup.otpauthUrl
                        HapticFeedback.light()
                        copiedKey = true
                        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                            copiedKey = false
                        }
                    } label: {
                        Image(systemName: copiedKey ? "checkmark" : "doc.on.doc")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(copiedKey ? MeeshyColors.success : tfaColor)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(tfaColor.opacity(0.08))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(tfaColor.opacity(0.2), lineWidth: 1)
                        )
                )
            }

            Button {
                HapticFeedback.medium()
                withAnimation { step = .enterCode(setup) }
            } label: {
                Text(String(localized: "2fa_next_button", defaultValue: "Suivant"))
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Capsule().fill(tfaColor))
            }
            .padding(.top, 8)
        }
    }

    // MARK: - Code Entry Step

    private func codeEntryView(_ setup: TwoFactorSetup) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 50))
                .foregroundColor(tfaColor)
                .padding(.top, 20)

            Text(String(localized: "2fa_enter_code_instruction", defaultValue: "Entrez le code a 6 chiffres affiche dans votre application"))
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)

            TextField(String(localized: "2fa_code_placeholder", defaultValue: "000000"), text: $verificationCode)
                .font(.system(size: 28, weight: .bold, design: .monospaced))
                .multilineTextAlignment(.center)
                .keyboardType(.numberPad)
                .foregroundColor(theme.textPrimary)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(tfaColor.opacity(0.06))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(tfaColor.opacity(0.2), lineWidth: 1)
                        )
                )
                .onChange(of: verificationCode) { _, newValue in
                    verificationCode = String(newValue.prefix(6).filter(\.isNumber))
                }

            if let codeError {
                Text(codeError)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
            }

            Button {
                HapticFeedback.medium()
                submitVerification()
            } label: {
                HStack(spacing: 8) {
                    if verifying {
                        ProgressView().scaleEffect(0.7).tint(.white)
                    }
                    Text(String(localized: "2fa_verify_button", defaultValue: "Verifier et activer"))
                        .font(.system(size: 15, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(
                    Capsule().fill(
                        verificationCode.count == 6 && !verifying
                            ? tfaColor
                            : tfaColor.opacity(0.4)
                    )
                )
            }
            .disabled(verificationCode.count != 6 || verifying)

            Button {
                HapticFeedback.light()
                withAnimation { step = .showSecret(setup) }
            } label: {
                Text(String(localized: "2fa_back_to_qr", defaultValue: "Retour au QR code"))
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(tfaColor)
            }
        }
    }

    // MARK: - Backup Codes Step

    private func backupCodesView(_ codes: [String]) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 50))
                .foregroundColor(MeeshyColors.success)
                .padding(.top, 20)

            Text(String(localized: "2fa_activated_title", defaultValue: "2FA active avec succes !"))
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Text(String(localized: "2fa_backup_codes_instruction", defaultValue: "Conservez ces codes de secours dans un endroit sur. Chaque code ne peut etre utilise qu'une seule fois."))
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 16)

            backupCodesList(codes)

            Button {
                UIPasteboard.general.string = codes.joined(separator: "\n")
                HapticFeedback.success()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "doc.on.doc.fill")
                        .font(.system(size: 13))
                    Text(String(localized: "2fa_copy_all_codes", defaultValue: "Copier tous les codes"))
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(tfaColor)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .background(
                    Capsule().fill(tfaColor.opacity(0.12))
                )
            }

            Button {
                HapticFeedback.medium()
                onComplete()
            } label: {
                Text(String(localized: "2fa_done_button", defaultValue: "Terminer"))
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Capsule().fill(tfaColor))
            }
            .padding(.top, 4)
        }
    }

    private func backupCodesList(_ codes: [String]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
            ForEach(codes, id: \.self) { code in
                Text(code)
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundColor(theme.textPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(tfaColor.opacity(0.06))
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(tfaColor.opacity(0.15), lineWidth: 1)
                            )
                    )
            }
        }
        .padding(.horizontal, 8)
    }

    // MARK: - Error Step

    private func errorView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 50))
                .foregroundColor(MeeshyColors.error)
                .padding(.top, 40)

            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)

            Button {
                HapticFeedback.light()
                initiateSetup()
            } label: {
                Text(String(localized: "2fa_retry", defaultValue: "Reessayer"))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(tfaColor)
            }
        }
    }

    // MARK: - Actions

    private func initiateSetup() {
        step = .loading
        Task {
            await viewModel.beginSetup()
            if let setup = viewModel.setupData {
                step = .showSecret(setup)
            } else {
                step = .error(viewModel.error ?? "Impossible de demarrer la configuration 2FA")
            }
        }
    }

    private func submitVerification() {
        verifying = true
        codeError = nil
        Task {
            await viewModel.enable(code: verificationCode)
            if !viewModel.recoveryCodes.isEmpty {
                HapticFeedback.success()
                withAnimation { step = .showBackupCodes(viewModel.recoveryCodes) }
            } else {
                HapticFeedback.error()
                codeError = viewModel.error ?? "Code invalide. Verifiez et reessayez."
                viewModel.clearError()
            }
            verifying = false
        }
    }
}

// MARK: - Two-Factor Disable View

struct TwoFactorDisableView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject var viewModel: TwoFactorViewModel

    let onComplete: () -> Void
    let onCancel: () -> Void

    @State private var disableCode = ""
    @State private var disablePassword = ""
    @State private var disabling = false
    @State private var disableError: String?

    private let tfaColor = MeeshyColors.indigo500

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                VStack(spacing: 20) {
                    Image(systemName: "shield.slash.fill")
                        .font(.system(size: 50))
                        .foregroundColor(MeeshyColors.error)
                        .padding(.top, 40)

                    Text(String(localized: "2fa_disable_title", defaultValue: "Desactiver l'authentification a deux facteurs"))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                        .multilineTextAlignment(.center)

                    Text(String(localized: "2fa_disable_warning", defaultValue: "Votre compte sera moins securise sans 2FA. Entrez votre mot de passe et votre code pour confirmer."))
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 20)

                    SecureField(String(localized: "2fa_password_placeholder", defaultValue: "Mot de passe"), text: $disablePassword)
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .padding(.vertical, 14)
                        .padding(.horizontal, 16)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(MeeshyColors.error.opacity(0.06))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(MeeshyColors.error.opacity(0.2), lineWidth: 1)
                                )
                        )
                        .padding(.horizontal, 16)

                    TextField(String(localized: "2fa_code_placeholder", defaultValue: "000000"), text: $disableCode)
                        .font(.system(size: 28, weight: .bold, design: .monospaced))
                        .multilineTextAlignment(.center)
                        .keyboardType(.numberPad)
                        .foregroundColor(theme.textPrimary)
                        .padding(.vertical, 14)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(MeeshyColors.error.opacity(0.06))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(MeeshyColors.error.opacity(0.2), lineWidth: 1)
                                )
                        )
                        .padding(.horizontal, 16)
                        .onChange(of: disableCode) { _, newValue in
                            disableCode = String(newValue.prefix(6).filter(\.isNumber))
                        }

                    if let disableError {
                        Text(disableError)
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(MeeshyColors.error)
                    }

                    Button {
                        HapticFeedback.medium()
                        submitDisable()
                    } label: {
                        HStack(spacing: 8) {
                            if disabling {
                                ProgressView().scaleEffect(0.7).tint(.white)
                            }
                            Text(String(localized: "2fa_confirm_disable", defaultValue: "Confirmer la desactivation"))
                                .font(.system(size: 15, weight: .bold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(
                            Capsule().fill(
                                disableCode.count == 6 && !disablePassword.isEmpty && !disabling
                                    ? MeeshyColors.error
                                    : MeeshyColors.error.opacity(0.4)
                            )
                        )
                    }
                    .disabled(disableCode.count != 6 || disablePassword.isEmpty || disabling)
                    .padding(.horizontal, 16)

                    Spacer()
                }
            }
            .navigationTitle(String(localized: "2fa_disable_nav_title", defaultValue: "Desactiver 2FA"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "2fa_cancel", defaultValue: "Annuler")) {
                        onCancel()
                    }
                    .foregroundColor(tfaColor)
                }
            }
        }
    }

    private func submitDisable() {
        disabling = true
        disableError = nil
        Task {
            await viewModel.disable(code: disableCode, password: disablePassword)
            if !viewModel.isEnabled {
                HapticFeedback.success()
                onComplete()
            } else {
                HapticFeedback.error()
                disableError = viewModel.error ?? "Code invalide. Verifiez et reessayez."
                viewModel.clearError()
            }
            disabling = false
        }
    }
}

// MARK: - Two-Factor Backup Codes View

struct TwoFactorBackupCodesView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject var viewModel: TwoFactorViewModel

    let onDismiss: () -> Void

    @State private var verificationCode = ""
    @State private var codeSubmitted = false

    private let tfaColor = MeeshyColors.indigo500

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                ScrollView(showsIndicators: false) {
                    VStack(spacing: 16) {
                        if !codeSubmitted {
                            codeEntryStep
                        } else if viewModel.isLoading {
                            ProgressView()
                                .scaleEffect(1.2)
                                .padding(.top, 60)
                        } else if let error = viewModel.error {
                            VStack(spacing: 12) {
                                Image(systemName: "exclamationmark.triangle.fill")
                                    .font(.system(size: 40))
                                    .foregroundColor(MeeshyColors.error)
                                    .padding(.top, 40)

                                Text(error)
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(theme.textSecondary)

                                Button {
                                    HapticFeedback.light()
                                    codeSubmitted = false
                                    verificationCode = ""
                                    viewModel.clearError()
                                } label: {
                                    Text(String(localized: "2fa_retry", defaultValue: "Reessayer"))
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(tfaColor)
                                }
                            }
                        } else {
                            Image(systemName: "key.fill")
                                .font(.system(size: 40))
                                .foregroundColor(tfaColor)
                                .padding(.top, 20)

                            Text(String(localized: "2fa_backup_codes_warning", defaultValue: "Ces codes remplacent les precedents. Conservez-les en lieu sur."))
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(theme.textSecondary)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 16)

                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                                ForEach(viewModel.recoveryCodes, id: \.self) { code in
                                    Text(code)
                                        .font(.system(size: 14, weight: .semibold, design: .monospaced))
                                        .foregroundColor(theme.textPrimary)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 8)
                                        .background(
                                            RoundedRectangle(cornerRadius: 8)
                                                .fill(tfaColor.opacity(0.06))
                                                .overlay(
                                                    RoundedRectangle(cornerRadius: 8)
                                                        .stroke(tfaColor.opacity(0.15), lineWidth: 1)
                                                )
                                        )
                                }
                            }
                            .padding(.horizontal, 8)

                            Button {
                                UIPasteboard.general.string = viewModel.recoveryCodes.joined(separator: "\n")
                                HapticFeedback.success()
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "doc.on.doc.fill")
                                        .font(.system(size: 13))
                                    Text(String(localized: "2fa_copy_all_codes", defaultValue: "Copier tous les codes"))
                                        .font(.system(size: 14, weight: .semibold))
                                }
                                .foregroundColor(tfaColor)
                                .padding(.horizontal, 20)
                                .padding(.vertical, 10)
                                .background(
                                    Capsule().fill(tfaColor.opacity(0.12))
                                )
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                }
            }
            .navigationTitle(String(localized: "2fa_backup_codes_title", defaultValue: "Codes de secours"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "2fa_close", defaultValue: "Fermer")) {
                        onDismiss()
                    }
                    .foregroundColor(tfaColor)
                }
            }
        }
    }

    private var codeEntryStep: some View {
        VStack(spacing: 16) {
            Image(systemName: "lock.shield.fill")
                .font(.system(size: 50))
                .foregroundColor(tfaColor)
                .padding(.top, 40)

            Text(String(localized: "2fa_backup_code_verify", defaultValue: "Entrez votre code 2FA pour generer de nouveaux codes de secours"))
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)

            TextField(String(localized: "2fa_code_placeholder", defaultValue: "000000"), text: $verificationCode)
                .font(.system(size: 28, weight: .bold, design: .monospaced))
                .multilineTextAlignment(.center)
                .keyboardType(.numberPad)
                .foregroundColor(theme.textPrimary)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(tfaColor.opacity(0.06))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(tfaColor.opacity(0.2), lineWidth: 1)
                        )
                )
                .onChange(of: verificationCode) { _, newValue in
                    verificationCode = String(newValue.prefix(6).filter(\.isNumber))
                }

            Button {
                HapticFeedback.medium()
                loadCodes()
            } label: {
                Text(String(localized: "2fa_generate_codes", defaultValue: "Generer les codes"))
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(
                        Capsule().fill(
                            verificationCode.count == 6
                                ? tfaColor
                                : tfaColor.opacity(0.4)
                        )
                    )
            }
            .disabled(verificationCode.count != 6)
        }
    }

    private func loadCodes() {
        codeSubmitted = true
        Task {
            await viewModel.getBackupCodes(code: verificationCode)
        }
    }
}
