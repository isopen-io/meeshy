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
                        .font(MeeshyFont.relative(14, weight: .semibold))
                    Text(String(localized: "common.back", defaultValue: "Retour", bundle: .main))
                        .font(MeeshyFont.relative(15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text(String(localized: "settings.privacy.title", defaultValue: "Confidentialité", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

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

            privacyToggle(icon: "clock.fill", title: String(localized: "settings.privacy.last_seen", defaultValue: "Dernière connexion", bundle: .main), color: MeeshyColors.infoHex,
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
        settingsSection(title: String(localized: "settings.privacy.contacts_groups", defaultValue: "Contacts & Groupes", bundle: .main), icon: "person.2.fill", color: MeeshyColors.brandPrimaryHex) {
            privacyToggle(icon: "person.badge.plus", title: String(localized: "settings.privacy.contact_requests", defaultValue: "Demandes de contact", bundle: .main), color: MeeshyColors.brandPrimaryHex,
                          keyPath: \.allowContactRequests)

            privacyToggle(icon: "person.3.fill", title: String(localized: "settings.privacy.group_invites", defaultValue: "Invitations de groupe", bundle: .main), color: MeeshyColors.infoHex,
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

            privacyToggle(icon: "chart.bar.fill", title: String(localized: "settings.privacy.analytics", defaultValue: "Analytics", bundle: .main), color: MeeshyColors.infoHex,
                          keyPath: \.allowAnalytics)

            privacyToggle(icon: "arrow.triangle.branch", title: String(localized: "settings.privacy.share_data", defaultValue: "Partage données", bundle: .main), color: "9B59B6",
                          keyPath: \.shareUsageData)

            privacyToggle(icon: "camera.fill", title: String(localized: "settings.privacy.block_screenshots", defaultValue: "Bloquer captures", bundle: .main), color: "FF6B6B",
                          keyPath: \.blockScreenshots)
        }
    }

    // MARK: - Encryption (bientôt disponible)

    /// Le chiffrement E2EE n'est pas encore opérationnel : la section est
    /// affichée GRISÉE et NON interactive avec un statut explicite « Désactivé /
    /// Bientôt disponible » (décision produit 2026-06-14). Aucune préférence de
    /// chiffrement n'est éditable tant que la fonctionnalité n'est pas livrée —
    /// éviter de laisser croire qu'un chiffrement optionnel/actif existe.
    private var encryptionSection: some View {
        settingsSection(title: String(localized: "settings.privacy.encryption", defaultValue: "Chiffrement", bundle: .main), icon: "lock.shield.fill", color: "3498DB") {
            settingsRow(icon: "hourglass", title: String(localized: "settings.privacy.encryption.coming_soon", defaultValue: "Bientôt disponible", bundle: .main), color: "3498DB") {
                Text(String(localized: "settings.privacy.encryption.status_disabled", defaultValue: "Désactivé", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundColor(theme.textSecondary)
            }
        }
        .opacity(0.55)
        .allowsHitTesting(false)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "settings.privacy.encryption.coming_soon.a11y", defaultValue: "Chiffrement — bientôt disponible, actuellement désactivé", bundle: .main))
    }

    // MARK: - Helpers

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
            .accessibilityLabel(title)
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
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(Color(hex: color))
                Text(title.uppercased())
                    .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: color))
                    .tracking(1.2)
            }
            .padding(.leading, 4)

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
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(Color(hex: color))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(hex: color).opacity(0.12))
                )
                .accessibilityHidden(true)

            Text(title)
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            trailing()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}
