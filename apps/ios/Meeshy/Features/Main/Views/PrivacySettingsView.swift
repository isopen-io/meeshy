import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct PrivacySettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @ObservedObject private var prefs = UserPreferencesManager.shared

    private let accentColor = MeeshyColors.brandPrimaryHex

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
        }
        .adaptiveOnChange(of: prefs.privacy.allowAnalytics) { _, _ in
            AnalyticsManager.shared.syncCollectionState()
        }
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
                    Text(String(localized: "common.back", defaultValue: "Retour", bundle: .main))
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text(String(localized: "settings.privacy.title", defaultValue: "Confidentialité", bundle: .main))
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
            VStack(spacing: 20) {
                visibilitySection
                contactsSection
                mediaSection
                encryptionSection

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    // MARK: - Visibility

    private var visibilitySection: some View {
        settingsSection(title: String(localized: "settings.privacy.visibility", defaultValue: "Visibilité", bundle: .main), icon: "eye.fill", color: "9B59B6") {
            privacyToggle(icon: "circle.fill", title: String(localized: "settings.privacy.online_status", defaultValue: "Statut en ligne", bundle: .main), color: "4ADE80",
                          keyPath: \.showOnlineStatus)

            privacyToggle(icon: "clock.fill", title: String(localized: "settings.privacy.last_seen", defaultValue: "Dernière connexion", bundle: .main), color: "60A5FA",
                          keyPath: \.showLastSeen)

            privacyToggle(icon: "checkmark.message.fill", title: String(localized: "settings.privacy.read_receipts", defaultValue: "Accusés de lecture", bundle: .main), color: "3498DB",
                          keyPath: \.showReadReceipts)

            privacyToggle(icon: "ellipsis.bubble.fill", title: String(localized: "settings.privacy.typing_indicator", defaultValue: "Indicateur de frappe", bundle: .main), color: "F8B500",
                          keyPath: \.showTypingIndicator)

            privacyToggle(icon: "magnifyingglass", title: String(localized: "settings.privacy.hide_from_search", defaultValue: "Masquer du recherche", bundle: .main), color: "FF6B6B",
                          keyPath: \.hideProfileFromSearch)
        }
    }

    // MARK: - Contacts & Groups

    private var contactsSection: some View {
        settingsSection(title: String(localized: "settings.privacy.contacts_groups", defaultValue: "Contacts & Groupes", bundle: .main), icon: "person.2.fill", color: "6366F1") {
            privacyToggle(icon: "person.badge.plus", title: String(localized: "settings.privacy.contact_requests", defaultValue: "Demandes de contact", bundle: .main), color: "6366F1",
                          keyPath: \.allowContactRequests)

            privacyToggle(icon: "person.3.fill", title: String(localized: "settings.privacy.group_invites", defaultValue: "Invitations de groupe", bundle: .main), color: "60A5FA",
                          keyPath: \.allowGroupInvites)

            privacyToggle(icon: "phone.arrow.down.left", title: String(localized: "settings.privacy.calls_non_contacts", defaultValue: "Appels hors contacts", bundle: .main), color: "FF6B6B",
                          keyPath: \.allowCallsFromNonContacts)
        }
    }

    // MARK: - Media & Data

    private var mediaSection: some View {
        settingsSection(title: String(localized: "settings.privacy.media_data", defaultValue: "Média & Données", bundle: .main), icon: "photo.fill", color: "F8B500") {
            privacyToggle(icon: "square.and.arrow.down.fill", title: String(localized: "settings.privacy.save_media", defaultValue: "Sauvegarder média", bundle: .main), color: "4ADE80",
                          keyPath: \.saveMediaToGallery)

            privacyToggle(icon: "chart.bar.fill", title: String(localized: "settings.privacy.analytics", defaultValue: "Analytics", bundle: .main), color: "60A5FA",
                          keyPath: \.allowAnalytics)

            privacyToggle(icon: "arrow.triangle.branch", title: String(localized: "settings.privacy.share_data", defaultValue: "Partage données", bundle: .main), color: "9B59B6",
                          keyPath: \.shareUsageData)

            privacyToggle(icon: "camera.fill", title: String(localized: "settings.privacy.block_screenshots", defaultValue: "Bloquer captures", bundle: .main), color: "FF6B6B",
                          keyPath: \.blockScreenshots)
        }
    }

    // MARK: - Encryption

    private var encryptionSection: some View {
        settingsSection(title: String(localized: "settings.privacy.encryption", defaultValue: "Chiffrement", bundle: .main), icon: "lock.shield.fill", color: "3498DB") {
            settingsRow(icon: "key.fill", title: String(localized: "settings.privacy.encryption_preference", defaultValue: "Préférence", bundle: .main), color: "3498DB") {
                Picker("", selection: Binding(
                    get: { prefs.privacy.encryptionPreference },
                    set: { val in prefs.updatePrivacy { $0.encryptionPreference = val } }
                )) {
                    ForEach(EncryptionPreference.allCases, id: \.self) { pref in
                        Text(encryptionLabel(pref)).tag(pref)
                    }
                }
                .pickerStyle(.menu)
                .tint(Color(hex: accentColor))
            }

            privacyToggle(icon: "lock.rotation", title: String(localized: "settings.privacy.auto_encrypt", defaultValue: "Auto-chiffrer new conv.", bundle: .main), color: "4ADE80",
                          keyPath: \.autoEncryptNewConversations)

            privacyToggle(icon: "lock.badge.clock", title: String(localized: "settings.privacy.show_encryption_status", defaultValue: "Afficher statut chiffr.", bundle: .main), color: "60A5FA",
                          keyPath: \.showEncryptionStatus)

            privacyToggle(icon: "exclamationmark.lock.fill", title: String(localized: "settings.privacy.warn_unencrypted", defaultValue: "Alerter non chiffré", bundle: .main), color: "FF6B6B",
                          keyPath: \.warnOnUnencrypted)
        }
    }

    // MARK: - Helpers

    private func encryptionLabel(_ pref: EncryptionPreference) -> String {
        switch pref {
        case .disabled: return String(localized: "settings.privacy.encryption.disabled", defaultValue: "Désactivé", bundle: .main)
        case .optional: return String(localized: "settings.privacy.encryption.optional", defaultValue: "Optionnel", bundle: .main)
        case .always: return String(localized: "settings.privacy.encryption.always", defaultValue: "Toujours", bundle: .main)
        }
    }

    private func privacyToggle(
        icon: String,
        title: String,
        color: String,
        keyPath: WritableKeyPath<PrivacyPreferences, Bool>
    ) -> some View {
        settingsRow(icon: icon, title: title, color: color) {
            Toggle("", isOn: Binding(
                get: { prefs.privacy[keyPath: keyPath] },
                set: { val in prefs.updatePrivacy { $0[keyPath: keyPath] = val } }
            ))
            .labelsHidden()
            .tint(Color(hex: accentColor))
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
