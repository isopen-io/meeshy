import SwiftUI
import MeeshySDK

struct ConversationLockSheet: View {
    enum Mode {
        case setPassword
        case verifyPassword
        case removePassword
    }

    let mode: Mode
    let conversationId: String
    let conversationName: String
    let onSuccess: () -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: ThemeManager

    @State private var password = ""
    @State private var confirmPassword = ""
    @State private var errorMessage: String?
    @State private var isShaking = false

    private let lockManager = ConversationLockManager.shared

    var body: some View {
        VStack(spacing: 24) {
            // Icon
            Image(systemName: mode == .removePassword ? "lock.open.fill" : "lock.fill")
                .font(.system(size: 40))
                .foregroundStyle(
                    LinearGradient(
                        colors: [MeeshyColors.coral, MeeshyColors.purple],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .padding(.top, 20)

            // Title
            Text(titleText)
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Text(conversationName)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textMuted)

            // Password field
            VStack(spacing: 12) {
                SecureField("Mot de passe", text: $password)
                    .textFieldStyle(.plain)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(.ultraThinMaterial)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(errorMessage != nil ? Color.red.opacity(0.5) : theme.inputBorder, lineWidth: 1)
                            )
                    )
                    .offset(x: isShaking ? -8 : 0)

                if mode == .setPassword {
                    SecureField("Confirmer le mot de passe", text: $confirmPassword)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(.ultraThinMaterial)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(errorMessage != nil ? Color.red.opacity(0.5) : theme.inputBorder, lineWidth: 1)
                                )
                        )
                }
            }
            .padding(.horizontal, 24)

            if let error = errorMessage {
                Text(error)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.red)
            }

            // Action button
            Button {
                handleAction()
            } label: {
                Text(buttonText)
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(
                                LinearGradient(
                                    colors: [MeeshyColors.coral, MeeshyColors.purple],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                    )
            }
            .padding(.horizontal, 24)
            .disabled(password.isEmpty)
            .opacity(password.isEmpty ? 0.5 : 1)

            Spacer()
        }
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    private var titleText: String {
        switch mode {
        case .setPassword: return "Verrouiller la conversation"
        case .verifyPassword: return "Conversation verrouillée"
        case .removePassword: return "Déverrouiller la conversation"
        }
    }

    private var buttonText: String {
        switch mode {
        case .setPassword: return "Verrouiller"
        case .verifyPassword: return "Ouvrir"
        case .removePassword: return "Supprimer le verrou"
        }
    }

    private func handleAction() {
        errorMessage = nil

        switch mode {
        case .setPassword:
            guard password.count >= 4 else {
                showError("Minimum 4 caractères")
                return
            }
            guard password == confirmPassword else {
                showError("Les mots de passe ne correspondent pas")
                return
            }
            lockManager.setLock(conversationId: conversationId, password: password)
            HapticFeedback.success()
            onSuccess()
            dismiss()

        case .verifyPassword:
            if lockManager.verifyPassword(conversationId: conversationId, password: password) {
                HapticFeedback.success()
                onSuccess()
                dismiss()
            } else {
                showError("Mot de passe incorrect")
            }

        case .removePassword:
            if lockManager.verifyPassword(conversationId: conversationId, password: password) {
                lockManager.removeLock(conversationId: conversationId)
                HapticFeedback.success()
                onSuccess()
                dismiss()
            } else {
                showError("Mot de passe incorrect")
            }
        }
    }

    private func showError(_ message: String) {
        errorMessage = message
        HapticFeedback.error()
        withAnimation(.default.repeatCount(3, autoreverses: true).speed(6)) {
            isShaking = true
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            isShaking = false
        }
    }
}
