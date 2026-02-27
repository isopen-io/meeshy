import SwiftUI
import MeeshySDK

struct ConversationLockSheet: View {
    enum Mode {
        case setupMasterPin           // Settings: entrer 6ch → confirmer 6ch → setMasterPin
        case changeMasterPin          // Settings: vérifier 6ch → entrer nouveau 6ch → confirmer
        case removeMasterPin          // Settings: vérifier 6ch → forceRemoveMasterPin
        case lockConversation         // Menu: vérifier master 6ch → entrer 4ch → confirmer 4ch
        case unlockConversation       // Menu: entrer 4ch → removeLock
        case openConversation         // Tap: entrer 4ch → onSuccess()
        case unlockAll                // Settings: vérifier master 6ch → removeAllLocks
    }

    let mode: Mode
    let conversationId: String?
    let conversationName: String
    let onSuccess: () -> Void

    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var theme: ThemeManager

    @State private var pin: String = ""
    @State private var confirmPin: String = ""
    @State private var step: Int = 0
    @State private var errorMessage: String?
    @State private var shakeOffset: CGFloat = 0

    private let lockManager = ConversationLockManager.shared

    // MARK: - Computed PIN length

    private var pinLength: Int {
        switch mode {
        case .setupMasterPin, .removeMasterPin, .unlockAll:
            return 6
        case .changeMasterPin:
            return 6
        case .lockConversation:
            return step == 0 ? 6 : 4
        case .unlockConversation, .openConversation:
            return 4
        }
    }

    private var currentPin: String { step == 2 ? confirmPin : pin }

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
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: step)
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

    // MARK: - Titles

    private var iconName: String {
        switch mode {
        case .setupMasterPin:
            return step == 2 ? "lock.shield.fill" : "lock.fill"
        case .changeMasterPin:
            return step == 0 ? "lock.fill" : (step == 2 ? "lock.shield.fill" : "lock.rotation")
        case .removeMasterPin:
            return "lock.open.fill"
        case .lockConversation:
            return step == 2 ? "lock.shield.fill" : "lock.fill"
        case .unlockConversation:
            return "lock.open.fill"
        case .openConversation:
            return "lock.fill"
        case .unlockAll:
            return "lock.open.fill"
        }
    }

    private var titleText: String {
        switch mode {
        case .setupMasterPin:
            return step == 0 ? "Créer le master PIN" : "Confirmer le master PIN"
        case .changeMasterPin:
            if step == 0 { return "Vérifier le master PIN" }
            if step == 1 { return "Nouveau master PIN" }
            return "Confirmer le nouveau PIN"
        case .removeMasterPin:
            return "Supprimer le master PIN"
        case .lockConversation:
            if step == 0 { return "Vérifier le master PIN" }
            if step == 1 { return "Code de la conversation" }
            return "Confirmer le code"
        case .unlockConversation:
            return "Déverrouiller"
        case .openConversation:
            return "Conversation verrouillée"
        case .unlockAll:
            return "Déverrouiller tout"
        }
    }

    private var subtitleText: String {
        switch mode {
        case .setupMasterPin:
            if step == 0 { return "Choisissez un master PIN à 6 chiffres pour sécuriser vos verrous" }
            return "Saisissez à nouveau votre master PIN pour confirmer"
        case .changeMasterPin:
            if step == 0 { return "Saisissez votre master PIN actuel" }
            if step == 1 { return "Choisissez un nouveau master PIN à 6 chiffres" }
            return "Confirmez votre nouveau master PIN"
        case .removeMasterPin:
            return "Saisissez votre master PIN pour confirmer la suppression"
        case .lockConversation:
            if step == 0 { return "Saisissez votre master PIN pour autoriser le verrouillage" }
            if step == 1 { return "Choisissez un code à 4 chiffres pour \(conversationName)" }
            return "Confirmez le code pour \(conversationName)"
        case .unlockConversation:
            return "Saisissez le code de \(conversationName) pour le déverrouiller"
        case .openConversation:
            return "Saisissez le code pour accéder à \(conversationName)"
        case .unlockAll:
            return "Saisissez votre master PIN pour déverrouiller toutes les conversations"
        }
    }

    // MARK: - Input logic

    private func appendDigit(_ digit: Int) {
        guard currentPin.count < pinLength else { return }
        errorMessage = nil
        if step == 2 {
            confirmPin += "\(digit)"
            if confirmPin.count == pinLength { handleComplete() }
        } else {
            pin += "\(digit)"
            if pin.count == pinLength { handleComplete() }
        }
    }

    private func deleteLastDigit() {
        if step == 2 {
            if !confirmPin.isEmpty { confirmPin.removeLast() }
        } else {
            if !pin.isEmpty { pin.removeLast() }
        }
    }

    private func handleComplete() {
        switch mode {

        case .setupMasterPin:
            if step == 0 {
                withAnimation { step = 2 }
            } else {
                guard pin == confirmPin else { return shakeAndReset("Les PIN ne correspondent pas") }
                lockManager.setMasterPin(pin)
                HapticFeedback.success()
                onSuccess()
                dismiss()
            }

        case .changeMasterPin:
            if step == 0 {
                guard lockManager.verifyMasterPin(pin) else { return shakeAndReset("Master PIN incorrect") }
                withAnimation { step = 1; pin = "" }
            } else if step == 1 {
                withAnimation { step = 2 }
            } else {
                guard pin == confirmPin else { return shakeAndReset("Les PIN ne correspondent pas") }
                lockManager.setMasterPin(pin)
                HapticFeedback.success()
                onSuccess()
                dismiss()
            }

        case .removeMasterPin:
            guard lockManager.verifyMasterPin(pin) else { return shakeAndReset("Master PIN incorrect") }
            lockManager.forceRemoveMasterPin()
            HapticFeedback.success()
            onSuccess()
            dismiss()

        case .lockConversation:
            if step == 0 {
                guard lockManager.verifyMasterPin(pin) else { return shakeAndReset("Master PIN incorrect") }
                withAnimation { step = 1; pin = "" }
            } else if step == 1 {
                withAnimation { step = 2 }
            } else {
                guard pin == confirmPin else { return shakeAndReset("Les codes ne correspondent pas") }
                guard let id = conversationId else { return }
                lockManager.setLock(conversationId: id, pin: pin)
                HapticFeedback.success()
                onSuccess()
                dismiss()
            }

        case .unlockConversation:
            guard let id = conversationId else { return }
            guard lockManager.verifyLock(conversationId: id, pin: pin) else {
                return shakeAndReset("Code incorrect")
            }
            lockManager.removeLock(conversationId: id)
            HapticFeedback.success()
            onSuccess()
            dismiss()

        case .openConversation:
            guard let id = conversationId else { return }
            guard lockManager.verifyLock(conversationId: id, pin: pin) else {
                return shakeAndReset("Code incorrect")
            }
            HapticFeedback.success()
            onSuccess()
            dismiss()

        case .unlockAll:
            guard lockManager.verifyMasterPin(pin) else { return shakeAndReset("Master PIN incorrect") }
            lockManager.removeAllLocks()
            HapticFeedback.success()
            onSuccess()
            dismiss()
        }
    }

    private func shakeAndReset(_ message: String) {
        errorMessage = message
        HapticFeedback.error()
        withAnimation(.default.repeatCount(4, autoreverses: true).speed(8)) {
            shakeOffset = 8
        }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 450_000_000)
            shakeOffset = 0
            pin = ""
            confirmPin = ""
            if step == 2 { step = 1 }
        }
    }
}
