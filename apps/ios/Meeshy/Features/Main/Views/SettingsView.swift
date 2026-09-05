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
    @State private var showSwitchAccountConfirm = false
    /// Choix explicite de langue d'interface — `nil` = suit la langue
    /// principale du compte. Lu une fois au montage depuis `UILanguageOverride`.
    @State private var interfaceLanguageChoice: String? = UILanguageOverride.explicitChoice
    @State private var showInterfaceLanguageRestartHint = false
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
    @State private var scrollRelay = ScrollOffsetRelay()
    /// Préférence « Activer les bêta » (`BetaFeaturesPreference`, défaut OFF
    /// depuis le 2026-08-22). Lu UNE fois au montage (le même patron que
    /// `interfaceLanguageChoice` ci-dessus) ; le toggle écrit
    /// `BetaFeaturesPreference.setEnabled` ET ce `@State` en même temps — pas
    /// de source de vérité seconde, juste un miroir local pour que la vue se
    /// re-rende sans relire `UserDefaults` à chaque frame.
    @State private var betaFeaturesEnabled: Bool = BetaFeaturesPreference.isEnabled

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
        // iOS ne relit `AppleLanguages` qu'au démarrage : l'écran courant reste
        // dans l'ancienne langue, et le taire ferait passer un réglage qui
        // marche pour un réglage mort — c'est précisément le reproche qui avait
        // fait retirer ce contrôle.
        .alert(String(localized: "settings.interface_language.restart.title",
                      defaultValue: "Langue enregistrée", bundle: .main),
               isPresented: $showInterfaceLanguageRestartHint) {
            Button(String(localized: "common.ok", defaultValue: "OK", bundle: .main), role: .cancel) { }
        } message: {
            Text(String(localized: "settings.interface_language.restart.message",
                        defaultValue: "L'interface passera dans cette langue au prochain démarrage de Meeshy.",
                        bundle: .main))
        }
        .alert(String(localized: "settings.switchAccount.title",
                      defaultValue: "Changer de compte", bundle: .main),
               isPresented: $showSwitchAccountConfirm) {
            Button(String(localized: "common.cancel", bundle: .main), role: .cancel) { }
            Button(String(localized: "settings.switchAccount.title",
                          defaultValue: "Changer de compte", bundle: .main)) {
                // Même quiesce-then-purge que la déconnexion — seule l'entrée
                // du sélecteur survit (`forgettingAccount: false`), pour que
                // l'écran de connexion propose encore ce compte. Le mot de
                // passe reste exigé : `attemptAccountLogin` appelle
                // `login(username:password:)`.
                isLoggingOut = true
                Task {
                    await authManager.logout(forgettingAccount: false)
                    isLoggingOut = false
                }
            }
        } message: {
            Text(String(localized: "settings.switchAccount.message",
                        defaultValue: "Vous reviendrez à l’écran de connexion. Ce compte restera proposé, et son mot de passe vous sera redemandé.",
                        bundle: .main))
        }
        .alert(String(localized: "settings.logout.title", bundle: .main), isPresented: $showLogoutConfirm) {
            Button(String(localized: "common.cancel", bundle: .main), role: .cancel) { }
            Button(String(localized: "settings.logout.title", bundle: .main), role: .destructive) {
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
            Text(String(localized: "settings.logout.message", bundle: .main))
        }
        .overlay {
            // Q6 — overlay sobre pendant le logout async (p50 ~300ms,
            // p95 ~800ms). Pattern industriel WhatsApp/Signal. Bloque
            // les interactions utilisateur pour éviter qu'un tap arrive
            // pendant le quiesce et provoque une navigation orpheline.
            if isLoggingOut {
                ZStack {
                    Color.black.opacity(0.45).ignoresSafeArea()
                    VStack(spacing: MeeshySpacing.md + 2) {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .controlSize(.large)
                            .tint(.white)
                        Text(String(localized: "settings.logout.inprogress", bundle: .main))
                            .font(MeeshyFont.relative(14, weight: .medium))
                            .foregroundStyle(.white)
                    }
                    .padding(.horizontal, MeeshySpacing.xxxl)
                    .padding(.vertical, MeeshySpacing.xxl)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: MeeshyRadius.lg))
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
            // Une feuille n'hérite pas des EnvironmentObject de son
            // présentateur : `SecurityView` lit `authManager`.
            SecurityView()
                .environmentObject(authManager)
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
        // Seul ce reader se re-rend au fil du scroll — la racine écrit
        // `scrollRelay.offset` sans s'y abonner (P1-1).
        ScrollOffsetReader(relay: scrollRelay) { offset in
        CollapsibleHeader(
            title: String(localized: "settings.title", bundle: .main),
            scrollOffset: offset,
            onBack: { router.pop() },
            titleColor: theme.textPrimary,
            backArrowColor: Color(hex: accentColor),
            backgroundColor: theme.backgroundPrimary
        )
        }
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

            VStack(spacing: MeeshySpacing.xl) {
                profileCard
                accountSection
                appearanceSection
                voiceProfileSection
                transcriptionSection
                notificationsSection
                dataSection
                meeshyToolsSection
                betaSection
                supportSection
                aboutSection
                switchAccountSection
                logoutSection

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.sm)
        }
        .coordinateSpace(name: "scroll")
        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }      // iOS 16–17
        .trackScrollContentOffset { scrollRelay.offset = -$0 }                               // iOS 18+ (preference path is dead there)
    }

    // MARK: - Account Section

    private var profileCard: some View {
        Button {
            HapticFeedback.light()
            router.push(.profile)
        } label: {
            HStack(spacing: MeeshySpacing.md + 2) {
                MeeshyAvatar(
                    name: authManager.currentUser?.displayName ?? "?",
                    context: .conversationList,
                    avatarURL: authManager.currentUser?.avatar,
                    presenceState: .online
                )

                VStack(alignment: .leading, spacing: MeeshySpacing.xs - 1) {
                    Text(authManager.currentUser?.displayName ?? String(localized: "settings.my_profile", bundle: .main))
                        .font(MeeshyFont.relative(17, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    Text("@\(authManager.currentUser?.username ?? "")")
                        .font(MeeshyFont.relative(13))
                        .foregroundColor(theme.textSecondary)
                }

                Spacer()

                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }
            .padding(MeeshySpacing.lg)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(theme.inputBackground)
            )
        }
        .accessibilityLabel(String(localized: "settings.my_profile", bundle: .main))
    }

    private var accountSection: some View {
        settingsSection(title: String(localized: "settings.section.account", bundle: .main), icon: "person.circle.fill", color: MeeshyColors.trackingAccentHex) {
            Button {
                HapticFeedback.light()
                showPrivacySettings = true
            } label: {
                settingsRow(icon: "lock.fill", title: String(localized: "settings.privacy.title", bundle: .main), color: MeeshyColors.brandPrimaryHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.privacy.a11y", bundle: .main))
            .accessibilityHint(String(localized: "settings.privacy.hint", bundle: .main))

            Button {
                HapticFeedback.light()
                showSecurity = true
            } label: {
                settingsRow(icon: "shield.fill", title: String(localized: "settings.security.title", bundle: .main), color: MeeshyColors.infoHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.security.a11y", bundle: .main))
            .accessibilityHint(String(localized: "settings.security.hint", bundle: .main))

            Button {
                HapticFeedback.light()
                showBlockedUsers = true
            } label: {
                settingsRow(icon: "lock.shield", title: String(localized: "settings.blocked_users", bundle: .main), color: MeeshyColors.errorHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.blocked_users", bundle: .main))
            .accessibilityHint(String(localized: "settings.blocked_users.hint", bundle: .main))

            Button {
                HapticFeedback.heavy()
                showDeleteAccount = true
            } label: {
                settingsRow(icon: "person.crop.circle.badge.minus", title: String(localized: "settings.delete_account", bundle: .main), color: MeeshyColors.errorHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(MeeshyColors.error.opacity(0.6))
                }
            }
            .accessibilityLabel(String(localized: "settings.delete_account", bundle: .main))
            .accessibilityHint(String(localized: "settings.delete_account.hint", bundle: .main))
        }
    }

    // MARK: - Appearance Section

    private var appearanceSection: some View {
        settingsSection(title: String(localized: "settings.section.appearance", bundle: .main), icon: "paintbrush.fill", color: MeeshyColors.warningHex) {
            settingsRow(icon: theme.preference.icon, title: String(localized: "settings.theme", bundle: .main), color: theme.preference.tintColor) {
                HStack(spacing: MeeshySpacing.sm) {
                    ForEach(ThemePreference.allCases, id: \.self) { pref in
                        Button {
                            HapticFeedback.light()
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                theme.preference = pref
                                theme.syncWithSystem(colorScheme)
                            }
                            syncThemeToPrefs(pref)
                        } label: {
                            VStack(spacing: MeeshySpacing.xs) {
                                Image(systemName: pref.icon)
                                    .font(MeeshyFont.relative(14))
                                Text(themeLabel(for: pref))
                                    .font(MeeshyFont.relative(9, weight: .medium))
                                    // Un seul segment = une seule ligne, à sa
                                    // largeur idéale : sans `fixedSize`, le
                                    // HStack compressait d'abord ces libellés
                                    // (« Au… », « So… ») alors que la place ne
                                    // manquait pas — le Spacer de la row doit
                                    // céder avant le texte.
                                    .lineLimit(1)
                                    .fixedSize(horizontal: true, vertical: false)
                            }
                            .foregroundColor(theme.preference == pref ? Color(hex: pref.tintColor) : theme.textMuted)
                            .padding(.horizontal, MeeshySpacing.sm + 2)
                            .padding(.vertical, MeeshySpacing.xs + 2)
                            .background(
                                RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                                    .fill(theme.preference == pref ? Color(hex: pref.tintColor).opacity(0.15) : Color.clear)
                            )
                        }
                        .accessibilityLabel("\(String(localized: "settings.theme", bundle: .main)) \(themeLabel(for: pref))")
                        .accessibilityValue(theme.preference == pref ? String(localized: "common.selected", bundle: .main) : "")
                        .accessibilityAddTraits(theme.preference == pref ? .isSelected : [])
                    }
                }
            }
            // Le picker avait été retiré le 2026-07-20 : il écrivait
            // `application.interfaceLanguage`, que personne ne relisait. Il
            // revient branché sur `UILanguageOverride`, qui applique
            // réellement la langue au lancement depuis le 2026-07-25 — c'était
            // le fil manquant, pas le contrôle qui était en trop.
            interfaceLanguageRow
        }
    }

    /// Libellés localisés des segments de thème — `ThemePreference.label`
    /// (SDK) renvoie du français en dur, qui fuyait tel quel dans les six
    /// autres langues de l'interface.
    private func themeLabel(for pref: ThemePreference) -> String {
        switch pref {
        case .system:
            return String(localized: "settings.theme.auto", defaultValue: "Auto", bundle: .main)
        case .light:
            return String(localized: "settings.theme.light", defaultValue: "Clair", bundle: .main)
        case .dark:
            return String(localized: "settings.theme.dark", defaultValue: "Sombre", bundle: .main)
        }
    }

    /// Langue de l'interface — choix propre à l'affichage, sans effet sur les
    /// langues de traduction du profil. « Automatique » suit la langue
    /// principale du compte, ce que faisait l'app jusqu'ici.
    private var interfaceLanguageRow: some View {
        settingsRow(icon: "globe",
                    title: String(localized: "settings.interface_language",
                                  defaultValue: "Langue de l'interface", bundle: .main),
                    color: MeeshyColors.indigo600Hex) {
            Menu {
                Button {
                    selectInterfaceLanguage(nil)
                } label: {
                    Label(automaticLanguageLabel,
                          systemImage: interfaceLanguageChoice == nil ? "checkmark" : "")
                }
                ForEach(UILanguageOverride.selectableCodes, id: \.self) { code in
                    Button {
                        selectInterfaceLanguage(code)
                    } label: {
                        Label(Self.interfaceLanguageLabel(code),
                              systemImage: interfaceLanguageChoice == code ? "checkmark" : "")
                    }
                }
            } label: {
                HStack(spacing: MeeshySpacing.xs) {
                    Text(interfaceLanguageChoice.map(Self.interfaceLanguageLabel)
                         ?? automaticLanguageLabel)
                        .font(MeeshyFont.relative(13, weight: .medium))
                        .foregroundColor(theme.textMuted)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(MeeshyFont.relative(10, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.interface_language",
                                       defaultValue: "Langue de l'interface", bundle: .main))
            .accessibilityValue(interfaceLanguageChoice.map(Self.interfaceLanguageLabel)
                                ?? automaticLanguageLabel)
        }
    }

    private var automaticLanguageLabel: String {
        String(localized: "settings.interface_language.automatic",
               defaultValue: "Automatique", bundle: .main)
    }

    /// Nom de la langue DANS cette langue — un utilisateur qui cherche l'arabe
    /// reconnaît « العربية », pas « Arabe ».
    private static func interfaceLanguageLabel(_ code: String) -> String {
        let locale = Locale(identifier: code)
        return locale.localizedString(forIdentifier: code)?.capitalized ?? code
    }

    /// Enregistre le choix et prévient : `AppleLanguages` n'est relu qu'au
    /// démarrage, donc l'écran courant reste dans l'ancienne langue.
    private func selectInterfaceLanguage(_ code: String?) {
        HapticFeedback.light()
        UILanguageOverride.explicitChoice = code
        UILanguageOverride.applyIfNeeded()
        interfaceLanguageChoice = code
        showInterfaceLanguageRestartHint = true
    }

    // MARK: - Notifications Section

    private var notificationsSection: some View {
        settingsSection(title: String(localized: "settings.section.notifications", bundle: .main), icon: "bell.fill", color: MeeshyColors.errorHex) {
            settingsRow(icon: "bell.badge.fill", title: String(localized: "settings.notifications.title", bundle: .main), color: MeeshyColors.errorHex) {
                Toggle("", isOn: Binding(
                    get: { prefs.notification.pushEnabled },
                    set: { val in prefs.updateNotification { $0.pushEnabled = val } }
                ))
                .labelsHidden()
                .tint(Color(hex: accentColor))
                .accessibilityLabel(String(localized: "settings.notif.push.a11y", bundle: .main))
                .accessibilityValue(prefs.notification.pushEnabled ? String(localized: "settings.value.active", bundle: .main) : String(localized: "settings.value.disabled", bundle: .main))
            }

            settingsRow(icon: "speaker.wave.2.fill", title: String(localized: "settings.notif.sounds", bundle: .main), color: MeeshyColors.indigo300Hex) {
                Toggle("", isOn: Binding(
                    get: { prefs.notification.soundEnabled },
                    set: { val in prefs.updateNotification { $0.soundEnabled = val } }
                ))
                .labelsHidden()
                .tint(Color(hex: accentColor))
                .accessibilityLabel(String(localized: "settings.notif.sounds.a11y", bundle: .main))
                .accessibilityValue(prefs.notification.soundEnabled ? String(localized: "settings.value.active", bundle: .main) : String(localized: "settings.value.disabled", bundle: .main))
            }

            settingsRow(icon: "iphone.radiowaves.left.and.right", title: String(localized: "settings.notif.vibrations", bundle: .main), color: MeeshyColors.trackingAccentHex) {
                Toggle("", isOn: Binding(
                    get: { prefs.notification.vibrationEnabled },
                    set: { val in prefs.updateNotification { $0.vibrationEnabled = val } }
                ))
                .labelsHidden()
                .tint(Color(hex: accentColor))
                .accessibilityLabel(String(localized: "settings.notif.vibrations", bundle: .main))
                .accessibilityValue(prefs.notification.vibrationEnabled ? String(localized: "settings.value.active", bundle: .main) : String(localized: "settings.value.disabled", bundle: .main))
            }

            Button {
                HapticFeedback.light()
                showNotificationSettings = true
            } label: {
                settingsRow(icon: "slider.horizontal.3", title: String(localized: "settings.notif.more_options", bundle: .main), color: MeeshyColors.errorHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.notif.more_options.a11y", bundle: .main))
            .accessibilityHint(String(localized: "settings.notif.more_options.hint", bundle: .main))
        }
    }

    // MARK: - Data Section

    private var dataSection: some View {
        settingsSection(title: String(localized: "settings.section.data", bundle: .main), icon: "externaldrive.fill", color: MeeshyColors.warningHex) {
            Button {
                HapticFeedback.light()
                showDataStorage = true
            } label: {
                settingsRow(icon: "internaldrive.fill", title: String(localized: "settings.storage", bundle: .main), color: MeeshyColors.warningHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.storage", bundle: .main))
            .accessibilityHint(String(localized: "settings.storage.hint", bundle: .main))

            Button {
                HapticFeedback.light()
                showMediaDownload = true
            } label: {
                settingsRow(icon: "arrow.down.circle.fill", title: String(localized: "settings.media.download.title", bundle: .main), color: MeeshyColors.warningHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.media.download.a11y", bundle: .main))
            .accessibilityHint(String(localized: "settings.media.download.hint", bundle: .main))

            Button {
                HapticFeedback.light()
                showDataExport = true
            } label: {
                settingsRow(icon: "square.and.arrow.up.fill", title: String(localized: "settings.export_data", bundle: .main), color: MeeshyColors.warningHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.export_data", bundle: .main))
            .accessibilityHint(String(localized: "settings.export_data.hint", bundle: .main))
        }
    }

    // MARK: - Voice Profile Section

    private var voiceProfileSection: some View {
        settingsSection(title: String(localized: "settings.section.voice", bundle: .main), icon: "waveform.and.mic", color: MeeshyColors.trackingAccentHex) {
            Button {
                HapticFeedback.light()
                showVoiceProfileManage = true
            } label: {
                settingsRow(icon: "waveform.circle.fill", title: String(localized: "settings.voice.manage", bundle: .main), color: MeeshyColors.trackingAccentHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.voice.manage", bundle: .main))
            .accessibilityHint(String(localized: "settings.voice.manage.hint", bundle: .main))

            Button {
                HapticFeedback.light()
                showVoiceProfileWizard = true
            } label: {
                settingsRow(icon: "plus.circle.fill", title: String(localized: "settings.voice.create", bundle: .main), color: MeeshyColors.successHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.voice.create", bundle: .main))
            .accessibilityHint(String(localized: "settings.voice.create.hint", bundle: .main))
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
        settingsSection(title: String(localized: "settings.section.transcription", bundle: .main), icon: "text.quote", color: MeeshyColors.indigo300Hex) {
            settingsRow(icon: "waveform", title: String(localized: "settings.transcription.auto", bundle: .main), color: MeeshyColors.indigo300Hex) {
                Toggle("", isOn: Binding(
                    get: { prefs.audio.autoTranscribeIncoming },
                    set: { val in prefs.updateAudio { $0.autoTranscribeIncoming = val } }
                ))
                    .labelsHidden()
                    .tint(Color(hex: accentColor))
                    .accessibilityLabel(String(localized: "settings.transcription.auto", bundle: .main))
                    .accessibilityValue(prefs.audio.autoTranscribeIncoming ? String(localized: "settings.value.active", bundle: .main) : String(localized: "settings.value.disabled", bundle: .main))
            }

            settingsRow(icon: "info.circle", title: String(localized: "settings.transcription.engine", bundle: .main), color: MeeshyColors.neutral500Hex) {
                EmptyView()
            }
            .accessibilityLabel(String(localized: "settings.transcription.engine.a11y", bundle: .main))
        }
    }

    // MARK: - Meeshy Tools Section

    private var meeshyToolsSection: some View {
        settingsSection(title: String(localized: "settings.section.tools", bundle: .main), icon: "wrench.and.screwdriver.fill", color: MeeshyColors.successHex) {
            Button {
                HapticFeedback.light()
                router.push(.starredMessages)
            } label: {
                settingsRow(icon: "star.fill", title: String(localized: "settings.tools.starred", bundle: .main), color: MeeshyColors.warningHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.tools.starred", bundle: .main))
            .accessibilityHint(String(localized: "settings.tools.starred.hint", bundle: .main))

            Button {
                HapticFeedback.light()
                router.push(.bookmarks)
            } label: {
                settingsRow(icon: "bookmark.fill", title: String(localized: "settings.tools.bookmarks", defaultValue: "Publications enregistrées", bundle: .main), color: MeeshyColors.indigo400Hex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.tools.bookmarks", defaultValue: "Publications enregistrées", bundle: .main))
            .accessibilityHint(String(localized: "settings.tools.bookmarks.hint", defaultValue: "Voir les posts et les réels que vous avez enregistrés", bundle: .main))

            Button {
                HapticFeedback.light()
                showStats = true
            } label: {
                settingsRow(icon: "chart.bar.fill", title: String(localized: "settings.tools.stats", bundle: .main), color: MeeshyColors.indigo300Hex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.tools.stats", bundle: .main))
            .accessibilityHint(String(localized: "settings.tools.stats.hint", bundle: .main))

            Button {
                HapticFeedback.light()
                showAffiliate = true
            } label: {
                settingsRow(icon: "link.badge.plus", title: String(localized: "settings.tools.affiliate", bundle: .main), color: MeeshyColors.successHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.tools.affiliate", bundle: .main))
            .accessibilityHint(String(localized: "settings.tools.affiliate.hint", bundle: .main))
        }
    }

    // MARK: - Beta Section

    /// « Activer les bêta » — toggle de PLEIN DROIT : il écrit
    /// `BetaFeaturesPreference.setEnabled`, jamais `LentilleFeatureFlag
    /// .setForDebug`. Défaut OFF (2026-08-22) : ce qu'il affiche est ce qu'il
    /// applique.
    ///
    /// C'est le SEUL interrupteur bêta offert à l'utilisateur ; il gouverne
    /// les drapeaux couverts par le programme (`LentilleFeatureFlag
    /// .isCoveredByBetaProgramme`) : modes de lecture, liste Lentille, Rivière.
    /// Une clé de drapeau posée explicitement prime sur ce réglage — c'est la
    /// porte « une par une » de demain.
    ///
    /// La liste des fonctionnalités du programme n'apparaît QUE si l'option
    /// est validée (condition produit) ; chaque ligne reflète l'état résolu
    /// par `BetaFeaturesPreference.enabledFeatures`.
    private var betaSection: some View {
        settingsSection(title: String(localized: "settings.section.beta", bundle: .main), icon: "flask.fill", color: MeeshyColors.trackingAccentHex) {
            VStack(alignment: .leading, spacing: 0) {
                settingsRow(icon: "sparkles", title: String(localized: "settings.beta.toggle", bundle: .main), color: MeeshyColors.trackingAccentHex) {
                    Toggle("", isOn: Binding(
                        get: { betaFeaturesEnabled },
                        set: { val in
                            betaFeaturesEnabled = val
                            BetaFeaturesPreference.setEnabled(val)
                        }
                    ))
                    .labelsHidden()
                    .tint(Color(hex: accentColor))
                    .accessibilityLabel(String(localized: "settings.beta.toggle", bundle: .main))
                    .accessibilityValue(betaFeaturesEnabled ? String(localized: "settings.value.active", bundle: .main) : String(localized: "settings.value.disabled", bundle: .main))
                }

                Text(String(localized: "settings.beta.toggle.subtitle", bundle: .main))
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(theme.textSecondary)
                    .padding(.horizontal, MeeshySpacing.md + 2)
                    .padding(.bottom, MeeshySpacing.sm + 2)

                if betaFeaturesEnabled {
                    betaFeaturesList
                }
            }
        }
    }

    /// Les fonctionnalités du programme, visibles seulement quand l'option est
    /// validée. Tout-ou-rien aujourd'hui : chaque ligne porte l'état résolu
    /// (coche = active) ; demain, une bascule par ligne.
    private var betaFeaturesList: some View {
        let enabled = Set(BetaFeaturesPreference.enabledFeatures())
        return VStack(alignment: .leading, spacing: 0) {
            Divider().padding(.horizontal, MeeshySpacing.md + 2)
            Text(String(localized: "settings.beta.features.title", bundle: .main))
                .font(MeeshyFont.relative(11, weight: .semibold))
                .foregroundColor(theme.textMuted)
                .padding(.horizontal, MeeshySpacing.md + 2)
                .padding(.top, MeeshySpacing.sm + 2)
            ForEach(LentilleFeatureFlag.allCases.filter(\.isCoveredByBetaProgramme), id: \.self) { flag in
                let isOn = enabled.contains(flag)
                settingsRow(icon: flag.settingsIcon, title: flag.settingsTitle, color: MeeshyColors.trackingAccentHex) {
                    Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                        .font(MeeshyFont.relative(16, weight: .semibold))
                        .foregroundColor(isOn ? Color(hex: MeeshyColors.successHex) : theme.textMuted)
                        .accessibilityHidden(true)
                }
                .accessibilityValue(isOn ? String(localized: "settings.value.active", bundle: .main) : String(localized: "settings.value.disabled", bundle: .main))
            }
        }
    }

    // MARK: - Support Section

    private var supportSection: some View {
        settingsSection(title: String(localized: "settings.section.help", bundle: .main), icon: "questionmark.circle.fill", color: MeeshyColors.successHex) {
            Button {
                HapticFeedback.light()
                showSupport = true
            } label: {
                settingsRow(icon: "lifepreserver.fill", title: String(localized: "settings.help_center", bundle: .main), color: MeeshyColors.successHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.help_center", bundle: .main))
            .accessibilityHint(String(localized: "settings.help_center.hint", bundle: .main))
        }
    }

    // MARK: - About Section

    private var aboutSection: some View {
        settingsSection(title: String(localized: "settings.section.about", bundle: .main), icon: "info.circle.fill", color: MeeshyColors.infoHex) {
            Button {
                HapticFeedback.light()
                showAbout = true
            } label: {
                settingsRow(icon: "info.circle.fill", title: String(localized: "settings.about.meeshy", bundle: .main), color: MeeshyColors.infoHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.about.meeshy", bundle: .main))
            .accessibilityHint(String(localized: "settings.about.hint", bundle: .main))

            Button {
                HapticFeedback.light()
                showTerms = true
            } label: {
                settingsRow(icon: "doc.text.fill", title: String(localized: "settings.terms", bundle: .main), color: MeeshyColors.infoHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.terms", bundle: .main))
            .accessibilityHint(String(localized: "settings.terms.hint", bundle: .main))

            Button {
                HapticFeedback.light()
                showPrivacyPolicy = true
            } label: {
                settingsRow(icon: "hand.raised.fill", title: String(localized: "settings.privacy_policy", bundle: .main), color: MeeshyColors.infoHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.privacy_policy", bundle: .main))
            .accessibilityHint(String(localized: "settings.privacy_policy.hint", bundle: .main))

            Button {
                HapticFeedback.light()
                showLicenses = true
            } label: {
                settingsRow(icon: "checkmark.seal.fill", title: String(localized: "settings.licenses", bundle: .main), color: MeeshyColors.infoHex) {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
            .accessibilityLabel(String(localized: "settings.licenses", bundle: .main))
            .accessibilityHint(String(localized: "settings.licenses.hint", bundle: .main))

            settingsRow(icon: "sparkles", title: String(localized: "settings.version", bundle: .main), color: MeeshyColors.warningHex) {
                Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0")
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundColor(theme.textMuted)
            }
        }
    }

    // MARK: - Switch Account Section

    /// **Quitter un compte sans l'oublier.**
    ///
    /// La déconnexion efface l'entrée du sélecteur (`removeFromSavedAccounts`) :
    /// revenir sur le compte imposait donc de retaper son identifiant. Cette
    /// rangée fait la même chose SAUF cela — d'où un habit neutre, et non celui
    /// de la destruction : rien n'est perdu qu'une session.
    private var switchAccountSection: some View {
        Button {
            HapticFeedback.light()
            showSwitchAccountConfirm = true
        } label: {
            HStack {
                Image(systemName: "person.2.arrow.trianglehead.counterclockwise")
                    .font(MeeshyFont.relative(16, weight: .semibold))
                Text(String(localized: "settings.switchAccount.title",
                            defaultValue: "Changer de compte", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .semibold))
            }
            .foregroundColor(theme.textPrimary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.md + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(theme.inputBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                            .stroke(theme.textMuted.opacity(0.25), lineWidth: 1)
                    )
            )
        }
        .disabled(isLoggingOut)
        .accessibilityHint(String(localized: "settings.switchAccount.message",
                                  defaultValue: "Vous reviendrez à l’écran de connexion. Ce compte restera proposé, et son mot de passe vous sera redemandé.",
                                  bundle: .main))
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
                    .font(MeeshyFont.relative(16, weight: .semibold))
                Text(String(localized: "settings.logout.title", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .semibold))
            }
            .foregroundColor(MeeshyColors.error)
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.md + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(MeeshyColors.error.opacity(0.1))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                            .stroke(MeeshyColors.error.opacity(0.3), lineWidth: 1)
                    )
            )
        }
        .disabled(isLoggingOut)
        .accessibilityLabel(String(localized: "settings.logout.a11y", bundle: .main))
        .accessibilityHint(String(localized: "settings.logout.hint", bundle: .main))
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
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: icon)
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(Color(hex: color))
                Text(title.uppercased())
                    .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: color))
                    .tracking(1.2)
            }
            .padding(.leading, MeeshySpacing.xs)

            VStack(spacing: 0) {
                content()
            }
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(theme.surfaceGradient(tint: color))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
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
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(Color(hex: color))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(Color(hex: color).opacity(0.12))
                )
                .accessibilityHidden(true)

            Text(title)
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            trailing()
        }
        .padding(.horizontal, MeeshySpacing.md + 2)
        .padding(.vertical, MeeshySpacing.sm + 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
    }
}

// MARK: - Présentation des fonctionnalités bêta (section « Bêta »)

extension LentilleFeatureFlag {
    var settingsTitle: String {
        switch self {
        case .readingModes: return String(localized: "settings.beta.feature.reading_modes", bundle: .main)
        case .lentilleList: return String(localized: "settings.beta.feature.lentille_list", bundle: .main)
        case .riviereMode: return String(localized: "settings.beta.feature.riviere_mode", bundle: .main)
        }
    }

    var settingsIcon: String {
        switch self {
        case .readingModes: return "text.book.closed.fill"
        case .lentilleList: return "list.bullet.rectangle.fill"
        case .riviereMode: return "water.waves"
        }
    }
}
