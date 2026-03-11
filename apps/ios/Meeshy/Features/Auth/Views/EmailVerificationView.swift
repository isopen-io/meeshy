import SwiftUI
import MeeshySDK
import MeeshyUI

struct EmailVerificationView: View {
    @StateObject private var viewModel: EmailVerificationViewModel
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""

    init(email: String, authService: AuthServiceProviding = AuthService.shared) {
        _viewModel = StateObject(wrappedValue: EmailVerificationViewModel(
            email: email,
            authService: authService
        ))
    }

    private var isCodeComplete: Bool { code.count == 6 }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundPrimary.ignoresSafeArea()

                VStack(spacing: 28) {
                    Spacer()
                    headerIcon
                    titleSection
                    subtitleSection
                    codeField
                    errorView
                    verifyButton
                    resendSection
                    Spacer()
                    Spacer()
                }
                .padding(.horizontal, 24)

                successOverlay
            }
            .navigationTitle(String(localized: "emailVerification.nav.title", defaultValue: "Verification de l'email"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "emailVerification.nav.close", defaultValue: "Fermer")) {
                        dismiss()
                    }
                    .foregroundStyle(MeeshyColors.indigo400)
                }
            }
        }
    }

    // MARK: - Header Icon

    private var headerIcon: some View {
        ZStack {
            Circle()
                .fill(MeeshyColors.indigo500.opacity(0.12))
                .frame(width: 96, height: 96)

            Image(systemName: "envelope.open.fill")
                .font(.system(size: 42, weight: .medium))
                .foregroundStyle(MeeshyColors.brandGradient)
        }
    }

    // MARK: - Title

    private var titleSection: some View {
        Text(String(localized: "emailVerification.title", defaultValue: "Verifiez votre email"))
            .font(.system(size: 26, weight: .bold, design: .rounded))
            .foregroundStyle(theme.textPrimary)
    }

    // MARK: - Subtitle

    private var subtitleSection: some View {
        Text(String(localized: "emailVerification.subtitle", defaultValue: "Entrez le code a 6 chiffres envoye a **\(viewModel.email)**"))
            .font(.subheadline)
            .multilineTextAlignment(.center)
            .foregroundStyle(theme.textSecondary)
            .padding(.horizontal, 16)
    }

    // MARK: - Code Field

    private var codeField: some View {
        TextField(
            String(localized: "emailVerification.codePlaceholder", defaultValue: "000000"),
            text: $code
        )
        .keyboardType(.numberPad)
        .textContentType(.oneTimeCode)
        .font(.system(size: 32, weight: .semibold, design: .monospaced))
        .multilineTextAlignment(.center)
        .padding(.vertical, 14)
        .padding(.horizontal, 24)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.inputBackground)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(isCodeComplete ? MeeshyColors.indigo500 : theme.inputBorder, lineWidth: 1.5)
        )
        .padding(.horizontal, 32)
        .onChange(of: code) { _, newValue in
            let filtered = newValue.filter(\.isNumber)
            let limited = String(filtered.prefix(6))
            if limited != newValue {
                code = limited
            }
        }
        .disabled(viewModel.isVerifying || viewModel.verificationSuccess)
    }

    // MARK: - Error View

    @ViewBuilder
    private var errorView: some View {
        if let errorMessage = viewModel.error {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 14))
                Text(errorMessage)
                    .font(.system(size: 14, weight: .medium))
            }
            .foregroundStyle(MeeshyColors.error)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(MeeshyColors.error.opacity(0.1))
            )
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
    }

    // MARK: - Verify Button

    private var verifyButton: some View {
        Button {
            Task { await viewModel.verifyCode(code) }
        } label: {
            HStack(spacing: 8) {
                if viewModel.isVerifying {
                    ProgressView()
                        .controlSize(.small)
                        .tint(.white)
                } else {
                    Text(String(localized: "emailVerification.verifyButton", defaultValue: "Verifier"))
                }
            }
            .font(.headline)
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(isCodeComplete && !viewModel.isVerifying
                          ? AnyShapeStyle(MeeshyColors.brandGradient)
                          : AnyShapeStyle(MeeshyColors.indigo500.opacity(0.3)))
            )
        }
        .disabled(!isCodeComplete || viewModel.isVerifying || viewModel.verificationSuccess)
        .padding(.horizontal, 8)
    }

    // MARK: - Resend Section

    private var resendSection: some View {
        VStack(spacing: 8) {
            Text(String(localized: "emailVerification.noCode", defaultValue: "Vous n'avez pas recu le code ?"))
                .font(.footnote)
                .foregroundStyle(theme.textSecondary)

            Button {
                Task { await viewModel.resendCode() }
            } label: {
                HStack(spacing: 6) {
                    if viewModel.isResending {
                        ProgressView()
                            .controlSize(.small)
                            .tint(MeeshyColors.indigo400)
                    } else if viewModel.resendSuccess {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundStyle(MeeshyColors.success)
                        Text(String(localized: "emailVerification.resendConfirmed", defaultValue: "Code renvoye !"))
                            .foregroundStyle(MeeshyColors.success)
                    } else {
                        Image(systemName: "arrow.clockwise")
                        Text(String(localized: "emailVerification.resendButton", defaultValue: "Renvoyer le code"))
                    }
                }
                .font(.subheadline.weight(.medium))
                .foregroundStyle(MeeshyColors.indigo400)
            }
            .disabled(viewModel.isResending || viewModel.resendSuccess)
        }
    }

    // MARK: - Success Overlay

    @ViewBuilder
    private var successOverlay: some View {
        if viewModel.verificationSuccess {
            ZStack {
                theme.backgroundPrimary.opacity(0.9)
                    .ignoresSafeArea()

                VStack(spacing: 20) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 72))
                        .foregroundStyle(MeeshyColors.success)
                        .symbolEffect(.bounce, value: viewModel.verificationSuccess)

                    Text(String(localized: "emailVerification.success", defaultValue: "Email verifie !"))
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundStyle(theme.textPrimary)
                }
            }
            .transition(.opacity)
            .animation(.easeInOut(duration: 0.3), value: viewModel.verificationSuccess)
        }
    }
}
