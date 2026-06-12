import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var router: Router
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var authManager: AuthManager
    @ObservedObject private var prefs = UserPreferencesManager.shared
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    @State private var showLogoutConfirm = false
    /// Q6 (P1) — driver d'overlay pendant `await authManager.logout()`.
    /// L'alert iOS native ne permet pas un spinner inline sur son bouton,
    /// donc on affiche un overlay sobre tant que la quiesce-then-purge
    /// async n'est pas terminée. Empêche aussi le double-tap sur le
    /// bouton "Se déconnecter" (disabled).
    @State private var isLoggingOut = false
    @State private var showPrivacySettings = false
    @State private var showNotificationSettings = false
    @State private var showSecurity = false
    @State private var showBlockedUsers = false
    @State private var showAbout = false
    @State private var showPrivacyPolicy = false
    @State private var showTerms = false
    @State private var showLicenses = false
    @State private var showSupport = false
    @State private var showDataStorage = false
    @State private var showDataExport = false
    @State private var showDeleteAccount = false
    @State private var showStats = false
    @State private var showAffiliate = false
    @State private var showVoiceProfileWizard = false
    @State private var showVoiceProfileManage = false
    @State private var showMediaDownload = false
    @State private var scrollOffset: CGFloat = 0

    private let accentColor = MeeshyColors.brandPrimaryHex

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            scrollContent

            VStack(spacing: 0) {
                header
                Spacer()
            }
        }
        .sheet(isPresented: $showStats) { UserStatsView() }
        .sheet(isPresented: $showAffiliate) { AffiliateView() }
        .sheet(isPresented: $showDataExport) { DataExportView() }
        .alert(String(localized: "settings.logout.title", defaultValue: "Déconnexion", bundle: .main), isPresented: $showLogoutConfirm) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) { }
            Button(String(localized: "settings.logout.title", defaultValue: "Déconnexion", bundle: .main), role: .destructive) {
                // P1 — logout() est désormais async + quiesce-then-purge
                // (disconnect sockets, reset services SDK, wipe keychain).
                // Le disconnect explicite du socket n'est plus nécessaire,
                // il est intégré au logout().
                // Q6 — overlay loading pendant l'await (300-800ms p50/p95).
                isLoggingOut = true
                Task {
                    await authManager.logout()
                    isLoggingOut = false
                }
            }
        } message: {
            Text(String(localized: "settings.logout.message", defaultValue: "Voulez-vous vraiment vous déconnecter ?", bundle: .main))
        }
        .overlay {
            // Q6 — overlay sobre pendant le logout async (p50 ~300ms,
            // p95 ~800ms). Pattern industriel WhatsApp/Signal. Bloque
            // les interactions utilisateur pour éviter qu'un tap arrive
            // pendant le quiesce et provoque une navigation orpheline.
            if isLoggingOut {
                ZStack {
                    Color.black.opacity(0.45).ignoresSafeArea()
                    VStack(spacing: 14) {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .controlSize(.large)
                            .tint(.white)
                        Text(String(localized: "settings.logout.inprogress", defaultValue: "Déconnexion en cours…", bundle: .main))
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(.white)
                    }
                    .padding(.horizontal, 32)
                    .padding(.vertical, 24)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 16))
                }
                .transition(.opacity)
                .animation(.easeInOut(duration: 0.18), value: isLoggingOut)
            }
        }
        .sheet(isPresented: $showPrivacySettings) {
            PrivacySettingsView()
        }
        .sheet(isPresented: $showNotificationSettings) {
            NotificationSettingsView()
        }
        .sheet(isPresented: $showSecurity) {
            SecurityView()
        }
        .sheet(isPresented: $showBlockedUsers) {
            BlockedUsersView()
        }
        .sheet(isPresented: $showAbout) { AboutView() }
        .sheet(isPresented: $showPrivacyPolicy) { PrivacyPolicyView() }
        .sheet(isPresented: $showTerms) { TermsOfServiceView() }
        .sheet(isPresented: $showLicenses) { LicensesView() }
        .sheet(isPresented: $showSupport) { SupportView() }
        .sheet(isPresented: $showDataStorage) { DataStorageView() }
        .sheet(isPresented: $showMediaDownload) { MediaDownloadSettingsView() }
        .sheet(isPresented: $showDeleteAccount) { DeleteAccountView() }
        .task { await prefs.fetchFromBackend() }
    }

    // MARK: - Header

    private var header: some View {
        CollapsibleHeader(
            title: String(localized: "settings.title", defaultValue: "Réglages", bundle: .main),
            scrollOffset: scrollOffset,
            onBack: { router.pop() },
            titleColor: theme.textPrimary,
            backArrowColor: Color(hex: accentColor),
            backgroundColor: theme.backgroundPrimary
        )
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            GeometryReader { geo in
                Color.clear.preference(
                    key: ScrollOffsetPreferenceKey.self,
                    value: geo.frame(in: .named("scroll")).minY
                )
            }
            .frame(height: 0)

            Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)

            VStack(spacing: 20) {
                profileCard
                accountSection
                appearanceSection
                voiceProfileSection
                transcriptionSection
                notificationsSection
                dataSection
                meeshyToolsSection
                supportSection
                aboutSection
                logoutSection

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
        .coordinateSpace(name: "scroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollOffset = $0 }
    }

    // MARK: - Account Section

    private var profileCard: some View {
        Button {
            HapticFeedback.light()
            router.push(.profile)
        } label: {
            HStack(spacing: 14) {
                MeeshyAvatar(
                    name: authManager.currentUser?.displayName ?? "?",
                    context: .conversationList,
                    avatarURL: authManager.currentUser?.avatar,
                    presenceState: .online
                )

                VStack(alignment: .leading, spacing: 3) {
                    Text(authManager.currentUser?.displayName ?? String(localized: "settings.my_profile", defaultValue: "Mon profil", bundle: .main))
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    Text("@\(authManager.currentUser?.username ?? "")")
                        .font(.system(size: 13))
                        .foregroundColor(theme.textSecondary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.inputBackground)
            )
        }
        .accessibilityLabel(String(localized: "settings.my_profile", defaultValue: "Mon profil", bundle: .main))
    }

    private var accountSection: some View {
        settingsSection(title: String(localized: "settings.section.account", defaultValue: "Compte", bundle: .main), icon: "person.circle.fill", color: MeeshyColors.trackingAccentHex) {
            Button {
                HapticFeedback.light()
                showPrivacySettings = true
            } label: {
                settingsRow(icon: "lock.fill", title: String(localized: "settings.privacy.title", defaultValue: "Confidentialité", bundle: .main), color: MeeshyColors.brandPrimaryHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.privacy.a11y", defaultValue: "Confidentialite", bundle: .main))
            .accessibilityHint(String(localized: "settings.privacy.hint", defaultValue: "Ouvre les reglages de confidentialite", bundle: .main))

            Button {
                HapticFeedback.light()
                showSecurity = true
            } label: {
                settingsRow(icon: "shield.fill", title: String(localized: "settings.security.title", defaultValue: "Sécurité", bundle: .main), color: MeeshyColors.infoHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.security.a11y", defaultValue: "Securite", bundle: .main))
            .accessibilityHint(String(localized: "settings.security.hint", defaultValue: "Ouvre les reglages de securite", bundle: .main))

            Button {
                HapticFeedback.light()
                showBlockedUsers = true
            } label: {
                settingsRow(icon: "lock.shield", title: String(localized: "settings.blocked_users", defaultValue: "Utilisateurs bloques", bundle: .main), color: MeeshyColors.errorHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.blocked_users", defaultValue: "Utilisateurs bloques", bundle: .main))
            .accessibilityHint(String(localized: "settings.blocked_users.hint", defaultValue: "Ouvre la liste des utilisateurs bloques", bundle: .main))

            Button {
                HapticFeedback.heavy()
                showDeleteAccount = true
            } label: {
                settingsRow(icon: "person.crop.circle.badge.minus", title: String(localized: "settings.delete_account", defaultValue: "Supprimer le compte", bundle: .main), color: MeeshyColors.errorHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(MeeshyColors.error.opacity(0.6))
                }
            }
            .accessibilityLabel(String(localized: "settings.delete_account", defaultValue: "Supprimer le compte", bundle: .main))
            .accessibilityHint(String(localized: "settings.delete_account.hint", defaultValue: "Ouvre la page de suppression de compte", bundle: .main))
        }
    }

    // MARK: - Appearance Section

    private var appearanceSection: some View {
        settingsSection(title: String(localized: "settings.section.appearance", defaultValue: "Apparence", bundle: .main), icon: "paintbrush.fill", color: MeeshyColors.warningHex) {
            settingsRow(icon: theme.preference.icon, title: String(localized: "settings.theme", defaultValue: "Thème", bundle: .main), color: theme.preference.tintColor) {
                HStack(spacing: 8) {
                    ForEach(ThemePreference.allCases, id: \.self) { pref in
                        Button {
                            HapticFeedback.light()
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                theme.preference = pref
                                theme.syncWithSystem(colorScheme)
                            }
                            syncThemeToPrefs(pref)
                        } label: {
                            VStack(spacing: 4) {
                                Image(systemName: pref.icon)
                                    .font(.system(size: 14))
                                Text(pref.label)
                                    .font(.system(size: 9, weight: .medium))
                            }
                            .foregroundColor(theme.preference == pref ? Color(hex: pref.tintColor) : theme.textMuted)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(
                                RoundedRectangle(cornerRadius: 10)
                                    .fill(theme.preference == pref ? Color(hex: pref.tintColor).opacity(0.15) : Color.clear)
                            )
                        }
                        .accessibilityLabel("\(String(localized: "settings.theme", defaultValue: "Thème", bundle: .main)) \(pref.label)")
                        .accessibilityValue(theme.preference == pref ? String(localized: "common.selected", defaultValue: "selectionne", bundle: .main) : "")
                        .accessibilityAddTraits(theme.preference == pref ? .isSelected : [])
                    }
                }
            }

            settingsRow(icon: "globe", title: String(localized: "settings.interface_language", defaultValue: "Langue de l'interface", bundle: .main), color: MeeshyColors.indigo300Hex) {
                Picker("", selection: Binding(
                    get: { prefs.application.interfaceLanguage },
                    set: { val in prefs.updateApplication { $0.interfaceLanguage = val } }
                )) {
                    ForEach(LanguageData.interfaceLanguages, id: \.code) { lang in
                        HStack {
                            Text(lang.flag)
                            Text(lang.nativeName)
                        }
                        .tag(lang.code)
                    }
                }
                .pickerStyle(.menu)
                .tint(MeeshyColors.indigo400)
            }
        }
    }

    // MARK: - Notifications Section

    private var notificationsSection: some View {
        settingsSection(title: String(localized: "settings.section.notifications", defaultValue: "Notifications", bundle: .main), icon: "bell.fill", color: MeeshyColors.errorHex) {
            settingsRow(icon: "bell.badge.fill", title: String(localized: "settings.notifications.title", defaultValue: "Notifications", bundle: .main), color: MeeshyColors.errorHex) {
                Toggle("", isOn: Binding(
                    get: { prefs.notification.pushEnabled },
                    set: { val in prefs.updateNotification { $0.pushEnabled = val } }
                ))
                .labelsHidden()
                .tint(Color(hex: accentColor))
                .accessibilityLabel(String(localized: "settings.notif.push.a11y", defaultValue: "Notifications push", bundle: .main))
                .accessibilityValue(prefs.notification.pushEnabled ? String(localized: "settings.value.active", defaultValue: "active", bundle: .main) : String(localized: "settings.value.disabled", defaultValue: "desactive", bundle: .main))
            }

            settingsRow(icon: "speaker.wave.2.fill", title: String(localized: "settings.notif.sounds", defaultValue: "Sons", bundle: .main), color: MeeshyColors.indigo300Hex) {
                Toggle("", isOn: Binding(
                    get: { prefs.notification.soundEnabled },
                    set: { val in prefs.updateNotification { $0.soundEnabled = val } }
                ))
                .labelsHidden()
                .tint(Color(hex: accentColor))
                .accessibilityLabel(String(localized: "settings.notif.sounds.a11y", defaultValue: "Sons de notification", bundle: .main))
                .accessibilityValue(prefs.notification.soundEnabled ? String(localized: "settings.value.active", defaultValue: "active", bundle: .main) : String(localized: "settings.value.disabled", defaultValue: "desactive", bundle: .main))
            }

            settingsRow(icon: "iphone.radiowaves.left.and.right", title: String(localized: "settings.notif.vibrations", defaultValue: "Vibrations", bundle: .main), color: MeeshyColors.trackingAccentHex) {
                Toggle("", isOn: Binding(
                    get: { prefs.notification.vibrationEnabled },
                    set: { val in prefs.updateNotification { $0.vibrationEnabled = val } }
                ))
                .labelsHidden()
                .tint(Color(hex: accentColor))
                .accessibilityLabel(String(localized: "settings.notif.vibrations", defaultValue: "Vibrations", bundle: .main))
                .accessibilityValue(prefs.notification.vibrationEnabled ? String(localized: "settings.value.active", defaultValue: "active", bundle: .main) : String(localized: "settings.value.disabled", defaultValue: "desactive", bundle: .main))
            }

            Button {
                HapticFeedback.light()
                showNotificationSettings = true
            } label: {
                settingsRow(icon: "slider.horizontal.3", title: String(localized: "settings.notif.more_options", defaultValue: "Plus d'options", bundle: .main), color: MeeshyColors.errorHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.notif.more_options.a11y", defaultValue: "Plus d'options de notifications", bundle: .main))
            .accessibilityHint(String(localized: "settings.notif.more_options.hint", defaultValue: "Ouvre les reglages avances de notifications", bundle: .main))
        }
    }

    // MARK: - Data Section

    private var dataSection: some View {
        settingsSection(title: String(localized: "settings.section.data", defaultValue: "Donnees", bundle: .main), icon: "externaldrive.fill", color: MeeshyColors.warningHex) {
            Button {
                HapticFeedback.light()
                showDataStorage = true
            } label: {
                settingsRow(icon: "internaldrive.fill", title: String(localized: "settings.storage", defaultValue: "Stockage", bundle: .main), color: MeeshyColors.warningHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.storage", defaultValue: "Stockage", bundle: .main))
            .accessibilityHint(String(localized: "settings.storage.hint", defaultValue: "Ouvre les parametres de stockage", bundle: .main))

            Button {
                HapticFeedback.light()
                showMediaDownload = true
            } label: {
                settingsRow(icon: "arrow.down.circle.fill", title: String(localized: "settings.media.download.title", defaultValue: "Telechargement auto", bundle: .main), color: MeeshyColors.warningHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.media.download.a11y", defaultValue: "Telechargement automatique", bundle: .main))
            .accessibilityHint(String(localized: "settings.media.download.hint", defaultValue: "Ouvre les parametres de telechargement automatique des medias", bundle: .main))

            Button {
                HapticFeedback.light()
                showDataExport = true
            } label: {
                settingsRow(icon: "square.and.arrow.up.fill", title: String(localized: "settings.export_data", defaultValue: "Exporter mes donnees", bundle: .main), color: MeeshyColors.warningHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.export_data", defaultValue: "Exporter mes donnees", bundle: .main))
            .accessibilityHint(String(localized: "settings.export_data.hint", defaultValue: "Ouvre la page d'export de donnees", bundle: .main))
        }
    }

    // MARK: - Voice Profile Section

    private var voiceProfileSection: some View {
        settingsSection(title: String(localized: "settings.section.voice", defaultValue: "Profil vocal", bundle: .main), icon: "waveform.and.mic", color: MeeshyColors.trackingAccentHex) {
            Button {
                HapticFeedback.light()
                showVoiceProfileManage = true
            } label: {
                settingsRow(icon: "waveform.circle.fill", title: String(localized: "settings.voice.manage", defaultValue: "Gerer le profil vocal", bundle: .main), color: MeeshyColors.trackingAccentHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.voice.manage", defaultValue: "Gerer le profil vocal", bundle: .main))
            .accessibilityHint(String(localized: "settings.voice.manage.hint", defaultValue: "Ouvre la gestion du profil vocal", bundle: .main))

            Button {
                HapticFeedback.light()
                showVoiceProfileWizard = true
            } label: {
                settingsRow(icon: "plus.circle.fill", title: String(localized: "settings.voice.create", defaultValue: "Creer un profil vocal", bundle: .main), color: MeeshyColors.successHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.voice.create", defaultValue: "Creer un profil vocal", bundle: .main))
            .accessibilityHint(String(localized: "settings.voice.create.hint", defaultValue: "Lance l'assistant de creation de profil vocal", bundle: .main))
        }
        .sheet(isPresented: $showVoiceProfileWizard) {
            VoiceProfileWizardView(accentColor: MeeshyColors.trackingAccentHex)
        }
        .sheet(isPresented: $showVoiceProfileManage) {
            VoiceProfileManageView(accentColor: MeeshyColors.trackingAccentHex)
        }
    }

    // MARK: - Transcription Section

    private var transcriptionSection: some View {
        settingsSection(title: String(localized: "settings.section.transcription", defaultValue: "Transcription", bundle: .main), icon: "text.quote", color: MeeshyColors.indigo300Hex) {
            settingsRow(icon: "waveform", title: String(localized: "settings.transcription.auto", defaultValue: "Transcription automatique", bundle: .main), color: MeeshyColors.indigo300Hex) {
                Toggle("", isOn: Binding(
                    get: { prefs.audio.autoTranscribeIncoming },
                    set: { val in prefs.updateAudio { $0.autoTranscribeIncoming = val } }
                ))
                    .labelsHidden()
                    .tint(Color(hex: accentColor))
                    .accessibilityLabel(String(localized: "settings.transcription.auto", defaultValue: "Transcription automatique", bundle: .main))
                    .accessibilityValue(prefs.audio.autoTranscribeIncoming ? String(localized: "settings.value.active", defaultValue: "active", bundle: .main) : String(localized: "settings.value.disabled", defaultValue: "desactive", bundle: .main))
            }

            settingsRow(icon: "info.circle", title: String(localized: "settings.transcription.engine", defaultValue: "Apple Speech (on-device)", bundle: .main), color: MeeshyColors.neutral500Hex) {
                EmptyView()
            }
            .accessibilityLabel(String(localized: "settings.transcription.engine.a11y", defaultValue: "Moteur de transcription: Apple Speech sur l'appareil", bundle: .main))
        }
    }

    // MARK: - Meeshy Tools Section

    private var meeshyToolsSection: some View {
        settingsSection(title: String(localized: "settings.section.tools", defaultValue: "Outils", bundle: .main), icon: "wrench.and.screwdriver.fill", color: MeeshyColors.successHex) {
            Button {
                HapticFeedback.light()
                router.push(.starredMessages)
            } label: {
                settingsRow(icon: "star.fill", title: String(localized: "settings.tools.starred", defaultValue: "Messages favoris", bundle: .main), color: MeeshyColors.warningHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.tools.starred", defaultValue: "Messages favoris", bundle: .main))
            .accessibilityHint(String(localized: "settings.tools.starred.hint", defaultValue: "Ouvre la liste des messages mis en favoris", bundle: .main))

            Button {
                HapticFeedback.light()
                showStats = true
            } label: {
                settingsRow(icon: "chart.bar.fill", title: String(localized: "settings.tools.stats", defaultValue: "Statistiques", bundle: .main), color: MeeshyColors.indigo300Hex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.tools.stats", defaultValue: "Statistiques", bundle: .main))
            .accessibilityHint(String(localized: "settings.tools.stats.hint", defaultValue: "Ouvre les statistiques d'utilisation", bundle: .main))

            Button {
                HapticFeedback.light()
                showAffiliate = true
            } label: {
                settingsRow(icon: "link.badge.plus", title: String(localized: "settings.tools.affiliate", defaultValue: "Parrainage", bundle: .main), color: MeeshyColors.successHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.tools.affiliate", defaultValue: "Parrainage", bundle: .main))
            .accessibilityHint(String(localized: "settings.tools.affiliate.hint", defaultValue: "Ouvre le programme de parrainage", bundle: .main))
        }
    }

    // MARK: - Support Section

    private var supportSection: some View {
        settingsSection(title: String(localized: "settings.section.help", defaultValue: "Aide", bundle: .main), icon: "questionmark.circle.fill", color: MeeshyColors.successHex) {
            Button {
                HapticFeedback.light()
                showSupport = true
            } label: {
                settingsRow(icon: "lifepreserver.fill", title: String(localized: "settings.help_center", defaultValue: "Centre d'aide", bundle: .main), color: MeeshyColors.successHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.help_center", defaultValue: "Centre d'aide", bundle: .main))
            .accessibilityHint(String(localized: "settings.help_center.hint", defaultValue: "Ouvre le centre d'aide et support", bundle: .main))
        }
    }

    // MARK: - About Section

    private var aboutSection: some View {
        settingsSection(title: String(localized: "settings.section.about", defaultValue: "A propos", bundle: .main), icon: "info.circle.fill", color: MeeshyColors.infoHex) {
            Button {
                HapticFeedback.light()
                showAbout = true
            } label: {
                settingsRow(icon: "info.circle.fill", title: String(localized: "settings.about.meeshy", defaultValue: "A propos de Meeshy", bundle: .main), color: MeeshyColors.infoHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.about.meeshy", defaultValue: "A propos de Meeshy", bundle: .main))
            .accessibilityHint(String(localized: "settings.about.hint", defaultValue: "Ouvre la page a propos", bundle: .main))

            Button {
                HapticFeedback.light()
                showTerms = true
            } label: {
                settingsRow(icon: "doc.text.fill", title: String(localized: "settings.terms", defaultValue: "Conditions d'utilisation", bundle: .main), color: MeeshyColors.infoHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.terms", defaultValue: "Conditions d'utilisation", bundle: .main))
            .accessibilityHint(String(localized: "settings.terms.hint", defaultValue: "Ouvre les conditions d'utilisation", bundle: .main))

            Button {
                HapticFeedback.light()
                showPrivacyPolicy = true
            } label: {
                settingsRow(icon: "hand.raised.fill", title: String(localized: "settings.privacy_policy", defaultValue: "Politique de confidentialite", bundle: .main), color: MeeshyColors.infoHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.privacy_policy", defaultValue: "Politique de confidentialite", bundle: .main))
            .accessibilityHint(String(localized: "settings.privacy_policy.hint", defaultValue: "Ouvre la politique de confidentialite", bundle: .main))

            Button {
                HapticFeedback.light()
                showLicenses = true
            } label: {
                settingsRow(icon: "checkmark.seal.fill", title: String(localized: "settings.licenses", defaultValue: "Licences open source", bundle: .main), color: MeeshyColors.infoHex) {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.licenses", defaultValue: "Licences open source", bundle: .main))
            .accessibilityHint(String(localized: "settings.licenses.hint", defaultValue: "Ouvre la liste des licences open source", bundle: .main))

            settingsRow(icon: "sparkles", title: String(localized: "settings.version", defaultValue: "Version", bundle: .main), color: MeeshyColors.warningHex) {
                Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
    }

    // MARK: - Logout Section

    private var logoutSection: some View {
        Button {
            HapticFeedback.heavy()
            showLogoutConfirm = true
        } label: {
            // Note: le label reste statique — l'overlay sur SettingsView
            // gère le visual feedback pendant l'await. Le `.disabled`
            // ci-dessous empêche le double-tap.
            HStack {
                Image(systemName: "rectangle.portrait.and.arrow.forward")
                    .font(.system(size: 16, weight: .semibold))
                Text(String(localized: "settings.logout.title", defaultValue: "Déconnexion", bundle: .main))
                    .font(.system(size: 15, weight: .semibold))
            }
            .foregroundColor(MeeshyColors.error)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(MeeshyColors.error.opacity(0.1))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(MeeshyColors.error.opacity(0.3), lineWidth: 1)
                    )
            )
        }
        .disabled(isLoggingOut)
        .accessibilityLabel(String(localized: "settings.logout.a11y", defaultValue: "Deconnexion", bundle: .main))
        .accessibilityHint(String(localized: "settings.logout.hint", defaultValue: "Vous deconnecte de votre compte Meeshy", bundle: .main))
    }

    // MARK: - Theme Sync

    private func syncThemeToPrefs(_ pref: ThemePreference) {
        let appTheme: AppThemeMode = switch pref {
        case .system: .auto
        case .light: .light
        case .dark: .dark
        }
        prefs.updateApplication { $0.theme = appTheme }
    }

    // MARK: - Reusable Components

    private func settingsSection<Content: View>(
        title: String,
        icon: String,
        color: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
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

            VStack(spacing: 0) {
                content()
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: color))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: color), lineWidth: 1)
                    )
            )
        }
    }

    private func settingsRow<Trailing: View>(
        icon: String,
        title: String,
        color: String,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: color))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(hex: color).opacity(0.12))
                )
                .accessibilityHidden(true)

            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            trailing()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}
