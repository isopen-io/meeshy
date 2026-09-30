import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct SecurityView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var authManager: AuthManager

    @State private var showChangePassword = false
    @State private var showActiveSessions = false

    // 2FA
    @StateObject private var twoFactorViewModel = TwoFactorViewModel()
    @State private var showTwoFactorSetupSheet = false
    @State private var showTwoFactorDisableSheet = false
    @State private var showBackupCodesSheet = false

    // Conversation lock PIN
    @ObservedObject private var lockManager = ConversationLockManager.shared
    @State private var showPinSetupSheet = false
    @State private var showPinChangeSheet = false
    @State private var showPinRemoveSheet = false
    @State private var showUnlockAllSheet = false

    // Email change
    @State private var isEditingEmail = false
    @State private var newEmail = ""
    @State private var emailLoading = false
    @State private var emailSent = false
    @State private var emailError: String?
    @State private var resendCooldown = 0
    @State private var resendTimer: Timer?

    // Phone change — le flux est partagé avec la proposition faite avant la
    // recherche de contacts (#8843).
    @StateObject private var phoneFlow = PhoneChangeFlowModel()

    private let accentColor = "6366F1"

    private var user: MeeshyUser? { authManager.currentUser }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            // Retour en verre de l'en-tête partagé (#6481) ; la page possède
            // le défilement, l'écran ne fournit que ses sections.
            CollapsibleHeaderPage(
                title: String(localized: "settings.security.title", defaultValue: "Sécurité", bundle: .main),
                onBack: { dismiss() },
                titleColor: theme.textPrimary,
                backArrowColor: MeeshyColors.indigo500,
                backgroundColor: theme.backgroundPrimary
            ) {
                sectionsContent
            }
        }
        .onDisappear {
            resendTimer?.invalidate()
            resendTimer = nil
        }
        .sheet(isPresented: $showChangePassword) {
            ChangePasswordView()
        }
        // PIN setup (no existing PIN)
        .sheet(isPresented: $showPinSetupSheet) {
            ConversationLockSheet(
                mode: .setupMasterPin,
                conversationId: nil,
                conversationName: String(localized: "settings.security.all_conversations", defaultValue: "toutes les conversations", bundle: .main),
                onSuccess: {}
            )
            .environmentObject(theme)
        }
        // Change PIN (verify current + set new — single multi-step sheet)
        .sheet(isPresented: $showPinChangeSheet) {
            ConversationLockSheet(
                mode: .changeMasterPin,
                conversationId: nil,
                conversationName: String(localized: "settings.security.all_conversations", defaultValue: "toutes les conversations", bundle: .main),
                onSuccess: {}
            )
            .environmentObject(theme)
        }
        // Remove master PIN
        .sheet(isPresented: $showPinRemoveSheet) {
            ConversationLockSheet(
                mode: .removeMasterPin,
                conversationId: nil,
                conversationName: String(localized: "settings.security.all_conversations", defaultValue: "toutes les conversations", bundle: .main),
                onSuccess: {}
            )
            .environmentObject(theme)
        }
        // Unlock all conversations
        .sheet(isPresented: $showUnlockAllSheet) {
            ConversationLockSheet(
                mode: .unlockAll,
                conversationId: nil,
                conversationName: String(localized: "settings.security.all_conversations", defaultValue: "toutes les conversations", bundle: .main),
                onSuccess: {}
            )
            .environmentObject(theme)
        }
        .sheet(isPresented: $showTwoFactorSetupSheet) {
            TwoFactorSetupView(
                viewModel: twoFactorViewModel,
                onComplete: {
                    showTwoFactorSetupSheet = false
                    Task { await twoFactorViewModel.checkStatus() }
                },
                onCancel: {
                    showTwoFactorSetupSheet = false
                    twoFactorViewModel.reset()
                }
            )
            .environmentObject(theme)
        }
        .sheet(isPresented: $showTwoFactorDisableSheet) {
            TwoFactorDisableView(
                viewModel: twoFactorViewModel,
                onComplete: {
                    showTwoFactorDisableSheet = false
                    Task { await twoFactorViewModel.checkStatus() }
                },
                onCancel: { showTwoFactorDisableSheet = false }
            )
            .environmentObject(theme)
        }
        .sheet(isPresented: $showBackupCodesSheet) {
            TwoFactorBackupCodesView(
                viewModel: twoFactorViewModel,
                onDismiss: {
                    showBackupCodesSheet = false
                    twoFactorViewModel.reset()
                }
            )
            .environmentObject(theme)
        }
        .adaptiveOnChange(of: scenePhase) { _, newPhase in
            if newPhase == .active, emailSent {
                Task { await authManager.checkExistingSession() }
            }
        }
        .onAppear { Task { await twoFactorViewModel.checkStatus() } }
    }

    // MARK: - Sections Content

    private var sectionsContent: some View {
        VStack(spacing: MeeshySpacing.xxl) {
            passwordSection
            twoFactorSection
            emailSection
            phoneSection
            conversationLockSection
            activeSessionsSection
            Spacer().frame(height: 40)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.lg)
    }

    // MARK: - Password Section

    private var passwordSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "settings.security.password", defaultValue: "Mot de passe", bundle: .main), icon: "lock.fill", color: MeeshyColors.brandPrimaryHex)

            Button {
                HapticFeedback.light()
                showChangePassword = true
            } label: {
                HStack(spacing: MeeshySpacing.md) {
                    fieldIcon("key.fill", color: MeeshyColors.brandPrimaryHex)

                    Text(String(localized: "settings.security.change_password", defaultValue: "Changer le mot de passe", bundle: .main))
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Image(systemName: "chevron.forward")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(theme.textMuted)
                }
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.md)
            }
            .background(sectionBackground(tint: MeeshyColors.brandPrimaryHex))
        }
    }

    // MARK: - Email Section

    private var emailSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "settings.security.email", defaultValue: "Email", bundle: .main), icon: "envelope.fill", color: accentColor)

            VStack(spacing: 0) {
                HStack(spacing: MeeshySpacing.md) {
                    fieldIcon("envelope.fill", color: accentColor)

                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        Text(String(localized: "settings.security.email.current", defaultValue: "Email actuel", bundle: .main))
                            .font(.caption2.weight(.medium))
                            .foregroundColor(theme.textMuted)

                        Text(user?.email ?? String(localized: "settings.security.not_set", defaultValue: "Non défini", bundle: .main))
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(user?.email != nil ? theme.textPrimary : theme.textMuted)
                    }

                    Spacer()
                    
                    if let email = user?.email, !email.isEmpty {
                        verificationBadge(verified: user?.emailVerifiedAt != nil)
                    }
                }
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.smPlus)

                if isEditingEmail {
                    emailEditContent
                } else if emailSent {
                    emailSentContent
                } else {
                    HStack(spacing: 0) {
                        Button {
                            HapticFeedback.light()
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                isEditingEmail = true
                            }
                        } label: {
                            HStack(spacing: MeeshySpacing.sm) {
                                Image(systemName: "pencil")
                                    .font(.caption.weight(.semibold))
                                Text(String(localized: "common.edit", defaultValue: "Modifier", bundle: .main))
                                    .font(.footnote.weight(.semibold))
                            }
                            .foregroundColor(MeeshyColors.indigo500)
                            .padding(.horizontal, MeeshySpacing.mdPlus)
                            .padding(.vertical, MeeshySpacing.sm)
                        }

                        if let email = user?.email, !email.isEmpty, user?.emailVerifiedAt == nil {
                            Button {
                                HapticFeedback.light()
                                newEmail = email
                                submitEmailChange()
                            } label: {
                                HStack(spacing: MeeshySpacing.sm) {
                                    Image(systemName: "checkmark.seal.fill")
                                        .font(.caption.weight(.semibold))
                                    Text(String(localized: "common.verify", defaultValue: "Vérifier", bundle: .main))
                                        .font(.footnote.weight(.semibold))
                                }
                                .foregroundColor(MeeshyColors.success)
                                .padding(.horizontal, MeeshySpacing.mdPlus)
                                .padding(.vertical, MeeshySpacing.sm)
                            }
                        }
                        
                        Spacer()
                    }
                    .padding(.horizontal, MeeshySpacing.mdPlus)
                    .padding(.bottom, MeeshySpacing.smPlus)
                }

                if let emailError {
                    Text(emailError)
                        .font(.caption.weight(.medium))
                        .foregroundColor(MeeshyColors.error)
                        .padding(.horizontal, MeeshySpacing.mdPlus)
                        .padding(.bottom, MeeshySpacing.smPlus)
                }
            }
            .background(sectionBackground(tint: accentColor))
        }
    }

    private var emailEditContent: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            HStack(spacing: MeeshySpacing.md) {
                fieldIcon("at", color: accentColor)

                TextField(String(localized: "settings.security.email.new", defaultValue: "Nouvel email", bundle: .main), text: $newEmail)
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(theme.textPrimary)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .disableAutocorrection(true)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)

            HStack(spacing: MeeshySpacing.smPlus) {
                Button {
                    HapticFeedback.light()
                    withAnimation { isEditingEmail = false; newEmail = ""; emailError = nil }
                } label: {
                    Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(theme.textMuted)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.vertical, MeeshySpacing.sm)
                        .background(Capsule().fill(theme.textMuted.opacity(MeeshyOpacity.light)))
                }

                Button {
                    HapticFeedback.medium()
                    submitEmailChange()
                } label: {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        if emailLoading {
                            ProgressView().scaleEffect(0.7).tint(.white)
                        }
                        Text(String(localized: "common.send", defaultValue: "Envoyer", bundle: .main))
                            .font(.footnote.weight(.bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(
                        Capsule().fill(
                            newEmail.contains("@") && !emailLoading
                                ? MeeshyColors.indigo500
                                : MeeshyColors.indigo500.opacity(0.4)
                        )
                    )
                }
                .disabled(!newEmail.contains("@") || emailLoading)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.bottom, MeeshySpacing.smPlus)
        }
    }

    private var emailSentContent: some View {
        VStack(spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "envelope.badge.fill")
                    .font(.subheadline)
                    .foregroundColor(MeeshyColors.success)
                Text(String(localized: "settings.security.email.verification_sent", defaultValue: "Email de vérification envoyé", bundle: .main))
                    .font(.footnote.weight(.medium))
                    .foregroundColor(MeeshyColors.success)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)

            Button {
                HapticFeedback.light()
                resendEmailVerification()
            } label: {
                Text(resendCooldown > 0
                     ? "\(String(localized: "settings.security.email.resend", defaultValue: "Renvoyer", bundle: .main)) (\(resendCooldown)s)"
                     : String(localized: "settings.security.email.resend_email", defaultValue: "Renvoyer l'email", bundle: .main))
                    .font(.caption.weight(.semibold))
                    .foregroundColor(resendCooldown > 0 ? theme.textMuted : MeeshyColors.indigo500)
            }
            .disabled(resendCooldown > 0)
            .padding(.bottom, MeeshySpacing.smPlus)
        }
    }

    // MARK: - Phone Section

    private var phoneSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "settings.security.phone", defaultValue: "Téléphone", bundle: .main), icon: "phone.fill", color: MeeshyColors.indigo400Hex)

            VStack(spacing: 0) {
                HStack(spacing: MeeshySpacing.md) {
                    fieldIcon("phone.fill", color: MeeshyColors.indigo400Hex)

                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        Text(String(localized: "settings.security.phone.current", defaultValue: "Téléphone actuel", bundle: .main))
                            .font(.caption2.weight(.medium))
                            .foregroundColor(theme.textMuted)

                        Text({
                            if let phone = user?.phoneNumber, !phone.isEmpty {
                                return "\(CountryPicker.flag(forPhoneNumber: phone)) \(phone)"
                            }
                            return String(localized: "settings.security.not_set", defaultValue: "Non défini", bundle: .main)
                        }())
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(user?.phoneNumber != nil ? theme.textPrimary : theme.textMuted)
                    }

                    Spacer()
                    
                    if let phone = user?.phoneNumber, !phone.isEmpty {
                        verificationBadge(verified: user?.phoneVerifiedAt != nil)
                    }
                }
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.smPlus)

                if phoneFlow.step == .codeSent {
                    phoneCodeContent
                } else if phoneFlow.step == .editing {
                    phoneEditContent
                } else {
                    HStack(spacing: 0) {
                        Button {
                            HapticFeedback.light()
                            phoneFlow.beginEditing()
                        } label: {
                            HStack(spacing: MeeshySpacing.sm) {
                                Image(systemName: "pencil")
                                    .font(.caption.weight(.semibold))
                                Text(String(localized: "common.edit", defaultValue: "Modifier", bundle: .main))
                                    .font(.footnote.weight(.semibold))
                            }
                            .foregroundColor(MeeshyColors.indigo400)
                            .padding(.horizontal, MeeshySpacing.mdPlus)
                            .padding(.vertical, MeeshySpacing.sm)
                        }

                        if let phone = user?.phoneNumber, !phone.isEmpty, user?.phoneVerifiedAt == nil {
                            Button {
                                HapticFeedback.light()
                                Task { await phoneFlow.requestCode(for: phone) }
                            } label: {
                                HStack(spacing: MeeshySpacing.sm) {
                                    Image(systemName: "checkmark.seal.fill")
                                        .font(.caption.weight(.semibold))
                                    Text(String(localized: "common.verify", defaultValue: "Vérifier", bundle: .main))
                                        .font(.footnote.weight(.semibold))
                                }
                                .foregroundColor(MeeshyColors.success)
                                .padding(.horizontal, MeeshySpacing.mdPlus)
                                .padding(.vertical, MeeshySpacing.sm)
                            }
                        }
                        
                        Spacer()
                    }
                    .padding(.horizontal, MeeshySpacing.mdPlus)
                    .padding(.bottom, MeeshySpacing.smPlus)
                }

                if let phoneError = phoneFlow.error {
                    Text(phoneError)
                        .font(.caption.weight(.medium))
                        .foregroundColor(MeeshyColors.error)
                        .padding(.horizontal, MeeshySpacing.mdPlus)
                        .padding(.bottom, MeeshySpacing.smPlus)
                }
            }
            .background(sectionBackground(tint: MeeshyColors.indigo400Hex))
        }
    }

    private var phoneEditContent: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            HStack(spacing: MeeshySpacing.md) {
                fieldIcon("phone.badge.plus", color: MeeshyColors.indigo400Hex)

                TextField("+33 6 12 34 56 78", text: $phoneFlow.newPhone)
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(theme.textPrimary)
                    .textContentType(.telephoneNumber)
                    .keyboardType(.phonePad)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)

            HStack(spacing: MeeshySpacing.smPlus) {
                Button {
                    HapticFeedback.light()
                    phoneFlow.cancel()
                } label: {
                    Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(theme.textMuted)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.vertical, MeeshySpacing.sm)
                        .background(Capsule().fill(theme.textMuted.opacity(MeeshyOpacity.light)))
                }

                Button {
                    HapticFeedback.medium()
                    Task { await phoneFlow.sendCode() }
                } label: {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        if phoneFlow.isSending {
                            ProgressView().scaleEffect(0.7).tint(.white)
                        }
                        Text(String(localized: "settings.security.phone.send_code", defaultValue: "Envoyer le code", bundle: .main))
                            .font(.footnote.weight(.bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(
                        Capsule().fill(
                            phoneFlow.canSend
                                ? MeeshyColors.indigo400
                                : MeeshyColors.indigo400.opacity(0.4)
                        )
                    )
                }
                .disabled(!phoneFlow.canSend)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.bottom, MeeshySpacing.smPlus)
        }
    }

    private var phoneCodeContent: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "ellipsis.message.fill")
                    .font(.subheadline)
                    .foregroundColor(MeeshyColors.success)
                Text(String(localized: "settings.security.phone.code_sent", defaultValue: "Code envoyé par SMS", bundle: .main))
                    .font(.footnote.weight(.medium))
                    .foregroundColor(MeeshyColors.success)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)

            HStack(spacing: MeeshySpacing.md) {
                fieldIcon("number", color: MeeshyColors.indigo400Hex)

                TextField(String(localized: "settings.security.phone.code_placeholder", defaultValue: "Code à 6 chiffres", bundle: .main), text: $phoneFlow.code)
                    .font(.system(.callout, design: .monospaced).weight(.semibold))
                    .foregroundColor(theme.textPrimary)
                    .keyboardType(.numberPad)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)

            HStack(spacing: MeeshySpacing.smPlus) {
                Button {
                    HapticFeedback.light()
                    phoneFlow.cancel()
                } label: {
                    Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(theme.textMuted)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.vertical, MeeshySpacing.sm)
                        .background(Capsule().fill(theme.textMuted.opacity(MeeshyOpacity.light)))
                }

                Button {
                    HapticFeedback.medium()
                    Task { await phoneFlow.verifyCode() }
                } label: {
                    HStack(spacing: MeeshySpacing.xsPlus) {
                        if phoneFlow.isVerifying {
                            ProgressView().scaleEffect(0.7).tint(.white)
                        }
                        Text(String(localized: "common.verify", defaultValue: "Vérifier", bundle: .main))
                            .font(.footnote.weight(.bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(
                        Capsule().fill(
                            phoneFlow.canVerify
                                ? MeeshyColors.indigo400
                                : MeeshyColors.indigo400.opacity(0.4)
                        )
                    )
                }
                .disabled(!phoneFlow.canVerify)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.bottom, MeeshySpacing.smPlus)
        }
    }

    // MARK: - Conversation Lock PIN Section

    private var conversationLockSection: some View {
        let hasMasterPIN = lockManager.masterPinConfigured
        let lockedCount = lockManager.lockedConversationIds.count
        let lockColor = "F87171"
        return VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "settings.security.locked_conversations", defaultValue: "Conversations verrouillées", bundle: .main), icon: "lock.shield.fill", color: lockColor)

            VStack(spacing: 0) {
                // Status row
                HStack(spacing: MeeshySpacing.md) {
                    fieldIcon("lock.shield.fill", color: lockColor)

                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        Text(String(localized: "settings.security.master_pin", defaultValue: "Code PIN principal", bundle: .main))
                            .font(.caption2.weight(.medium))
                            .foregroundColor(theme.textMuted)
                        Text(hasMasterPIN
                             ? String(localized: "settings.security.configured", defaultValue: "Configuré", bundle: .main)
                             : String(localized: "settings.security.not_configured", defaultValue: "Non configuré", bundle: .main))
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(hasMasterPIN ? MeeshyColors.success : theme.textMuted)
                    }

                    Spacer()

                    if hasMasterPIN {
                        HStack(spacing: MeeshySpacing.sm) {
                            if lockedCount > 0 {
                                Text("\(lockedCount) \(String(localized: "settings.security.locks", defaultValue: "verrou(s)", bundle: .main))")
                                    .font(.caption2.weight(.semibold))
                                    .foregroundColor(MeeshyColors.error)
                                    .padding(.horizontal, MeeshySpacing.sm)
                                    .padding(.vertical, MeeshySpacing.xxs)
                                    .background(Capsule().fill(MeeshyColors.error.opacity(MeeshyOpacity.light)))
                            }
                            Image(systemName: "checkmark.shield.fill")
                                .font(.callout)
                                .foregroundColor(MeeshyColors.success)
                        }
                    }
                }
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.smPlus)

                // Actions
                HStack(spacing: MeeshySpacing.smPlus) {
                    if !hasMasterPIN {
                        Button {
                            HapticFeedback.medium()
                            showPinSetupSheet = true
                        } label: {
                            HStack(spacing: MeeshySpacing.xsPlus) {
                                Image(systemName: "plus.circle.fill")
                                    .font(.caption)
                                Text(String(localized: "settings.security.configure", defaultValue: "Configurer", bundle: .main))
                                    .font(.footnote.weight(.semibold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, MeeshySpacing.mdPlus)
                            .padding(.vertical, MeeshySpacing.sm)
                            // Le (+) « Configurer » passe en verre PROÉMINENT (#6481) :
                            // le verre simple rendrait le texte blanc illisible avant
                            // iOS 26, où la variante proéminente garde l'aplat rouge.
                            .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.error)
                        }
                    } else {
                        Button {
                            HapticFeedback.light()
                            showPinChangeSheet = true
                        } label: {
                            HStack(spacing: MeeshySpacing.xsPlus) {
                                Image(systemName: "pencil.circle.fill")
                                    .font(.caption)
                                Text(String(localized: "common.edit", defaultValue: "Modifier", bundle: .main))
                                    .font(.footnote.weight(.semibold))
                            }
                            .foregroundColor(MeeshyColors.error)
                            .padding(.horizontal, MeeshySpacing.mdPlus)
                            .padding(.vertical, MeeshySpacing.sm)
                            .background(Capsule().fill(MeeshyColors.error.opacity(MeeshyOpacity.light)))
                        }

                        if lockedCount > 0 {
                            Button {
                                HapticFeedback.medium()
                                showUnlockAllSheet = true
                            } label: {
                                HStack(spacing: MeeshySpacing.xsPlus) {
                                    Image(systemName: "lock.open.fill")
                                        .font(.caption)
                                    Text("\(String(localized: "settings.security.unlock_all", defaultValue: "Déverrouiller tout", bundle: .main)) (\(lockedCount))")
                                        .font(.footnote.weight(.semibold))
                                }
                                .foregroundColor(.white)
                                .padding(.horizontal, MeeshySpacing.mdPlus)
                                .padding(.vertical, MeeshySpacing.sm)
                                .background(Capsule().fill(MeeshyColors.warning))
                            }
                        }

                        if lockedCount == 0 {
                            Button {
                                HapticFeedback.medium()
                                showPinRemoveSheet = true
                            } label: {
                                HStack(spacing: MeeshySpacing.xsPlus) {
                                    Image(systemName: "trash.circle.fill")
                                        .font(.caption)
                                    Text(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main))
                                        .font(.footnote.weight(.semibold))
                                }
                                .foregroundColor(MeeshyColors.error)
                                .padding(.horizontal, MeeshySpacing.mdPlus)
                                .padding(.vertical, MeeshySpacing.sm)
                                .background(Capsule().fill(MeeshyColors.error.opacity(MeeshyOpacity.subtle)))
                            }
                        }
                    }
                }
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.bottom, MeeshySpacing.smPlus)
            }
            .background(sectionBackground(tint: lockColor))
        }
    }

    // MARK: - Two-Factor Authentication Section

    private var twoFactorSection: some View {
        let tfaColor = "6366F1"
        return VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(
                title: String(localized: "2fa_section_title", defaultValue: "Authentification à deux facteurs"),
                icon: "shield.lefthalf.filled",
                color: tfaColor
            )

            VStack(spacing: 0) {
                HStack(spacing: MeeshySpacing.md) {
                    fieldIcon("shield.lefthalf.filled", color: tfaColor)

                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        Text(String(localized: "2fa_status_label", defaultValue: "Statut 2FA"))
                            .font(.caption2.weight(.medium))
                            .foregroundColor(theme.textMuted)

                        if twoFactorViewModel.isLoading {
                            ProgressView()
                                .scaleEffect(0.7)
                        } else {
                            Text(twoFactorViewModel.isEnabled
                                 ? String(localized: "2fa_enabled", defaultValue: "Actif")
                                 : String(localized: "2fa_disabled", defaultValue: "Désactivé"))
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(twoFactorViewModel.isEnabled ? MeeshyColors.success : theme.textMuted)
                        }
                    }

                    Spacer()

                    if twoFactorViewModel.isEnabled {
                        Text(String(localized: "2fa_badge_active", defaultValue: "Actif"))
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, MeeshySpacing.xsPlus)
                            .padding(.vertical, MeeshySpacing.xxs)
                            .background(Capsule().fill(MeeshyColors.success))
                    }
                }
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.smPlus)

                HStack(spacing: MeeshySpacing.smPlus) {
                    if twoFactorViewModel.isEnabled {
                        Button {
                            HapticFeedback.light()
                            showBackupCodesSheet = true
                        } label: {
                            HStack(spacing: MeeshySpacing.xsPlus) {
                                Image(systemName: "key.fill")
                                    .font(.caption)
                                Text(String(localized: "2fa_backup_codes_button", defaultValue: "Codes de secours"))
                                    .font(.footnote.weight(.semibold))
                            }
                            .foregroundColor(MeeshyColors.indigo500)
                            .padding(.horizontal, MeeshySpacing.mdPlus)
                            .padding(.vertical, MeeshySpacing.sm)
                            .background(Capsule().fill(MeeshyColors.indigo500.opacity(MeeshyOpacity.light)))
                        }

                        Button {
                            HapticFeedback.medium()
                            showTwoFactorDisableSheet = true
                        } label: {
                            HStack(spacing: MeeshySpacing.xsPlus) {
                                Image(systemName: "shield.slash.fill")
                                    .font(.caption)
                                Text(String(localized: "2fa_disable_button", defaultValue: "Désactiver"))
                                    .font(.footnote.weight(.semibold))
                            }
                            .foregroundColor(MeeshyColors.error)
                            .padding(.horizontal, MeeshySpacing.mdPlus)
                            .padding(.vertical, MeeshySpacing.sm)
                            .background(Capsule().fill(MeeshyColors.error.opacity(MeeshyOpacity.subtle)))
                        }
                    } else {
                        Button {
                            HapticFeedback.medium()
                            showTwoFactorSetupSheet = true
                        } label: {
                            HStack(spacing: MeeshySpacing.xsPlus) {
                                Image(systemName: "shield.lefthalf.filled.badge.checkmark")
                                    .font(.caption)
                                Text(String(localized: "2fa_enable_button", defaultValue: "Activer la 2FA"))
                                    .font(.footnote.weight(.semibold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, MeeshySpacing.mdPlus)
                            .padding(.vertical, MeeshySpacing.sm)
                            .background(Capsule().fill(MeeshyColors.indigo500))
                        }
                    }
                }
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.bottom, MeeshySpacing.smPlus)

                if let twoFactorError = twoFactorViewModel.error {
                    Text(twoFactorError)
                        .font(.caption.weight(.medium))
                        .foregroundColor(MeeshyColors.error)
                        .padding(.horizontal, MeeshySpacing.mdPlus)
                        .padding(.bottom, MeeshySpacing.smPlus)
                }
            }
            .background(sectionBackground(tint: tfaColor))
        }
    }

    // MARK: - Active Sessions Section

    private var activeSessionsSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "security_sessions_header", defaultValue: "Sessions"), icon: "laptopcomputer.and.iphone", color: MeeshyColors.indigo400Hex)

            Button {
                HapticFeedback.light()
                showActiveSessions = true
            } label: {
                HStack(spacing: MeeshySpacing.md) {
                    fieldIcon("laptopcomputer.and.iphone", color: MeeshyColors.indigo400Hex)

                    Text(String(localized: "security_sessions_manage", defaultValue: "Gérer les sessions actives"))
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Image(systemName: "chevron.forward")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(theme.textMuted)
                }
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.md)
            }
            .background(sectionBackground(tint: MeeshyColors.indigo400Hex))
        }
        .sheet(isPresented: $showActiveSessions) {
            ActiveSessionsView()
                .environmentObject(theme)
        }
    }

    // MARK: - Components

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: icon)
                .font(.caption.weight(.semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(.system(.caption2, design: .rounded).weight(.bold))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, MeeshySpacing.xs)
    }

    private func sectionBackground(tint: String) -> some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
            .fill(theme.surfaceGradient(tint: tint))
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .stroke(theme.border(tint: tint), lineWidth: 1)
            )
    }

    private func fieldIcon(_ name: String, color: String) -> some View {
        Image(systemName: name)
            .font(.subheadline.weight(.medium))
            .foregroundColor(Color(hex: color))
            .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.xs)
                    .fill(Color(hex: color).opacity(MeeshyOpacity.light))
            )
    }

    private func verificationBadge(verified: Bool) -> some View {
        Text(verified
             ? String(localized: "settings.security.verified", defaultValue: "Vérifié", bundle: .main)
             : String(localized: "settings.security.not_verified", defaultValue: "Non vérifié", bundle: .main))
            .font(.caption2.weight(.semibold))
            .foregroundColor(.white)
            .padding(.horizontal, MeeshySpacing.xsPlus)
            .padding(.vertical, MeeshySpacing.xxs)
            .background(Capsule().fill(verified ? MeeshyColors.success : MeeshyColors.warning))
            .accessibilityLabel(verified
                                ? String(localized: "settings.security.verified", defaultValue: "Vérifié", bundle: .main)
                                : String(localized: "settings.security.not_verified", defaultValue: "Non vérifié", bundle: .main))
    }

    // MARK: - Actions

    private func submitEmailChange() {
        emailLoading = true
        emailError = nil

        Task {
            do {
                _ = try await UserService.shared.changeEmail(ChangeEmailRequest(newEmail: newEmail))
                HapticFeedback.success()
                withAnimation {
                    emailSent = true
                    isEditingEmail = false
                }
                startResendCooldown()
            } catch let error as MeeshyError {
                HapticFeedback.error()
                emailError = error.errorDescription
            } catch {
                HapticFeedback.error()
                emailError = String(localized: "common.error.generic", defaultValue: "Une erreur est survenue", bundle: .main)
            }
            emailLoading = false
        }
    }

    private func resendEmailVerification() {
        guard resendCooldown == 0 else { return }

        Task {
            do {
                _ = try await UserService.shared.resendEmailChangeVerification()
                HapticFeedback.success()
                startResendCooldown()
            } catch {
                HapticFeedback.error()
                emailError = String(localized: "settings.security.email.resend_failed", defaultValue: "Impossible de renvoyer l'email", bundle: .main)
            }
        }
    }

    private func startResendCooldown() {
        resendCooldown = 60
        resendTimer?.invalidate()
        resendTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            Task { @MainActor in
                resendCooldown -= 1
                if resendCooldown <= 0 {
                    resendTimer?.invalidate()
                    resendTimer = nil
                }
            }
        }
    }
}
