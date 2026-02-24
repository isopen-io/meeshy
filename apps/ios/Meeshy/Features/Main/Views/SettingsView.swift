import SwiftUI
import MeeshySDK
import MeeshyUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var router: Router
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var authManager = AuthManager.shared
    @ObservedObject private var prefs = UserPreferencesManager.shared
    @Environment(\.colorScheme) private var systemColorScheme

    @State private var showLogoutConfirm = false
    @State private var showPrivacySettings = false
    @State private var showNotificationSettings = false
    @State private var showSecurity = false
    @State private var showBlockedUsers = false

    private let accentColor = "08D9D6"

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
        }
        .alert("Déconnexion", isPresented: $showLogoutConfirm) {
            Button("Annuler", role: .cancel) { }
            Button("Déconnexion", role: .destructive) {
                authManager.logout()
                MessageSocketManager.shared.disconnect()
            }
        } message: {
            Text("Voulez-vous vraiment vous déconnecter ?")
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
        .task { await prefs.fetchFromBackend() }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text("Réglages")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Color.clear.frame(width: 24, height: 24)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                accountSection
                appearanceSection
                notificationsSection
                languageSection
                aboutSection
                logoutSection

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    // MARK: - Account Section

    private var accountSection: some View {
        settingsSection(title: "Compte", icon: "person.circle.fill", color: "9B59B6") {
            Button {
                HapticFeedback.light()
                router.push(.profile)
            } label: {
                settingsRow(icon: "person.fill", title: "Profil", color: "9B59B6") {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }

            Button {
                HapticFeedback.light()
                showPrivacySettings = true
            } label: {
                settingsRow(icon: "lock.fill", title: "Confidentialité", color: "E91E63") {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }

            Button {
                HapticFeedback.light()
                showSecurity = true
            } label: {
                settingsRow(icon: "shield.fill", title: "Sécurité", color: "3498DB") {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }

            Button {
                HapticFeedback.light()
                showBlockedUsers = true
            } label: {
                settingsRow(icon: "lock.shield", title: "Utilisateurs bloques", color: "EF4444") {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
    }

    // MARK: - Appearance Section

    private var appearanceSection: some View {
        settingsSection(title: "Apparence", icon: "paintbrush.fill", color: "F8B500") {
            settingsRow(icon: theme.preference.icon, title: "Thème", color: theme.preference.tintColor) {
                HStack(spacing: 8) {
                    ForEach(ThemePreference.allCases, id: \.self) { pref in
                        Button {
                            HapticFeedback.light()
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                theme.preference = pref
                                theme.syncWithSystem(systemColorScheme)
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
                    }
                }
            }
        }
    }

    // MARK: - Notifications Section

    private var notificationsSection: some View {
        settingsSection(title: "Notifications", icon: "bell.fill", color: "FF6B6B") {
            settingsRow(icon: "bell.badge.fill", title: "Notifications", color: "FF6B6B") {
                Toggle("", isOn: Binding(
                    get: { prefs.notification.pushEnabled },
                    set: { val in prefs.updateNotification { $0.pushEnabled = val } }
                ))
                .labelsHidden()
                .tint(Color(hex: accentColor))
            }

            settingsRow(icon: "speaker.wave.2.fill", title: "Sons", color: "4ECDC4") {
                Toggle("", isOn: Binding(
                    get: { prefs.notification.soundEnabled },
                    set: { val in prefs.updateNotification { $0.soundEnabled = val } }
                ))
                .labelsHidden()
                .tint(Color(hex: accentColor))
            }

            settingsRow(icon: "iphone.radiowaves.left.and.right", title: "Vibrations", color: "9B59B6") {
                Toggle("", isOn: Binding(
                    get: { prefs.notification.vibrationEnabled },
                    set: { val in prefs.updateNotification { $0.vibrationEnabled = val } }
                ))
                .labelsHidden()
                .tint(Color(hex: accentColor))
            }

            Button {
                HapticFeedback.light()
                showNotificationSettings = true
            } label: {
                settingsRow(icon: "slider.horizontal.3", title: "Plus d'options", color: "FF6B6B") {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
    }

    // MARK: - Language Section

    private var languageSection: some View {
        settingsSection(title: "Langue", icon: "globe", color: "4ECDC4") {
            let languages = [("fr", "Français"), ("en", "English"), ("es", "Español"), ("ar", "العربية")]
            ForEach(languages, id: \.0) { code, name in
                Button {
                    HapticFeedback.light()
                    prefs.updateApplication { $0.interfaceLanguage = code }
                } label: {
                    settingsRow(icon: "flag.fill", title: name, color: prefs.application.interfaceLanguage == code ? accentColor : "6B7280") {
                        if prefs.application.interfaceLanguage == code {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 18))
                                .foregroundColor(Color(hex: accentColor))
                        }
                    }
                }
            }
        }
    }

    // MARK: - About Section

    private var aboutSection: some View {
        settingsSection(title: "À propos", icon: "info.circle.fill", color: "45B7D1") {
            settingsRow(icon: "doc.text.fill", title: "Conditions d'utilisation", color: "45B7D1") {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }

            settingsRow(icon: "hand.raised.fill", title: "Politique de confidentialité", color: "45B7D1") {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }

            settingsRow(icon: "sparkles", title: "Version", color: "F8B500") {
                Text("1.0.0")
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
            HStack {
                Image(systemName: "rectangle.portrait.and.arrow.forward")
                    .font(.system(size: 16, weight: .semibold))
                Text("Déconnexion")
                    .font(.system(size: 15, weight: .semibold))
            }
            .foregroundColor(Color(hex: "EF4444"))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(hex: "EF4444").opacity(0.1))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color(hex: "EF4444").opacity(0.3), lineWidth: 1)
                    )
            )
        }
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
