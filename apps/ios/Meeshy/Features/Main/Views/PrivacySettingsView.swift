import SwiftUI
import MeeshySDK
import MeeshyUI

struct PrivacySettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var prefs = UserPreferencesManager.shared

    private let accentColor = "08D9D6"

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
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
                    Text("Retour")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text("Confidentialité")
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
        settingsSection(title: "Visibilité", icon: "eye.fill", color: "9B59B6") {
            privacyToggle(icon: "circle.fill", title: "Statut en ligne", color: "4ADE80",
                          keyPath: \.showOnlineStatus)

            privacyToggle(icon: "clock.fill", title: "Dernière connexion", color: "45B7D1",
                          keyPath: \.showLastSeen)

            privacyToggle(icon: "checkmark.message.fill", title: "Accusés de lecture", color: "3498DB",
                          keyPath: \.showReadReceipts)

            privacyToggle(icon: "ellipsis.bubble.fill", title: "Indicateur de frappe", color: "F8B500",
                          keyPath: \.showTypingIndicator)

            privacyToggle(icon: "magnifyingglass", title: "Masquer du recherche", color: "FF6B6B",
                          keyPath: \.hideProfileFromSearch)
        }
    }

    // MARK: - Contacts & Groups

    private var contactsSection: some View {
        settingsSection(title: "Contacts & Groupes", icon: "person.2.fill", color: "4ECDC4") {
            privacyToggle(icon: "person.badge.plus", title: "Demandes de contact", color: "4ECDC4",
                          keyPath: \.allowContactRequests)

            privacyToggle(icon: "person.3.fill", title: "Invitations de groupe", color: "45B7D1",
                          keyPath: \.allowGroupInvites)

            privacyToggle(icon: "phone.arrow.down.left", title: "Appels hors contacts", color: "FF6B6B",
                          keyPath: \.allowCallsFromNonContacts)
        }
    }

    // MARK: - Media & Data

    private var mediaSection: some View {
        settingsSection(title: "Média & Données", icon: "photo.fill", color: "F8B500") {
            privacyToggle(icon: "square.and.arrow.down.fill", title: "Sauvegarder média", color: "4ADE80",
                          keyPath: \.saveMediaToGallery)

            privacyToggle(icon: "chart.bar.fill", title: "Analytics", color: "45B7D1",
                          keyPath: \.allowAnalytics)

            privacyToggle(icon: "arrow.triangle.branch", title: "Partage données", color: "9B59B6",
                          keyPath: \.shareUsageData)

            privacyToggle(icon: "camera.fill", title: "Bloquer captures", color: "FF6B6B",
                          keyPath: \.blockScreenshots)
        }
    }

    // MARK: - Encryption

    private var encryptionSection: some View {
        settingsSection(title: "Chiffrement", icon: "lock.shield.fill", color: "3498DB") {
            settingsRow(icon: "key.fill", title: "Préférence", color: "3498DB") {
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

            privacyToggle(icon: "lock.rotation", title: "Auto-chiffrer new conv.", color: "4ADE80",
                          keyPath: \.autoEncryptNewConversations)

            privacyToggle(icon: "lock.badge.clock", title: "Afficher statut chiffr.", color: "45B7D1",
                          keyPath: \.showEncryptionStatus)

            privacyToggle(icon: "exclamationmark.lock.fill", title: "Alerter non chiffré", color: "FF6B6B",
                          keyPath: \.warnOnUnencrypted)
        }
    }

    // MARK: - Helpers

    private func encryptionLabel(_ pref: EncryptionPreference) -> String {
        switch pref {
        case .disabled: return "Désactivé"
        case .optional: return "Optionnel"
        case .always: return "Toujours"
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
