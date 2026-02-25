import SwiftUI
import MeeshySDK
import MeeshyUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var authManager = AuthManager.shared
    @Environment(\.colorScheme) private var systemColorScheme

    @State private var showLogoutConfirm = false
    @State private var showStats = false
    @State private var showAffiliate = false
    @State private var showDataExport = false
    @State private var notificationsEnabled = true
    @State private var soundEnabled = true
    @State private var vibrationEnabled = true
    @State private var showVoiceProfileWizard = false
    @State private var showVoiceProfileManage = false
    @State private var autoTranscriptionEnabled = false

    @AppStorage("preferredLanguage") private var preferredLanguage = "fr"

    private let accentColor = "08D9D6"

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
        }
        .sheet(isPresented: $showStats) { UserStatsView() }
        .sheet(isPresented: $showAffiliate) { AffiliateView() }
        .sheet(isPresented: $showDataExport) { DataExportView() }
        .alert("Déconnexion", isPresented: $showLogoutConfirm) {
            Button("Annuler", role: .cancel) { }
            Button("Déconnexion", role: .destructive) {
                authManager.logout()
                MessageSocketManager.shared.disconnect()
            }
        } message: {
            Text("Voulez-vous vraiment vous déconnecter ?")
        }
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
                voiceProfileSection
                transcriptionSection
                notificationsSection
                languageSection
                meeshyToolsSection
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
            settingsRow(icon: "person.fill", title: "Profil", color: "9B59B6") {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }

            settingsRow(icon: "lock.fill", title: "Confidentialité", color: "E91E63") {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(theme.textMuted)
            }

            settingsRow(icon: "shield.fill", title: "Sécurité", color: "3498DB") {
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(theme.textMuted)
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
                Toggle("", isOn: $notificationsEnabled)
                    .labelsHidden()
                    .tint(Color(hex: accentColor))
            }

            settingsRow(icon: "speaker.wave.2.fill", title: "Sons", color: "4ECDC4") {
                Toggle("", isOn: $soundEnabled)
                    .labelsHidden()
                    .tint(Color(hex: accentColor))
            }

            settingsRow(icon: "iphone.radiowaves.left.and.right", title: "Vibrations", color: "9B59B6") {
                Toggle("", isOn: $vibrationEnabled)
                    .labelsHidden()
                    .tint(Color(hex: accentColor))
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
                    preferredLanguage = code
                } label: {
                    settingsRow(icon: "flag.fill", title: name, color: preferredLanguage == code ? accentColor : "6B7280") {
                        if preferredLanguage == code {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 18))
                                .foregroundColor(Color(hex: accentColor))
                        }
                    }
                }
            }
        }
    }

    // MARK: - Voice Profile Section

    private var voiceProfileSection: some View {
        settingsSection(title: "Profil vocal", icon: "waveform.and.mic", color: "A855F7") {
            Button {
                HapticFeedback.light()
                showVoiceProfileManage = true
            } label: {
                settingsRow(icon: "waveform.circle.fill", title: "Gerer le profil vocal", color: "A855F7") {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }

            Button {
                HapticFeedback.light()
                showVoiceProfileWizard = true
            } label: {
                settingsRow(icon: "plus.circle.fill", title: "Creer un profil vocal", color: "2ECC71") {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
        .sheet(isPresented: $showVoiceProfileWizard) {
            VoiceProfileWizardView(accentColor: "A855F7")
        }
        .sheet(isPresented: $showVoiceProfileManage) {
            VoiceProfileManageView(accentColor: "A855F7")
        }
    }

    // MARK: - Transcription Section

    private var transcriptionSection: some View {
        settingsSection(title: "Transcription", icon: "text.quote", color: "4ECDC4") {
            settingsRow(icon: "waveform", title: "Transcription automatique", color: "4ECDC4") {
                Toggle("", isOn: $autoTranscriptionEnabled)
                    .labelsHidden()
                    .tint(Color(hex: accentColor))
            }

            settingsRow(icon: "info.circle", title: "Apple Speech (on-device)", color: "6B7280") {
                EmptyView()
            }
        }
    }

    // MARK: - Meeshy Tools Section

    private var meeshyToolsSection: some View {
        settingsSection(title: "Outils", icon: "wrench.and.screwdriver.fill", color: "2ECC71") {
            Button {
                HapticFeedback.light()
                showStats = true
            } label: {
                settingsRow(icon: "chart.bar.fill", title: "Statistiques", color: "4ECDC4") {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }

            Button {
                HapticFeedback.light()
                showAffiliate = true
            } label: {
                settingsRow(icon: "link.badge.plus", title: "Parrainage", color: "2ECC71") {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                }
            }

            Button {
                HapticFeedback.light()
                showDataExport = true
            } label: {
                settingsRow(icon: "square.and.arrow.up", title: "Export de donnees", color: "3498DB") {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(theme.textMuted)
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
