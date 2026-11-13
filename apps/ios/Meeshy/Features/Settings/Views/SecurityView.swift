import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct SecurityView: View {
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var authManager: AuthManager

    @State private var showChangePassword = false
    @State private var pinFocused = false
    @State private var showActiveSessions = false

    // 2FA
    @StateObject private var twoFactorViewModel = TwoFactorViewModel()
    @State private var showTwoFactorSetupSheet = false
    @State private var showTwoFactorDisableSheet = false
    @State private var showBackupCodesSheet = false

    // Conversation lock PIN
    @ObservedObject private var lockManager: ConversationLockManager
    init(lockManager: ConversationLockManager = .shared) {
        self.lockManager = lockManager
    }
    @State private var showPinSetupSheet = false
    @State private var showPinChangeSheet = false
    @State private var showPinRemoveSheet = false
    @State private var showUnlockAllSheet = false

    // Phone change — le flux est partagé avec la proposition faite avant la
    // recherche de contacts (#8843).
    @StateObject private var phoneFlow = PhoneChangeFlowModel()

    private var user: MeeshyUser? { authManager.currentUser }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            // Retour en verre de l'en-tête partagé (#6481) ; la page possède le défilement.
            ScrollViewReader { proxy in CollapsibleHeaderPage(
                title: String(localized: "settings.security.title", defaultValue: "Sécurité", bundle: .main),
                onBack: { dismiss() },
                titleColor: theme.textPrimary,
                backArrowColor: MeeshyColors.indigo500,
                backgroundColor: theme.backgroundPrimary
            ) {
                sectionsContent
            }.onAppear { focusMasterPinIfRequested(proxy) } }
        }
        .sheet(isPresented: $showChangePassword) {
            ChangePasswordView()
        }
        // PIN setup (no existing PIN)
        .sheet(isPresented: $showPinSetupSheet) {
            masterPinSheet(.setupMasterPin)
        }
        // Change PIN (verify current + set new — single multi-step sheet)
        .sheet(isPresented: $showPinChangeSheet) {
            masterPinSheet(.changeMasterPin)
        }
        // Remove master PIN
        .sheet(isPresented: $showPinRemoveSheet) {
            masterPinSheet(.removeMasterPin)
        }
        // Unlock all conversations
        .sheet(isPresented: $showUnlockAllSheet) {
            masterPinSheet(.unlockAll)
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
        .onAppear { Task { await twoFactorViewModel.checkStatus() } }
    }

    private func masterPinSheet(_ mode: ConversationLockSheet.Mode) -> some View {
        ConversationLockSheet(
            mode: mode,
            conversationId: nil,
            conversationName: String(localized: "settings.security.all_conversations", defaultValue: "toutes les conversations", bundle: .main),
            onSuccess: {}
        )
        .environmentObject(theme)
    }

    // MARK: - Sections Content

    private var sectionsContent: some View {
        VStack(spacing: MeeshySpacing.xxl) {
            passwordSection
            SecurityTwoFactorSection(
                viewModel: twoFactorViewModel,
                onShowBackupCodes: { showBackupCodesSheet = true },
                onDisable: { showTwoFactorDisableSheet = true },
                onEnable: { showTwoFactorSetupSheet = true }
            )
            SecurityEmailSection(user: user)
            SecurityPhoneSection(user: user, phoneFlow: phoneFlow)
            SecurityConversationLockSection(
                lockManager: lockManager,
                onSetup: { showPinSetupSheet = true },
                onChange: { showPinChangeSheet = true },
                onUnlockAll: { showUnlockAllSheet = true },
                onRemove: { showPinRemoveSheet = true }
            )
            .id(SettingsFocus.masterPin.rawValue)
            .modifier(SettingsFocusHighlight(isActive: pinFocused))
            activeSessionsSection
            EncryptedDevicesEntry()
            Spacer().frame(height: 40)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.lg)
    }

    /// #16339 — l'invite « configurez un master PIN » a désigné ce réglage.
    private func focusMasterPinIfRequested(_ proxy: ScrollViewProxy) {
        guard SettingsFocusRequest.shared.consume(.masterPin) else { return }
        pinFocused = true
        Task { await DelayedUI.perform(after: .milliseconds(350)) {
            withAnimation(.easeInOut(duration: 0.4)) { proxy.scrollTo(SettingsFocus.masterPin.rawValue, anchor: .center) }
        } }
    }

    // MARK: - Password Section

    private var passwordSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            SecuritySectionHeader(title: String(localized: "settings.security.password", defaultValue: "Mot de passe", bundle: .main), icon: "lock.fill", color: MeeshyColors.brandPrimaryHex)

            Button {
                HapticFeedback.light()
                showChangePassword = true
            } label: {
                HStack(spacing: MeeshySpacing.md) {
                    SecurityFieldIcon("key.fill", color: MeeshyColors.brandPrimaryHex)

                    Text(String(localized: "settings.security.change_password", defaultValue: "Changer", bundle: .main))
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(theme.textPrimary)

                    Spacer()

                    Image(systemName: "chevron.forward")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(theme.textMuted)
                }
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.md)
            }
            .background(SettingsSectionBackground(tint: MeeshyColors.brandPrimaryHex))
        }
    }

    // MARK: - Active Sessions Section

    private var activeSessionsSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            SecuritySectionHeader(title: String(localized: "security_sessions_header", defaultValue: "Sessions"), icon: "laptopcomputer.and.iphone", color: MeeshyColors.indigo400Hex)
            SettingsSentence(text: String(localized: "security_sessions_summary", defaultValue: "Les appareils connectés à votre compte."))

            Button {
                HapticFeedback.light()
                showActiveSessions = true
            } label: {
                HStack(spacing: MeeshySpacing.md) {
                    SecurityFieldIcon("laptopcomputer.and.iphone", color: MeeshyColors.indigo400Hex)

                    Text(String(localized: "security_sessions_manage", defaultValue: "Voir les sessions"))
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(theme.textPrimary)

                    Spacer()

                    Image(systemName: "chevron.forward")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(theme.textMuted)
                }
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .padding(.vertical, MeeshySpacing.md)
            }
            .background(SettingsSectionBackground(tint: MeeshyColors.indigo400Hex))
        }
        .sheet(isPresented: $showActiveSessions) {
            ActiveSessionsView()
                .environmentObject(theme)
        }
    }
}
