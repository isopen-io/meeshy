import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct PrivacySettingsView: View {
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }
    @ObservedObject private var prefs: UserPreferencesManager
    init(prefs: UserPreferencesManager = .shared) {
        self.prefs = prefs
    }
    /// Le (i) ouvert : sa note se déplie sous la rangée, une seule à la fois.
    @State private var openNoteID: String?
    @State private var showsEncryptedDevices = false
    /// Réglage de l'APPAREIL (#11296) : l'adresse IP à masquer est la sienne.
    @AppStorage(CallAddressPrivacySetting.key) private var hidesCallAddress = false

    private let accentColor = MeeshyColors.brandPrimaryHex

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            CollapsibleHeaderPage(
                title: String(localized: "settings.privacy.title", defaultValue: "Confidentialité", bundle: .main),
                onBack: { dismiss() },
                titleColor: theme.textPrimary,
                backArrowColor: Color(hex: accentColor),
                backgroundColor: theme.backgroundPrimary,
                content: { pageContent }
            )
        }
        .adaptiveOnChange(of: prefs.privacy.allowAnalytics) { _, _ in
            AnalyticsManager.shared.syncCollectionState()
        }
    }

    // MARK: - Content

    private var pageContent: some View {
        VStack(spacing: MeeshySpacing.xxl + MeeshySpacing.xs) {
            visibilitySection
            contactsSection
            locationSection
            mediaSection
            callsSection
            encryptionSection

            Spacer().frame(height: MeeshySpacing.xxxl + MeeshySpacing.sm)
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.top, MeeshySpacing.lg)
    }

    // MARK: - Sections

    /// Une bascule de confidentialité, décrite en DONNÉES.
    ///
    /// Les lignes d'une section sont homogènes : les décrire permet de les
    /// parcourir avec `ForEach` et d'intercaler les filets par l'index, sans
    /// avoir à poser un `SettingsSeparator` à la main entre chaque paire — donc
    /// sans risque d'en oublier un, ou d'en laisser un sous la dernière ligne.
    private struct ToggleSpec: Identifiable {
        let id: String
        let icon: String
        let title: String
        let color: String
        let keyPath: WritableKeyPath<PrivacyPreferences, Bool>
        var summary: String?
        var note: MeeshyInfoNote?
    }

    private var visibilitySection: some View {
        section(
            title: String(localized: "settings.privacy.visibility", defaultValue: "Visibilité", bundle: .main),
            icon: "eye.fill",
            color: MeeshyColors.tileAmethystHex,
            specs: [
                ToggleSpec(
                    id: "online", icon: "circle.fill",
                    title: String(localized: "settings.privacy.online_status", defaultValue: "Statut en ligne", bundle: .main),
                    color: "4ADE80", keyPath: \.showOnlineStatus,
                    summary: String(localized: "settings.privacy.online_status.summary", defaultValue: "La pastille verte dit que vous êtes actif.", bundle: .main),
                    note: SettingsInfoNotes.onlineStatus
                ),
                ToggleSpec(
                    id: "notifyOnReturn", icon: "person.crop.circle.badge.clock",
                    title: String(localized: "settings.privacy.notify_contacts_on_return", defaultValue: "Annoncer mon retour", bundle: .main),
                    color: MeeshyColors.tileTealHex, keyPath: \.notifyContactsOnReturn,
                    summary: String(localized: "settings.privacy.notify_contacts_on_return.summary", defaultValue: "Vos contacts voient « était sur Meeshy récemment », au plus toutes les 3 heures.", bundle: .main),
                    note: SettingsInfoNotes.returnAnnouncement
                ),
                ToggleSpec(
                    id: "lastSeen", icon: "clock.fill",
                    title: String(localized: "settings.privacy.last_seen", defaultValue: "Dernière connexion", bundle: .main),
                    color: MeeshyColors.infoHex, keyPath: \.showLastSeen
                ),
                ToggleSpec(
                    id: "readReceipts", icon: "checkmark.message.fill",
                    title: String(localized: "settings.privacy.read_receipts", defaultValue: "Accusés de lecture", bundle: .main),
                    color: MeeshyColors.tileBlueHex, keyPath: \.showReadReceipts,
                    note: SettingsInfoNotes.readReceipts
                ),
                ToggleSpec(
                    id: "typing", icon: "ellipsis.bubble.fill",
                    title: String(localized: "settings.privacy.typing_indicator", defaultValue: "Indicateur de frappe", bundle: .main),
                    color: MeeshyColors.tileSaffronHex, keyPath: \.showTypingIndicator
                ),
                ToggleSpec(
                    id: "hideSearch", icon: "magnifyingglass",
                    title: String(localized: "settings.privacy.hide_from_contact_search", defaultValue: "Masquer mon numéro et mon e-mail", bundle: .main),
                    color: MeeshyColors.tileCoralHex, keyPath: \.hideProfileFromSearch,
                    note: SettingsInfoNotes.contactSearch
                ),
            ]
        )
    }

    private var contactsSection: some View {
        section(
            title: String(localized: "settings.privacy.contacts_groups", defaultValue: "Contacts", bundle: .main),
            icon: "person.2.fill",
            color: MeeshyColors.brandPrimaryHex,
            specs: [
                ToggleSpec(
                    id: "callsNonContacts", icon: "phone.arrow.down.left",
                    title: String(localized: "settings.privacy.calls_non_contacts", defaultValue: "Appels hors contacts", bundle: .main),
                    color: MeeshyColors.tileCoralHex, keyPath: \.acceptCallsFromNonContacts,
                    note: SettingsInfoNotes.callsFromNonContacts
                ),
            ]
        )
    }

    /// Les réglages de partage de position — la MÊME vue que celle qu'ouvre le
    /// `(i)` du sélecteur de lieu. Une seule source, deux surfaces : ce sont
    /// des préférences applicatives, pas propres à une conversation.
    private var locationSection: some View {
        LocationSharingSettingsSection(accentColor: accentColor)
    }

    private var mediaSection: some View {
        section(
            title: String(localized: "settings.privacy.media_data", defaultValue: "Média & Données", bundle: .main),
            icon: "photo.fill",
            color: MeeshyColors.tileSaffronHex,
            specs: [
                ToggleSpec(
                    id: "saveMedia", icon: "square.and.arrow.down.fill",
                    title: String(localized: "settings.privacy.save_media", defaultValue: "Sauvegarder média", bundle: .main),
                    color: "4ADE80", keyPath: \.saveMediaToGallery
                ),
                ToggleSpec(
                    id: "analytics", icon: "chart.bar.fill",
                    title: String(localized: "settings.privacy.analytics", defaultValue: "Analytique", bundle: .main),
                    color: MeeshyColors.infoHex, keyPath: \.allowAnalytics,
                    note: SettingsInfoNotes.analytics
                ),
            ]
        )
    }

    // MARK: - Appels (#11296)

    /// « Masquer mon adresse IP » force le relais TURN sur toutes les connexions
    /// d'appel : le correspondant ne voit que l'adresse du relais Meeshy.
    private var callsSection: some View {
        let titre = String(localized: "settings.privacy.calls.hide_ip", defaultValue: "Masquer mon adresse IP", bundle: .main)
        return VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            SettingsSectionHeader(title: String(localized: "settings.privacy.calls", defaultValue: "Appels", bundle: .main),
                                  icon: "phone.fill", color: MeeshyColors.tileBlueHex)
            SettingsCard(tint: MeeshyColors.tileBlueHex) {
                SettingsRow(
                    icon: "eye.slash.fill", title: titre, color: MeeshyColors.tileBlueHex,
                    note: SettingsInfoNotes.hiddenCallAddress,
                    openNoteID: $openNoteID
                ) {
                    Toggle("", isOn: $hidesCallAddress)
                        .labelsHidden()
                        .tint(Color(hex: accentColor))
                        .accessibilityLabel(titre)
                }
            }
        }
    }

    // MARK: - Chiffrement

    /// Le chiffrement de bout en bout existe : optionnel, choisi conversation par
    /// conversation, irréversible. La phrase le dit au repos (règle 7 de l'épure),
    /// le détail passe derrière un (i), et « Mes appareils chiffrés » est à un geste.
    private var encryptionSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            SettingsSectionHeader(
                title: String(localized: "settings.privacy.encryption", defaultValue: "Chiffrement", bundle: .main),
                icon: "lock.shield.fill",
                color: MeeshyColors.tileBlueHex
            )
            MeeshyInfoNoted(note: SettingsInfoNotes.encryption, openNoteID: $openNoteID, tint: theme.textSecondary) {
                SettingsSentence(text: SettingsOrientation.encryption)
            }
            SettingsCard(tint: MeeshyColors.tileBlueHex) {
                Button {
                    HapticFeedback.light()
                    showsEncryptedDevices = true
                } label: {
                    SettingsRow(
                        icon: "iphone.and.arrow.forward",
                        title: String(localized: "e2ee.devices.title", defaultValue: "Mes appareils chiffrés", bundle: .main),
                        color: MeeshyColors.tileBlueHex
                    ) {
                        Image(systemName: "chevron.forward")
                            .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                            .foregroundStyle(theme.textMuted)
                            .accessibilityHidden(true)
                    }
                }
                .accessibilityIdentifier("privacy.encryptedDevices")
            }
        }
        .sheet(isPresented: $showsEncryptedDevices) { EncryptedDevicesView() }
    }

    // MARK: - Assemblage

    private func section(title: String, icon: String, color: String, specs: [ToggleSpec]) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            SettingsSectionHeader(title: title, icon: icon, color: color)
            SettingsCard(tint: color) {
                ForEach(Array(specs.enumerated()), id: \.element.id) { index, spec in
                    if index > 0 { SettingsSeparator(tint: color) }
                    privacyToggle(spec)
                }
            }
        }
    }

    private func privacyToggle(_ spec: ToggleSpec) -> some View {
        SettingsRow(
            icon: spec.icon,
            title: spec.title,
            subtitle: spec.summary,
            color: spec.color,
            note: spec.note,
            openNoteID: $openNoteID
        ) {
            Toggle("", isOn: Binding(
                get: { prefs.privacy[keyPath: spec.keyPath] },
                set: { val in prefs.updatePrivacy { $0[keyPath: spec.keyPath] = val } }
            ))
            .labelsHidden()
            .tint(Color(hex: accentColor))
            .accessibilityLabel(spec.title)
        }
    }
}
