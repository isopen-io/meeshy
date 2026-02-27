import SwiftUI
import MeeshySDK

struct ConversationLockSheet: View {
    enum Mode {
        case setPassword       // Set global PIN + optionally lock conversationId
        case verifyPassword    // Verify global PIN (opens conversation)
        case removePassword    // Verify global PIN + remove conversation lock
        case removeGlobalPin   // Verify global PIN + delete global PIN (Security settings)
    }

    let mode: Mode
    let conversationId: String?
    let conversationName: String
    let onSuccess: () -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: ThemeManager

    @State private var pin: String = ""
    @State private var confirmPin: String = ""
    @State private var isConfirming: Bool = false
    @State private var errorMessage: String?
    @State private var shakeOffset: CGFloat = 0

    private let lockManager = ConversationLockManager.shared
    private let pinLength = 4

    // MARK: - Body

    var body: some View {
        VStack(spacing: 28) {
            headerSection
            dotsRow
            if let error = errorMessage {
                Text(error)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.red)
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
            numpad
            Spacer()
        }
        .presentationDetents([.height(500)])
        .presentationDragIndicator(.visible)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: errorMessage)
    }

    // MARK: - Header

    private var headerSection: some View {
        VStack(spacing: 8) {
            Image(systemName: iconName)
                .font(.system(size: 44))
                .foregroundStyle(
                    LinearGradient(
                        colors: [MeeshyColors.coral, MeeshyColors.purple],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .padding(.top, 24)

            Text(titleText)
                .font(.system(size: 18, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Text(subtitleText)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textMuted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
    }

    // MARK: - Dots

    private var dotsRow: some View {
        HStack(spacing: 20) {
            ForEach(0..<pinLength, id: \.self) { index in
                Circle()
                    .fill(
                        index < currentPin.count
                            ? AnyShapeStyle(LinearGradient(
                                colors: [MeeshyColors.coral, MeeshyColors.purple],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ))
                            : AnyShapeStyle(theme.textMuted.opacity(0.25))
                    )
                    .frame(width: 18, height: 18)
                    .scaleEffect(index < currentPin.count ? 1.15 : 1.0)
                    .animation(.spring(response: 0.2, dampingFraction: 0.6), value: currentPin.count)
            }
        }
        .offset(x: shakeOffset)
        .padding(.vertical, 4)
    }

    // MARK: - Numpad

    private var numpad: some View {
        VStack(spacing: 14) {
            ForEach([[1, 2, 3], [4, 5, 6], [7, 8, 9]], id: \.self) { row in
                HStack(spacing: 20) {
                    ForEach(row, id: \.self) { digit in
                        numpadKey(digit: digit)
                    }
                }
            }
            HStack(spacing: 20) {
                Color.clear.frame(width: 76, height: 76)
                numpadKey(digit: 0)
                Button {
                    HapticFeedback.light()
                    deleteLastDigit()
                } label: {
                    Image(systemName: "delete.left.fill")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .frame(width: 76, height: 76)
                }
                .opacity(currentPin.isEmpty ? 0.3 : 1.0)
                .animation(.easeInOut(duration: 0.15), value: currentPin.isEmpty)
            }
        }
    }

    private func numpadKey(digit: Int) -> some View {
        Button {
            HapticFeedback.light()
            appendDigit(digit)
        } label: {
            Text("\(digit)")
                .font(.system(size: 26, weight: .medium, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .frame(width: 76, height: 76)
                .background(
                    Circle()
                        .fill(theme.mode.isDark
                              ? Color.white.opacity(0.09)
                              : Color.black.opacity(0.06))
                )
        }
        .disabled(currentPin.count >= pinLength)
    }

    // MARK: - Computed

    private var currentPin: String { isConfirming ? confirmPin : pin }

    private var iconName: String {
        switch mode {
        case .setPassword:       return isConfirming ? "lock.shield.fill" : "lock.fill"
        case .verifyPassword:    return "lock.fill"
        case .removePassword:    return "lock.open.fill"
        case .removeGlobalPin:   return "lock.open.fill"
        }
    }

    private var titleText: String {
        switch mode {
        case .setPassword:     return isConfirming ? "Confirmer le PIN" : "Choisir un PIN"
        case .verifyPassword:  return "Conversation verrouillée"
        case .removePassword:  return "Déverrouiller"
        case .removeGlobalPin: return "Supprimer le PIN"
        }
    }

    private var subtitleText: String {
        switch mode {
        case .setPassword:
            if isConfirming { return "Saisissez à nouveau votre PIN pour confirmer" }
            if conversationId != nil {
                return "PIN à 4 chiffres pour verrouiller \(conversationName)"
            }
            return "Choisissez un PIN à 4 chiffres pour sécuriser vos conversations"
        case .verifyPassword:
            return "Saisissez votre PIN pour accéder à \(conversationName)"
        case .removePassword:
            return "Saisissez votre PIN pour déverrouiller \(conversationName)"
        case .removeGlobalPin:
            return "Saisissez votre PIN pour confirmer la suppression"
        }
    }

    // MARK: - Logic

    private func appendDigit(_ digit: Int) {
        guard currentPin.count < pinLength else { return }
        errorMessage = nil
        if isConfirming {
            confirmPin += "\(digit)"
            if confirmPin.count == pinLength { handleConfirmComplete() }
        } else {
            pin += "\(digit)"
            if pin.count == pinLength { handlePinComplete() }
        }
    }

    private func deleteLastDigit() {
        if isConfirming {
            if !confirmPin.isEmpty { confirmPin.removeLast() }
        } else {
            if !pin.isEmpty { pin.removeLast() }
        }
    }

    private func handlePinComplete() {
        switch mode {
        case .setPassword:
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                isConfirming = true
            }

        case .verifyPassword:
            if lockManager.verifyGlobalPin(pin) {
                HapticFeedback.success()
                onSuccess()
                dismiss()
            } else {
                shakeAndReset("PIN incorrect")
            }

        case .removePassword:
            if lockManager.verifyGlobalPin(pin) {
                if let id = conversationId { lockManager.removeLock(conversationId: id) }
                HapticFeedback.success()
                onSuccess()
                dismiss()
            } else {
                shakeAndReset("PIN incorrect")
            }

        case .removeGlobalPin:
            if lockManager.verifyGlobalPin(pin) {
                lockManager.removeGlobalPin()
                HapticFeedback.success()
                onSuccess()
                dismiss()
            } else {
                shakeAndReset("PIN incorrect")
            }
        }
    }

    private func handleConfirmComplete() {
        guard pin == confirmPin else {
            shakeAndReset("Les PIN ne correspondent pas")
            return
        }
        lockManager.setGlobalPin(pin)
        if let id = conversationId { lockManager.setLock(conversationId: id) }
        HapticFeedback.success()
        onSuccess()
        dismiss()
    }

    private func shakeAndReset(_ message: String) {
        errorMessage = message
        HapticFeedback.error()
        withAnimation(.default.repeatCount(4, autoreverses: true).speed(8)) {
            shakeOffset = 8
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
            shakeOffset = 0
            pin = ""
            confirmPin = ""
            isConfirming = false
        }
    }
}
