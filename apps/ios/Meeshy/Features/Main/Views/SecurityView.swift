import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct SecurityView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var authManager = AuthManager.shared

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
        .sheet(isPresented: $showChangePassword) {
            ChangePasswordView()
        }
        // PIN setup (no existing PIN)
        .sheet(isPresented: $showPinSetupSheet) {
            ConversationLockSheet(
                mode: .setupMasterPin,
                conversationId: nil,
                conversationName: "toutes les conversations",
                onSuccess: {}
            )
            .environmentObject(theme)
        }
        // Change PIN (verify current + set new — single multi-step sheet)
        .sheet(isPresented: $showPinChangeSheet) {
            ConversationLockSheet(
                mode: .changeMasterPin,
                conversationId: nil,
                conversationName: "toutes les conversations",
                onSuccess: {}
            )
            .environmentObject(theme)
        }
        // Remove master PIN
        .sheet(isPresented: $showPinRemoveSheet) {
            ConversationLockSheet(
                mode: .removeMasterPin,
                conversationId: nil,
                conversationName: "toutes les conversations",
                onSuccess: {}
            )
            .environmentObject(theme)
        }
        // Unlock all conversations
        .sheet(isPresented: $showUnlockAllSheet) {
            ConversationLockSheet(
                mode: .unlockAll,
                conversationId: nil,
                conversationName: "toutes les conversations",
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
        .onChange(of: scenePhase) { _, newPhase in
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
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Retour")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(MeeshyColors.indigo500)
            }

            Spacer()

            Text("Securite")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Color.clear.frame(width: 60, height: 24)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 24) {
                passwordSection
                twoFactorSection
                emailSection
                phoneSection
                conversationLockSection
                activeSessionsSection
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    // MARK: - Password Section

    private var passwordSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Mot de passe", icon: "lock.fill", color: "6366F1")

            Button {
                HapticFeedback.light()
                showChangePassword = true
            } label: {
                HStack(spacing: 12) {
                    fieldIcon("key.fill", color: "6366F1")

                    Text("Changer le mot de passe")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
            }
            .background(sectionBackground(tint: "6366F1"))
        }
    }

    // MARK: - Email Section

    private var emailSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Email", icon: "envelope.fill", color: accentColor)

            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    fieldIcon("envelope.fill", color: accentColor)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Email actuel")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(theme.textMuted)

                        Text(user?.email ?? "Non defini")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(user?.email != nil ? theme.textPrimary : theme.textMuted)
                    }

                    Spacer()
                    
                    if let email = user?.email, !email.isEmpty {
                        verificationBadge(verified: user?.emailVerifiedAt != nil)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)

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
                            HStack(spacing: 8) {
                                Image(systemName: "pencil")
                                    .font(.system(size: 12, weight: .semibold))
                                Text("Modifier")
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundColor(MeeshyColors.indigo500)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                        }
                        
                        if let email = user?.email, !email.isEmpty, user?.emailVerifiedAt == nil {
                            Button {
                                HapticFeedback.light()
                                newEmail = email
                                submitEmailChange()
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "checkmark.seal.fill")
                                        .font(.system(size: 12, weight: .semibold))
                                    Text("Vérifier")
                                        .font(.system(size: 13, weight: .semibold))
                                }
                                .foregroundColor(MeeshyColors.success)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                            }
                        }
                        
                        Spacer()
                    }
                    .padding(.horizontal, 14)
                    .padding(.bottom, 10)
                }

                if let emailError {
                    Text(emailError)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                        .padding(.horizontal, 14)
                        .padding(.bottom, 10)
                }
            }
            .background(sectionBackground(tint: accentColor))
        }
    }

    private var emailEditContent: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                fieldIcon("at", color: accentColor)

                TextField("Nouvel email", text: $newEmail)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .autocapitalization(.none)
                    .disableAutocorrection(true)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)

            HStack(spacing: 10) {
                Button {
                    HapticFeedback.light()
                    withAnimation { isEditingEmail = false; newEmail = ""; emailError = nil }
                } label: {
                    Text("Annuler")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(theme.textMuted.opacity(0.12)))
                }

                Button {
                    HapticFeedback.medium()
                    submitEmailChange()
                } label: {
                    HStack(spacing: 6) {
                        if emailLoading {
                            ProgressView().scaleEffect(0.7).tint(.white)
                        }
                        Text("Envoyer")
                            .font(.system(size: 13, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
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
            .padding(.horizontal, 14)
            .padding(.bottom, 10)
        }
    }

    private var emailSentContent: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "envelope.badge.fill")
                    .font(.system(size: 14))
                    .foregroundColor(MeeshyColors.success)
                Text("Email de verification envoye")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(MeeshyColors.success)
            }
            .padding(.horizontal, 14)

            Button {
                HapticFeedback.light()
                resendEmailVerification()
            } label: {
                Text(resendCooldown > 0 ? "Renvoyer (\(resendCooldown)s)" : "Renvoyer l'email")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(resendCooldown > 0 ? theme.textMuted : MeeshyColors.indigo500)
            }
            .disabled(resendCooldown > 0)
            .padding(.bottom, 10)
        }
    }

    // MARK: - Phone Section

    private var phoneSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Telephone", icon: "phone.fill", color: "818CF8")

            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    fieldIcon("phone.fill", color: "818CF8")

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Telephone actuel")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(theme.textMuted)

                        Text(user?.phoneNumber ?? "Non defini")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(user?.phoneNumber != nil ? theme.textPrimary : theme.textMuted)
                    }

                    Spacer()
                    
                    if let phone = user?.phoneNumber, !phone.isEmpty {
                        verificationBadge(verified: user?.phoneVerifiedAt != nil)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)

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
                            HStack(spacing: 8) {
                                Image(systemName: "pencil")
                                    .font(.system(size: 12, weight: .semibold))
                                Text("Modifier")
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundColor(MeeshyColors.indigo400)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                        }
                        
                        if let phone = user?.phoneNumber, !phone.isEmpty, user?.phoneVerifiedAt == nil {
                            Button {
                                HapticFeedback.light()
                                newPhone = phone
                                submitPhoneChange()
                            } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "checkmark.seal.fill")
                                        .font(.system(size: 12, weight: .semibold))
                                    Text("Vérifier")
                                        .font(.system(size: 13, weight: .semibold))
                                }
                                .foregroundColor(MeeshyColors.success)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                            }
                        }
                        
                        Spacer()
                    }
                    .padding(.horizontal, 14)
                    .padding(.bottom, 10)
                }

                if let phoneError {
                    Text(phoneError)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                        .padding(.horizontal, 14)
                        .padding(.bottom, 10)
                }
            }
            .background(sectionBackground(tint: "818CF8"))
        }
    }

    private var phoneEditContent: some View {
        VStack(spacing: 10) {
            HStack(spacing: 12) {
                fieldIcon("phone.badge.plus", color: "818CF8")

                TextField("+33 6 12 34 56 78", text: $newPhone)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .textContentType(.telephoneNumber)
                    .keyboardType(.phonePad)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)

            HStack(spacing: 10) {
                Button {
                    HapticFeedback.light()
                    withAnimation { isEditingPhone = false; newPhone = ""; phoneError = nil }
                } label: {
                    Text("Annuler")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(theme.textMuted.opacity(0.12)))
                }

                Button {
                    HapticFeedback.medium()
                    submitPhoneChange()
                } label: {
                    HStack(spacing: 6) {
                        if phoneLoading {
                            ProgressView().scaleEffect(0.7).tint(.white)
                        }
                        Text("Envoyer le code")
                            .font(.system(size: 13, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
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
            .padding(.horizontal, 14)
            .padding(.bottom, 10)
        }
    }

    private var phoneCodeContent: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "ellipsis.message.fill")
                    .font(.system(size: 14))
                    .foregroundColor(MeeshyColors.success)
                Text("Code envoye par SMS")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(MeeshyColors.success)
            }
            .padding(.horizontal, 14)

            HStack(spacing: 12) {
                fieldIcon("number", color: "818CF8")

                TextField("Code a 6 chiffres", text: $phoneCode)
                    .font(.system(size: 16, weight: .semibold, design: .monospaced))
                    .foregroundColor(theme.textPrimary)
                    .keyboardType(.numberPad)
                    .onChange(of: phoneCode) { _, newValue in
                        phoneCode = String(newValue.prefix(6).filter(\.isNumber))
                    }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)

            HStack(spacing: 10) {
                Button {
                    HapticFeedback.light()
                    withAnimation { phoneSent = false; isEditingPhone = false; phoneCode = ""; newPhone = ""; phoneError = nil }
                } label: {
                    Text("Annuler")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Capsule().fill(theme.textMuted.opacity(0.12)))
                }

                Button {
                    HapticFeedback.medium()
                    verifyPhoneCode()
                } label: {
                    HStack(spacing: 6) {
                        if phoneVerifying {
                            ProgressView().scaleEffect(0.7).tint(.white)
                        }
                        Text("Verifier")
                            .font(.system(size: 13, weight: .bold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
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
            .padding(.horizontal, 14)
            .padding(.bottom, 10)
        }
    }

    // MARK: - Conversation Lock PIN Section

    private var conversationLockSection: some View {
        let hasMasterPIN = lockManager.masterPinConfigured
        let lockedCount = lockManager.lockedConversationIds.count
        let lockColor = "F87171"
        return VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Conversations verrouillées", icon: "lock.shield.fill", color: lockColor)

            VStack(spacing: 0) {
                // Status row
                HStack(spacing: 12) {
                    fieldIcon("lock.shield.fill", color: lockColor)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Master PIN")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(theme.textMuted)
                        Text(hasMasterPIN ? "Configuré" : "Non configuré")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(hasMasterPIN ? MeeshyColors.success : theme.textMuted)
                    }

                    Spacer()

                    if hasMasterPIN {
                        HStack(spacing: 8) {
                            if lockedCount > 0 {
                                Text("\(lockedCount) verrou(s)")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundColor(MeeshyColors.error)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 3)
                                    .background(Capsule().fill(MeeshyColors.error.opacity(0.15)))
                            }
                            Image(systemName: "checkmark.shield.fill")
                                .font(.system(size: 16))
                                .foregroundColor(MeeshyColors.success)
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)

                // Actions
                HStack(spacing: 10) {
                    if !hasMasterPIN {
                        Button {
                            HapticFeedback.medium()
                            showPinSetupSheet = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "plus.circle.fill")
                                    .font(.system(size: 12))
                                Text("Configurer")
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                Capsule().fill(MeeshyColors.error)
                            )
                        }
                    } else {
                        Button {
                            HapticFeedback.light()
                            showPinChangeSheet = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "pencil.circle.fill")
                                    .font(.system(size: 12))
                                Text("Modifier")
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundColor(MeeshyColors.error)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(MeeshyColors.error.opacity(0.12)))
                        }

                        if lockedCount > 0 {
                            Button {
                                HapticFeedback.medium()
                                showUnlockAllSheet = true
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "lock.open.fill")
                                        .font(.system(size: 12))
                                    Text("Déverrouiller tout (\(lockedCount))")
                                        .font(.system(size: 13, weight: .semibold))
                                }
                                .foregroundColor(.white)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(Capsule().fill(MeeshyColors.warning))
                            }
                        }

                        if lockedCount == 0 {
                            Button {
                                HapticFeedback.medium()
                                showPinRemoveSheet = true
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "trash.circle.fill")
                                        .font(.system(size: 12))
                                    Text("Supprimer")
                                        .font(.system(size: 13, weight: .semibold))
                                }
                                .foregroundColor(MeeshyColors.error)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(Capsule().fill(MeeshyColors.error.opacity(0.10)))
                            }
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 10)
            }
            .background(sectionBackground(tint: lockColor))
        }
    }

    // MARK: - Two-Factor Authentication Section

    private var twoFactorSection: some View {
        let tfaColor = "6366F1"
        return VStack(alignment: .leading, spacing: 8) {
            sectionHeader(
                title: String(localized: "2fa_section_title", defaultValue: "Authentification a deux facteurs"),
                icon: "shield.lefthalf.filled",
                color: tfaColor
            )

            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    fieldIcon("shield.lefthalf.filled", color: tfaColor)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(localized: "2fa_status_label", defaultValue: "Statut 2FA"))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(theme.textMuted)

                        if twoFactorViewModel.isLoading {
                            ProgressView()
                                .scaleEffect(0.7)
                        } else {
                            Text(twoFactorViewModel.isEnabled
                                 ? String(localized: "2fa_enabled", defaultValue: "Active")
                                 : String(localized: "2fa_disabled", defaultValue: "Desactive"))
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(twoFactorViewModel.isEnabled ? MeeshyColors.success : theme.textMuted)
                        }
                    }

                    Spacer()

                    if twoFactorViewModel.isEnabled {
                        Text(String(localized: "2fa_badge_active", defaultValue: "Active"))
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(MeeshyColors.success))
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)

                HStack(spacing: 10) {
                    if twoFactorViewModel.isEnabled {
                        Button {
                            HapticFeedback.light()
                            showBackupCodesSheet = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "key.fill")
                                    .font(.system(size: 12))
                                Text(String(localized: "2fa_backup_codes_button", defaultValue: "Codes de secours"))
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundColor(MeeshyColors.indigo500)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(MeeshyColors.indigo500.opacity(0.12)))
                        }

                        Button {
                            HapticFeedback.medium()
                            showTwoFactorDisableSheet = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "shield.slash.fill")
                                    .font(.system(size: 12))
                                Text(String(localized: "2fa_disable_button", defaultValue: "Desactiver"))
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundColor(MeeshyColors.error)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(MeeshyColors.error.opacity(0.10)))
                        }
                    } else {
                        Button {
                            HapticFeedback.medium()
                            showTwoFactorSetupSheet = true
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "shield.lefthalf.filled.badge.checkmark")
                                    .font(.system(size: 12))
                                Text(String(localized: "2fa_enable_button", defaultValue: "Activer 2FA"))
                                    .font(.system(size: 13, weight: .semibold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(Capsule().fill(MeeshyColors.indigo500))
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 10)

                if let twoFactorError = twoFactorViewModel.error {
                    Text(twoFactorError)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                        .padding(.horizontal, 14)
                        .padding(.bottom, 10)
                }
            }
            .background(sectionBackground(tint: tfaColor))
        }
    }

    // MARK: - Active Sessions Section

    private var activeSessionsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "security_sessions_header", defaultValue: "Sessions"), icon: "laptopcomputer.and.iphone", color: "818CF8")

            Button {
                HapticFeedback.light()
                showActiveSessions = true
            } label: {
                HStack(spacing: 12) {
                    fieldIcon("laptopcomputer.and.iphone", color: "818CF8")

                    Text(String(localized: "security_sessions_manage", defaultValue: "Gerer les sessions actives"))
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textPrimary)

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
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
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, 4)
    }

    private func sectionBackground(tint: String) -> some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(theme.surfaceGradient(tint: tint))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(theme.border(tint: tint), lineWidth: 1)
            )
    }

    private func fieldIcon(_ name: String, color: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(Color(hex: color))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(hex: color).opacity(0.12))
            )
    }

    private func verificationBadge(verified: Bool) -> some View {
        Text(verified ? "Verifie" : "Non verifie")
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(verified ? MeeshyColors.success : MeeshyColors.warning))
            .accessibilityLabel(verified ? "Verifie" : "Non verifie")
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
                emailError = "Une erreur est survenue"
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
                emailError = "Impossible de renvoyer l'email"
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
                phoneError = "Une erreur est survenue"
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
                    phoneError = "Code incorrect ou expire"
                default:
                    phoneError = error.errorDescription
                }
            } catch {
                HapticFeedback.error()
                phoneError = "Une erreur est survenue"
            }
            phoneVerifying = false
        }
    }
}

