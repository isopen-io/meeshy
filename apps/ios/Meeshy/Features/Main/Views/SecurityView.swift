import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct SecurityView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
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

    // Phone change
    @State private var isEditingPhone = false
    @State private var newPhone = ""
    @State private var phoneLoading = false
    @State private var phoneSent = false
    @State private var phoneCode = ""
    @State private var phoneVerifying = false
    @State private var phoneError: String?

    private let accentColor = "6366F1"

    private var user: MeeshyUser? { authManager.currentUser }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
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

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                HStack(spacing: MeeshySpacing.xs) {
                    Image(systemName: "chevron.left")
                        .font(MeeshyFont.relative(14, weight: .semibold))
                    Text(String(localized: "common.back", defaultValue: "Retour", bundle: .main))
                        .font(MeeshyFont.relative(15, weight: .medium))
                }
                .foregroundColor(MeeshyColors.indigo500)
            }
            .accessibilityLabel(String(localized: "common.back", defaultValue: "Retour", bundle: .main))

            Spacer()

            Text(String(localized: "settings.security.title", defaultValue: "Sécurité", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            Color.clear.frame(width: 60, height: 24)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: MeeshySpacing.xxl) {
                passwordSection
                twoFactorSection
                emailSection
                phoneSection
                conversationLockSection
                activeSessionsSection
                Spacer().frame(height: MeeshySpacing.xxxl + MeeshySpacing.sm)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.lg)
        }
    }

    // MARK: - Password Section

    private var passwordSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "settings.security.password", defaultValue: "Mot de passe", bundle: .main), icon: "lock.fill", color: "6366F1")

            Button {
                HapticFeedback.light()
                showChangePassword = true
            } label: {
                HStack(spacing: MeeshySpacing.md) {
                    fieldIcon("key.fill", color: "6366F1")

                    Text(String(localized: "settings.security.change_password", defaultValue: "Changer le mot de passe", bundle: .main))
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
                .padding(.horizontal, MeeshySpacing.md + 2)
                .padding(.vertical, MeeshySpacing.md)
            }
            .background(sectionBackground(tint: "6366F1"))
        }
    }

    // MARK: - Email Section

    private var emailSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "settings.security.email", defaultValue: "Email", bundle: .main), icon: "envelope.fill", color: accentColor)

            VStack(spacing: 0) {
                HStack(spacing: MeeshySpacing.md) {
                    fieldIcon("envelope.fill", color: accentColor)

                    VStack(alignment: .leading, spacing: MeeshySpacing.xs / 2) {
                        Text(String(localized: "settings.security.email.current", defaultValue: "Email actuel", bundle: .main))
                            .font(MeeshyFont.relative(10, weight: .medium))
                            .foregroundColor(theme.textMuted)

                        Text(user?.email ?? String(localized: "settings.security.not_set", defaultValue: "Non defini", bundle: .main))
                            .font(MeeshyFont.relative(14, weight: .medium))
                            .foregroundColor(user?.email != nil ? theme.textPrimary : theme.textMuted)
                    }

                    Spacer()
                    
                    if let email = user?.email, !email.isEmpty {
                        verificationBadge(verified: user?.emailVerifiedAt != nil)
                    }
                }
                .padding(.horizontal, MeeshySpacing.md + 2)
                .padding(.vertical, MeeshySpacing.sm + 2)

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
                            .padding(.horizontal, MeeshySpacing.md + 2)
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
                                        .font(MeeshyFont.relative(12, weight: .semibold))
                                    Text(String(localized: "common.verify", defaultValue: "Vérifier", bundle: .main))
                                        .font(MeeshyFont.relative(11, weight: .semibold))
                                }
                                .foregroundColor(MeeshyColors.success)
                                .padding(.horizontal, MeeshySpacing.md + 2)
                                .padding(.vertical, MeeshySpacing.sm)
                            }
                        }
                        
                        Spacer()
                    }
                    .padding(.horizontal, MeeshySpacing.md + 2)
                    .padding(.bottom, MeeshySpacing.sm + 2)
                }

                if let emailError {
                    Text(emailError)
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                        .padding(.horizontal, MeeshySpacing.md + 2)
                        .padding(.bottom, MeeshySpacing.sm + 2)
                }
            }
            .background(sectionBackground(tint: accentColor))
        }
    }

    private var emailEditContent: some View {
        VStack(spacing: MeeshySpacing.sm + 2) {
            HStack(spacing: MeeshySpacing.md) {
                fieldIcon("at", color: accentColor)

                TextField(String(localized: "settings.security.email.new", defaultValue: "Nouvel email", bundle: .main), text: $newEmail)
                    .font(MeeshyFont.relative(14, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
            }
            .padding(.horizontal, MeeshySpacing.md + 2)
            .padding(.vertical, MeeshySpacing.sm)

            HStack(spacing: MeeshySpacing.sm + 2) {
                Button {
                    HapticFeedback.light()
                    withAnimation { isEditingEmail = false; newEmail = ""; emailError = nil }
                } label: {
                    Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.vertical, MeeshySpacing.sm)
                        .background(Capsule().fill(theme.textMuted.opacity(0.12)))
                }

                Button {
                    HapticFeedback.medium()
                    submitEmailChange()
                } label: {
                    HStack(spacing: MeeshySpacing.xs + 2) {
                        if emailLoading {
                            ProgressView().scaleEffect(0.7).tint(.white)
                        }
                        Text(String(localized: "common.send", defaultValue: "Envoyer", bundle: .main))
                            .font(MeeshyFont.relative(13, weight: .bold))
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
            .padding(.horizontal, MeeshySpacing.md + 2)
            .padding(.bottom, MeeshySpacing.sm + 2)
        }
    }

    private var emailSentContent: some View {
        VStack(spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "envelope.badge.fill")
                    .font(MeeshyFont.relative(15))
                    .foregroundColor(MeeshyColors.success)
                Text(String(localized: "settings.security.email.verification_sent", defaultValue: "Email de verification envoye", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundColor(MeeshyColors.success)
            }
            .padding(.horizontal, MeeshySpacing.md + 2)

            Button {
                HapticFeedback.light()
                resendEmailVerification()
            } label: {
                Text(resendCooldown > 0
                     ? "\(String(localized: "settings.security.email.resend", defaultValue: "Renvoyer", bundle: .main)) (\(resendCooldown)s)"
                     : String(localized: "settings.security.email.resend_email", defaultValue: "Renvoyer l'email", bundle: .main))
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(resendCooldown > 0 ? theme.textMuted : MeeshyColors.indigo500)
            }
            .disabled(resendCooldown > 0)
            .padding(.bottom, MeeshySpacing.sm + 2)
        }
    }

    // MARK: - Phone Section

    private var phoneSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "settings.security.phone", defaultValue: "Telephone", bundle: .main), icon: "phone.fill", color: "818CF8")

            VStack(spacing: 0) {
                HStack(spacing: MeeshySpacing.md) {
                    fieldIcon("phone.fill", color: "818CF8")

                    VStack(alignment: .leading, spacing: MeeshySpacing.xs / 2) {
                        Text(String(localized: "settings.security.phone.current", defaultValue: "Telephone actuel", bundle: .main))
                            .font(MeeshyFont.relative(10, weight: .medium))
                            .foregroundColor(theme.textMuted)

                        Text({
                            if let phone = user?.phoneNumber, !phone.isEmpty {
                                return "\(CountryPicker.flag(forPhoneNumber: phone)) \(phone)"
                            }
                            return String(localized: "settings.security.not_set", defaultValue: "Non defini", bundle: .main)
                        }())
                            .font(MeeshyFont.relative(14, weight: .medium))
                            .foregroundColor(user?.phoneNumber != nil ? theme.textPrimary : theme.textMuted)
                    }

                    Spacer()
                    
                    if let phone = user?.phoneNumber, !phone.isEmpty {
                        verificationBadge(verified: user?.phoneVerifiedAt != nil)
                    }
                }
                .padding(.horizontal, MeeshySpacing.md + 2)
                .padding(.vertical, MeeshySpacing.sm + 2)

                if phoneSent {
                    phoneCodeContent
                } else if isEditingPhone {
                    phoneEditContent
                } else {
                    HStack(spacing: 0) {
                        Button {
                            HapticFeedback.light()
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                isEditingPhone = true
                            }
                        } label: {
                            HStack(spacing: MeeshySpacing.sm) {
                                Image(systemName: "pencil")
                                    .font(.caption.weight(.semibold))
                                Text(String(localized: "common.edit", defaultValue: "Modifier", bundle: .main))
                                    .font(.footnote.weight(.semibold))
                            }
                            .foregroundColor(MeeshyColors.indigo400)
                            .padding(.horizontal, MeeshySpacing.md + 2)
                            .padding(.vertical, MeeshySpacing.sm)
                        }

                        if let phone = user?.phoneNumber, !phone.isEmpty, user?.phoneVerifiedAt == nil {
                            Button {
                                HapticFeedback.light()
                                newPhone = phone
                                submitPhoneChange()
                            } label: {
                                HStack(spacing: MeeshySpacing.sm) {
                                    Image(systemName: "checkmark.seal.fill")
                                        .font(.caption.weight(.semibold))
                                    Text(String(localized: "common.verify", defaultValue: "Vérifier", bundle: .main))
                                        .font(.footnote.weight(.semibold))
                                }
                                .foregroundColor(MeeshyColors.success)
                                .padding(.horizontal, MeeshySpacing.md + 2)
                                .padding(.vertical, MeeshySpacing.sm)
                            }
                        }
                        
                        Spacer()
                    }
                    .padding(.horizontal, MeeshySpacing.md + 2)
                    .padding(.bottom, MeeshySpacing.sm + 2)
                }

                if let phoneError {
                    Text(phoneError)
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                        .padding(.horizontal, MeeshySpacing.md + 2)
                        .padding(.bottom, MeeshySpacing.sm + 2)
                }
            }
            .background(sectionBackground(tint: "818CF8"))
        }
    }

    private var phoneEditContent: some View {
        VStack(spacing: MeeshySpacing.sm + 2) {
            HStack(spacing: MeeshySpacing.md) {
                fieldIcon("phone.badge.plus", color: "818CF8")

                TextField("+33 6 12 34 56 78", text: $newPhone)
                    .font(MeeshyFont.relative(14, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .textContentType(.telephoneNumber)
                    .keyboardType(.phonePad)
            }
            .padding(.horizontal, MeeshySpacing.md + 2)
            .padding(.vertical, MeeshySpacing.sm)

            HStack(spacing: MeeshySpacing.sm + 2) {
                Button {
                    HapticFeedback.light()
                    withAnimation { isEditingPhone = false; newPhone = ""; phoneError = nil }
                } label: {
                    Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.vertical, MeeshySpacing.sm)
                        .background(Capsule().fill(theme.textMuted.opacity(0.12)))
                }

                Button {
                    HapticFeedback.medium()
                    submitPhoneChange()
                } label: {
                    HStack(spacing: MeeshySpacing.xs + 2) {
                        if phoneLoading {
                            ProgressView().scaleEffect(0.7).tint(.white)
                        }
                        Text(String(localized: "settings.security.phone.send_code", defaultValue: "Envoyer le code", bundle: .main))
                            .font(MeeshyFont.relative(13, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(
                        Capsule().fill(
                            newPhone.count >= 6 && !phoneLoading
                                ? MeeshyColors.indigo400
                                : MeeshyColors.indigo400.opacity(0.4)
                        )
                    )
                }
                .disabled(newPhone.count < 6 || phoneLoading)
            }
            .padding(.horizontal, MeeshySpacing.md + 2)
            .padding(.bottom, MeeshySpacing.sm + 2)
        }
    }

    private var phoneCodeContent: some View {
        VStack(spacing: MeeshySpacing.sm + 2) {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "ellipsis.message.fill")
                    .font(MeeshyFont.relative(15))
                    .foregroundColor(MeeshyColors.success)
                Text(String(localized: "settings.security.phone.code_sent", defaultValue: "Code envoye par SMS", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundColor(MeeshyColors.success)
            }
            .padding(.horizontal, MeeshySpacing.md + 2)

            HStack(spacing: MeeshySpacing.md) {
                fieldIcon("number", color: "818CF8")

                TextField(String(localized: "settings.security.phone.code_placeholder", defaultValue: "Code a 6 chiffres", bundle: .main), text: $phoneCode)
                    .font(MeeshyFont.relative(14, weight: .semibold, design: .monospaced))
                    .foregroundColor(theme.textPrimary)
                    .keyboardType(.numberPad)
                    .adaptiveOnChange(of: phoneCode) { _, newValue in
                        phoneCode = String(newValue.prefix(6).filter(\.isNumber))
                    }
            }
            .padding(.horizontal, MeeshySpacing.md + 2)
            .padding(.vertical, MeeshySpacing.sm)

            HStack(spacing: MeeshySpacing.sm + 2) {
                Button {
                    HapticFeedback.light()
                    withAnimation { phoneSent = false; isEditingPhone = false; phoneCode = ""; newPhone = ""; phoneError = nil }
                } label: {
                    Text(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
                        .font(MeeshyFont.relative(13, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .padding(.horizontal, MeeshySpacing.lg)
                        .padding(.vertical, MeeshySpacing.sm)
                        .background(Capsule().fill(theme.textMuted.opacity(0.12)))
                }

                Button {
                    HapticFeedback.medium()
                    verifyPhoneCode()
                } label: {
                    HStack(spacing: MeeshySpacing.xs + 2) {
                        if phoneVerifying {
                            ProgressView().scaleEffect(0.7).tint(.white)
                        }
                        Text(String(localized: "common.verify", defaultValue: "Verifier", bundle: .main))
                            .font(MeeshyFont.relative(13, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.sm)
                    .background(
                        Capsule().fill(
                            phoneCode.count == 6 && !phoneVerifying
                                ? MeeshyColors.indigo400
                                : MeeshyColors.indigo400.opacity(0.4)
                        )
                    )
                }
                .disabled(phoneCode.count != 6 || phoneVerifying)
            }
            .padding(.horizontal, MeeshySpacing.md + 2)
            .padding(.bottom, MeeshySpacing.sm + 2)
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

                    VStack(alignment: .leading, spacing: MeeshySpacing.xs / 2) {
                        Text(String(localized: "settings.security.master_pin", defaultValue: "Master PIN", bundle: .main))
                            .font(MeeshyFont.relative(10, weight: .medium))
                            .foregroundColor(theme.textMuted)
                        Text(hasMasterPIN
                             ? String(localized: "settings.security.configured", defaultValue: "Configuré", bundle: .main)
                             : String(localized: "settings.security.not_configured", defaultValue: "Non configuré", bundle: .main))
                            .font(MeeshyFont.relative(14, weight: .medium))
                            .foregroundColor(hasMasterPIN ? MeeshyColors.success : theme.textMuted)
                    }

                    Spacer()

                    if hasMasterPIN {
                        HStack(spacing: MeeshySpacing.sm) {
                            if lockedCount > 0 {
                                Text("\(lockedCount) \(String(localized: "settings.security.locks", defaultValue: "verrou(s)", bundle: .main))")
                                    .font(MeeshyFont.relative(10, weight: .semibold))
                                    .foregroundColor(MeeshyColors.error)
                                    .padding(.horizontal, MeeshySpacing.sm)
                                    .padding(.vertical, MeeshySpacing.xs / 2 + 1)
                                    .background(Capsule().fill(MeeshyColors.error.opacity(0.15)))
                            }
                            Image(systemName: "checkmark.shield.fill")
                                .font(MeeshyFont.relative(16))
                                .foregroundColor(MeeshyColors.success)
                        }
                    }
                }
                .padding(.horizontal, MeeshySpacing.md + 2)
                .padding(.vertical, MeeshySpacing.sm + 2)

                // Actions
                HStack(spacing: MeeshySpacing.sm + 2) {
                    if !hasMasterPIN {
                        Button {
                            HapticFeedback.medium()
                            showPinSetupSheet = true
                        } label: {
                            HStack(spacing: MeeshySpacing.xs + 2) {
                                Image(systemName: "plus.circle.fill")
                                    .font(.caption)
                                Text(String(localized: "settings.security.configure", defaultValue: "Configurer", bundle: .main))
                                    .font(.footnote.weight(.semibold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, MeeshySpacing.md + 2)
                            .padding(.vertical, MeeshySpacing.sm)
                            .background(
                                Capsule().fill(MeeshyColors.error)
                            )
                        }
                    } else {
                        Button {
                            HapticFeedback.light()
                            showPinChangeSheet = true
                        } label: {
                            HStack(spacing: MeeshySpacing.xs + 2) {
                                Image(systemName: "pencil.circle.fill")
                                    .font(.caption)
                                Text(String(localized: "common.edit", defaultValue: "Modifier", bundle: .main))
                                    .font(.footnote.weight(.semibold))
                            }
                            .foregroundColor(MeeshyColors.error)
                            .padding(.horizontal, MeeshySpacing.md + 2)
                            .padding(.vertical, MeeshySpacing.sm)
                            .background(Capsule().fill(MeeshyColors.error.opacity(0.12)))
                        }

                        if lockedCount > 0 {
                            Button {
                                HapticFeedback.medium()
                                showUnlockAllSheet = true
                            } label: {
                                HStack(spacing: MeeshySpacing.xs + 2) {
                                    Image(systemName: "lock.open.fill")
                                        .font(.caption)
                                    Text("\(String(localized: "settings.security.unlock_all", defaultValue: "Déverrouiller tout", bundle: .main)) (\(lockedCount))")
                                        .font(.footnote.weight(.semibold))
                                }
                                .foregroundColor(.white)
                                .padding(.horizontal, MeeshySpacing.md + 2)
                                .padding(.vertical, MeeshySpacing.sm)
                                .background(Capsule().fill(MeeshyColors.warning))
                            }
                        }

                        if lockedCount == 0 {
                            Button {
                                HapticFeedback.medium()
                                showPinRemoveSheet = true
                            } label: {
                                HStack(spacing: MeeshySpacing.xs + 2) {
                                    Image(systemName: "trash.circle.fill")
                                        .font(.caption)
                                    Text(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main))
                                        .font(.footnote.weight(.semibold))
                                }
                                .foregroundColor(MeeshyColors.error)
                                .padding(.horizontal, MeeshySpacing.md + 2)
                                .padding(.vertical, MeeshySpacing.sm)
                                .background(Capsule().fill(MeeshyColors.error.opacity(0.10)))
                            }
                        }
                    }
                }
                .padding(.horizontal, MeeshySpacing.md + 2)
                .padding(.bottom, MeeshySpacing.sm + 2)
            }
            .background(sectionBackground(tint: lockColor))
        }
    }

    // MARK: - Two-Factor Authentication Section

    private var twoFactorSection: some View {
        let tfaColor = "6366F1"
        return VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(
                title: String(localized: "2fa_section_title", defaultValue: "Authentification a deux facteurs"),
                icon: "shield.lefthalf.filled",
                color: tfaColor
            )

            VStack(spacing: 0) {
                HStack(spacing: MeeshySpacing.md) {
                    fieldIcon("shield.lefthalf.filled", color: tfaColor)

                    VStack(alignment: .leading, spacing: MeeshySpacing.xs / 2) {
                        Text(String(localized: "2fa_status_label", defaultValue: "Statut 2FA"))
                            .font(MeeshyFont.relative(10, weight: .medium))
                            .foregroundColor(theme.textMuted)

                        if twoFactorViewModel.isLoading {
                            ProgressView()
                                .scaleEffect(0.7)
                        } else {
                            Text(twoFactorViewModel.isEnabled
                                 ? String(localized: "2fa_enabled", defaultValue: "Active")
                                 : String(localized: "2fa_disabled", defaultValue: "Desactive"))
                                .font(MeeshyFont.relative(14, weight: .medium))
                                .foregroundColor(twoFactorViewModel.isEnabled ? MeeshyColors.success : theme.textMuted)
                        }
                    }

                    Spacer()

                    if twoFactorViewModel.isEnabled {
                        Text(String(localized: "2fa_badge_active", defaultValue: "Active"))
                            .font(MeeshyFont.relative(10, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, MeeshySpacing.sm - 2)
                            .padding(.vertical, MeeshySpacing.xs / 2)
                            .background(Capsule().fill(MeeshyColors.success))
                    }
                }
                .padding(.horizontal, MeeshySpacing.md + 2)
                .padding(.vertical, MeeshySpacing.sm + 2)

                HStack(spacing: MeeshySpacing.sm + 2) {
                    if twoFactorViewModel.isEnabled {
                        Button {
                            HapticFeedback.light()
                            showBackupCodesSheet = true
                        } label: {
                            HStack(spacing: MeeshySpacing.xs + 2) {
                                Image(systemName: "key.fill")
                                    .font(.caption)
                                Text(String(localized: "2fa_backup_codes_button", defaultValue: "Codes de secours"))
                                    .font(.footnote.weight(.semibold))
                            }
                            .foregroundColor(MeeshyColors.indigo500)
                            .padding(.horizontal, MeeshySpacing.md + 2)
                            .padding(.vertical, MeeshySpacing.sm)
                            .background(Capsule().fill(MeeshyColors.indigo500.opacity(0.12)))
                        }

                        Button {
                            HapticFeedback.medium()
                            showTwoFactorDisableSheet = true
                        } label: {
                            HStack(spacing: MeeshySpacing.xs + 2) {
                                Image(systemName: "shield.slash.fill")
                                    .font(.caption)
                                Text(String(localized: "2fa_disable_button", defaultValue: "Desactiver"))
                                    .font(.footnote.weight(.semibold))
                            }
                            .foregroundColor(MeeshyColors.error)
                            .padding(.horizontal, MeeshySpacing.md + 2)
                            .padding(.vertical, MeeshySpacing.sm)
                            .background(Capsule().fill(MeeshyColors.error.opacity(0.10)))
                        }
                    } else {
                        Button {
                            HapticFeedback.medium()
                            showTwoFactorSetupSheet = true
                        } label: {
                            HStack(spacing: MeeshySpacing.xs + 2) {
                                Image(systemName: "shield.lefthalf.filled.badge.checkmark")
                                    .font(.caption)
                                Text(String(localized: "2fa_enable_button", defaultValue: "Activer 2FA"))
                                    .font(.footnote.weight(.semibold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, MeeshySpacing.md + 2)
                            .padding(.vertical, MeeshySpacing.sm)
                            .background(Capsule().fill(MeeshyColors.indigo500))
                        }
                    }
                }
                .padding(.horizontal, MeeshySpacing.md + 2)
                .padding(.bottom, MeeshySpacing.sm + 2)

                if let twoFactorError = twoFactorViewModel.error {
                    Text(twoFactorError)
                        .font(.caption.weight(.medium))
                        .foregroundColor(MeeshyColors.error)
                        .padding(.horizontal, MeeshySpacing.md + 2)
                        .padding(.bottom, MeeshySpacing.sm + 2)
                }
            }
            .background(sectionBackground(tint: tfaColor))
        }
    }

    // MARK: - Active Sessions Section

    private var activeSessionsSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "security_sessions_header", defaultValue: "Sessions"), icon: "laptopcomputer.and.iphone", color: "818CF8")

            Button {
                HapticFeedback.light()
                showActiveSessions = true
            } label: {
                HStack(spacing: MeeshySpacing.md) {
                    fieldIcon("laptopcomputer.and.iphone", color: "818CF8")

                    Text(String(localized: "security_sessions_manage", defaultValue: "Gerer les sessions actives"))
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
                .padding(.horizontal, MeeshySpacing.md + 2)
                .padding(.vertical, MeeshySpacing.md)
            }
            .background(sectionBackground(tint: "818CF8"))
        }
        .sheet(isPresented: $showActiveSessions) {
            ActiveSessionsView()
                .environmentObject(theme)
        }
    }

    // MARK: - Components

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: MeeshySpacing.xs + 2) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, MeeshySpacing.xs)
        .accessibilityAddTraits(.isHeader)
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
            .font(MeeshyFont.relative(14, weight: .medium))
            .foregroundColor(Color(hex: color))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.sm - 2)
                    .fill(Color(hex: color).opacity(0.12))
            )
    }

    private func verificationBadge(verified: Bool) -> some View {
        Text(verified
             ? String(localized: "settings.security.verified", defaultValue: "Verifie", bundle: .main)
             : String(localized: "settings.security.not_verified", defaultValue: "Non verifie", bundle: .main))
            .font(MeeshyFont.relative(10, weight: .semibold))
            .foregroundColor(.white)
            .padding(.horizontal, MeeshySpacing.sm - 2)
            .padding(.vertical, MeeshySpacing.xs / 2)
            .background(Capsule().fill(verified ? MeeshyColors.success : MeeshyColors.warning))
            .accessibilityLabel(verified
                                ? String(localized: "settings.security.verified", defaultValue: "Verifie", bundle: .main)
                                : String(localized: "settings.security.not_verified", defaultValue: "Non verifie", bundle: .main))
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
            } catch let error as APIError {
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

    private func submitPhoneChange() {
        phoneLoading = true
        phoneError = nil

        Task {
            do {
                _ = try await UserService.shared.changePhone(ChangePhoneRequest(newPhoneNumber: newPhone))
                HapticFeedback.success()
                withAnimation { phoneSent = true }
            } catch let error as APIError {
                HapticFeedback.error()
                phoneError = error.errorDescription
            } catch {
                HapticFeedback.error()
                phoneError = String(localized: "common.error.generic", defaultValue: "Une erreur est survenue", bundle: .main)
            }
            phoneLoading = false
        }
    }

    private func verifyPhoneCode() {
        phoneVerifying = true
        phoneError = nil

        Task {
            do {
                _ = try await UserService.shared.verifyPhoneChange(VerifyPhoneChangeRequest(code: phoneCode))
                HapticFeedback.success()
                await authManager.checkExistingSession()
                withAnimation {
                    phoneSent = false
                    isEditingPhone = false
                    phoneCode = ""
                    newPhone = ""
                }
            } catch let error as APIError {
                HapticFeedback.error()
                switch error {
                case .serverError(400, _):
                    phoneError = String(localized: "settings.security.phone.code_invalid", defaultValue: "Code incorrect ou expire", bundle: .main)
                default:
                    phoneError = error.errorDescription
                }
            } catch {
                HapticFeedback.error()
                phoneError = String(localized: "common.error.generic", defaultValue: "Une erreur est survenue", bundle: .main)
            }
            phoneVerifying = false
        }
    }
}

