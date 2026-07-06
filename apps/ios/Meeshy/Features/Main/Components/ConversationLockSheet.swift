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
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(MeeshyColors.error)
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
                // doctrine 84i — glyphe hero décoratif ≥40pt (le titre porte le sens)
                .font(.system(size: 44))
                .foregroundStyle(
                    LinearGradient(
                        colors: [MeeshyColors.error, MeeshyColors.indigo600],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .padding(.top, 24)
                .accessibilityHidden(true)

            Text(titleText)
                .font(.headline)
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)

            Text(subtitleText)
                .font(.footnote.weight(.medium))
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
                                colors: [MeeshyColors.error, MeeshyColors.indigo600],
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
                        // doctrine 82i — glyphe borné par la touche fixe 76×76 du pavé
                        .font(.system(size: 22, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                        .frame(width: 76, height: 76)
                }
                .opacity(currentPin.isEmpty ? 0.3 : 1.0)
                .animation(.easeInOut(duration: 0.15), value: currentPin.isEmpty)
                .accessibilityLabel(String(localized: "conversation.lock.a11y.delete", defaultValue: "Supprimer le dernier chiffre", bundle: .main))
                .disabled(currentPin.isEmpty)
            }
        }
    }

    private func numpadKey(digit: Int) -> some View {
        Button {
            HapticFeedback.light()
            appendDigit(digit)
        } label: {
            Text("\(digit)")
                // doctrine 82i — chiffre borné par la touche fixe 76×76 du pavé
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
            return step == 0
                ? String(localized: "conversation.lock.title.createMasterPin", defaultValue: "Créer le master PIN", bundle: .main)
                : String(localized: "conversation.lock.title.confirmMasterPin", defaultValue: "Confirmer le master PIN", bundle: .main)
        case .changeMasterPin:
            if step == 0 { return String(localized: "conversation.lock.title.verifyMasterPin", defaultValue: "Vérifier le master PIN", bundle: .main) }
            if step == 1 { return String(localized: "conversation.lock.title.newMasterPin", defaultValue: "Nouveau master PIN", bundle: .main) }
            return String(localized: "conversation.lock.title.confirmNewPin", defaultValue: "Confirmer le nouveau PIN", bundle: .main)
        case .removeMasterPin:
            return String(localized: "conversation.lock.title.removeMasterPin", defaultValue: "Supprimer le master PIN", bundle: .main)
        case .lockConversation:
            if step == 0 { return String(localized: "conversation.lock.title.verifyMasterPin", defaultValue: "Vérifier le master PIN", bundle: .main) }
            if step == 1 { return String(localized: "conversation.lock.title.conversationCode", defaultValue: "Code de la conversation", bundle: .main) }
            return String(localized: "conversation.lock.title.confirmCode", defaultValue: "Confirmer le code", bundle: .main)
        case .unlockConversation:
            return String(localized: "conversation.lock.title.unlock", defaultValue: "Déverrouiller", bundle: .main)
        case .openConversation:
            return String(localized: "conversation.lock.title.locked", defaultValue: "Conversation verrouillée", bundle: .main)
        case .unlockAll:
            return String(localized: "conversation.lock.title.unlockAll", defaultValue: "Déverrouiller tout", bundle: .main)
        }
    }

    private var subtitleText: String {
        switch mode {
        case .setupMasterPin:
            if step == 0 { return String(localized: "conversation.lock.subtitle.chooseMasterPin", defaultValue: "Choisissez un master PIN à 6 chiffres pour sécuriser vos verrous", bundle: .main) }
            return String(localized: "conversation.lock.subtitle.reenterMasterPin", defaultValue: "Saisissez à nouveau votre master PIN pour confirmer", bundle: .main)
        case .changeMasterPin:
            if step == 0 { return String(localized: "conversation.lock.subtitle.enterCurrentMasterPin", defaultValue: "Saisissez votre master PIN actuel", bundle: .main) }
            if step == 1 { return String(localized: "conversation.lock.subtitle.chooseNewMasterPin", defaultValue: "Choisissez un nouveau master PIN à 6 chiffres", bundle: .main) }
            return String(localized: "conversation.lock.subtitle.confirmNewMasterPin", defaultValue: "Confirmez votre nouveau master PIN", bundle: .main)
        case .removeMasterPin:
            return String(localized: "conversation.lock.subtitle.confirmRemoval", defaultValue: "Saisissez votre master PIN pour confirmer la suppression", bundle: .main)
        case .lockConversation:
            if step == 0 { return String(localized: "conversation.lock.subtitle.authorizeLock", defaultValue: "Saisissez votre master PIN pour autoriser le verrouillage", bundle: .main) }
            if step == 1 {
                return String(format: String(localized: "conversation.lock.subtitle.chooseCode", defaultValue: "Choisissez un code à 4 chiffres pour %@", bundle: .main), conversationName)
            }
            return String(format: String(localized: "conversation.lock.subtitle.confirmCodeFor", defaultValue: "Confirmez le code pour %@", bundle: .main), conversationName)
        case .unlockConversation:
            return String(format: String(localized: "conversation.lock.subtitle.enterCodeToUnlock", defaultValue: "Saisissez le code de %@ pour le déverrouiller", bundle: .main), conversationName)
        case .openConversation:
            return String(format: String(localized: "conversation.lock.subtitle.enterCodeToOpen", defaultValue: "Saisissez le code pour accéder à %@", bundle: .main), conversationName)
        case .unlockAll:
            return String(localized: "conversation.lock.subtitle.unlockAll", defaultValue: "Saisissez votre master PIN pour déverrouiller toutes les conversations", bundle: .main)
        }
    }

    // MARK: - Localized error strings

    private var errPinMismatch: String {
        String(localized: "conversation.lock.error.pinMismatch", defaultValue: "Les PIN ne correspondent pas", bundle: .main)
    }
    private var errMasterPinIncorrect: String {
        String(localized: "conversation.lock.error.masterPinIncorrect", defaultValue: "Master PIN incorrect", bundle: .main)
    }
    private var errCodeMismatch: String {
        String(localized: "conversation.lock.error.codeMismatch", defaultValue: "Les codes ne correspondent pas", bundle: .main)
    }
    private var errCodeIncorrect: String {
        String(localized: "conversation.lock.error.codeIncorrect", defaultValue: "Code incorrect", bundle: .main)
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
                guard pin == confirmPin else { return shakeAndReset(errPinMismatch) }
                lockManager.setMasterPin(pin)
                HapticFeedback.success()
                onSuccess()
                dismiss()
            }

        case .changeMasterPin:
            if step == 0 {
                guard lockManager.verifyMasterPin(pin) else { return shakeAndReset(errMasterPinIncorrect) }
                withAnimation { step = 1; pin = "" }
            } else if step == 1 {
                withAnimation { step = 2 }
            } else {
                guard pin == confirmPin else { return shakeAndReset(errPinMismatch) }
                lockManager.setMasterPin(pin)
                HapticFeedback.success()
                onSuccess()
                dismiss()
            }

        case .removeMasterPin:
            guard lockManager.verifyMasterPin(pin) else { return shakeAndReset(errMasterPinIncorrect) }
            lockManager.forceRemoveMasterPin()
            HapticFeedback.success()
            onSuccess()
            dismiss()

        case .lockConversation:
            if step == 0 {
                guard lockManager.verifyMasterPin(pin) else { return shakeAndReset(errMasterPinIncorrect) }
                withAnimation { step = 1; pin = "" }
            } else if step == 1 {
                withAnimation { step = 2 }
            } else {
                guard pin == confirmPin else { return shakeAndReset(errCodeMismatch) }
                guard let id = conversationId else { return }
                lockManager.setLock(conversationId: id, pin: pin)
                HapticFeedback.success()
                onSuccess()
                dismiss()
            }

        case .unlockConversation:
            guard let id = conversationId else { return }
            guard lockManager.verifyLock(conversationId: id, pin: pin) else {
                return shakeAndReset(errCodeIncorrect)
            }
            lockManager.removeLock(conversationId: id)
            HapticFeedback.success()
            onSuccess()
            dismiss()

        case .openConversation:
            guard let id = conversationId else { return }
            guard lockManager.verifyLock(conversationId: id, pin: pin) else {
                return shakeAndReset(errCodeIncorrect)
            }
            HapticFeedback.success()
            onSuccess()
            dismiss()

        case .unlockAll:
            guard lockManager.verifyMasterPin(pin) else { return shakeAndReset(errMasterPinIncorrect) }
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
