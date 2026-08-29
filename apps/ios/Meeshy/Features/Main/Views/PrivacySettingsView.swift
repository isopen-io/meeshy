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
    /// Fiche « (i) » affichée en surimpression. Une seule à la fois.
    @State private var presentedInfo: SettingsInfo?

    private let accentColor = MeeshyColors.brandPrimaryHex

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
        }
        .settingsInfoOverlay($presentedInfo)
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
                    Image(systemName: "chevron.backward")
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
            VStack(spacing: MeeshySpacing.xxl + MeeshySpacing.xs) {
                visibilitySection
                contactsSection
                locationSection
                mediaSection
                encryptionSection

                Spacer().frame(height: MeeshySpacing.xxxl + MeeshySpacing.sm)
            }
            .padding(.horizontal, MeeshySpacing.xl)
            .padding(.top, MeeshySpacing.lg)
        }
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
        var info: SettingsInfo?
    }

    private var visibilitySection: some View {
        section(
            title: String(localized: "settings.privacy.visibility", defaultValue: "Visibilité", bundle: .main),
            icon: "eye.fill",
            color: "9B59B6",
            specs: [
                ToggleSpec(
                    id: "online", icon: "circle.fill",
                    title: String(localized: "settings.privacy.online_status", defaultValue: "Statut en ligne", bundle: .main),
                    color: "4ADE80", keyPath: \.showOnlineStatus,
                    info: SettingsInfo(
                        id: "privacy.online_status",
                        title: String(localized: "settings.privacy.online_status", defaultValue: "Statut en ligne", bundle: .main),
                        message: String(
                            localized: "settings.privacy.online_status.info",
                            defaultValue: "La pastille verte sur votre avatar indique que vous êtes actif. Désactivée, personne ne voit ce point — mais écrire dans une conversation reste une preuve d'activité pour vos interlocuteurs.",
                            bundle: .main
                        )
                    )
                ),
                ToggleSpec(
                    id: "lastSeen", icon: "clock.fill",
                    title: String(localized: "settings.privacy.last_seen", defaultValue: "Dernière connexion", bundle: .main),
                    color: MeeshyColors.infoHex, keyPath: \.showLastSeen
                ),
                ToggleSpec(
                    id: "readReceipts", icon: "checkmark.message.fill",
                    title: String(localized: "settings.privacy.read_receipts", defaultValue: "Accusés de lecture", bundle: .main),
                    color: "3498DB", keyPath: \.showReadReceipts,
                    info: SettingsInfo(
                        id: "privacy.read_receipts",
                        title: String(localized: "settings.privacy.read_receipts", defaultValue: "Accusés de lecture", bundle: .main),
                        message: String(
                            localized: "settings.privacy.read_receipts.info",
                            defaultValue: "Réciproque : si vous ne renvoyez pas d'accusé de lecture, vous ne verrez pas non plus si vos messages ont été lus.",
                            bundle: .main
                        )
                    )
                ),
                ToggleSpec(
                    id: "typing", icon: "ellipsis.bubble.fill",
                    title: String(localized: "settings.privacy.typing_indicator", defaultValue: "Indicateur de frappe", bundle: .main),
                    color: "F8B500", keyPath: \.showTypingIndicator
                ),
                ToggleSpec(
                    id: "hideSearch", icon: "magnifyingglass",
                    title: String(localized: "settings.privacy.hide_from_search", defaultValue: "Masquer de la recherche", bundle: .main),
                    color: "FF6B6B", keyPath: \.hideProfileFromSearch
                ),
            ]
        )
    }

    private var contactsSection: some View {
        section(
            title: String(localized: "settings.privacy.contacts_groups", defaultValue: "Contacts et groupes", bundle: .main),
            icon: "person.2.fill",
            color: MeeshyColors.brandPrimaryHex,
            specs: [
                ToggleSpec(
                    id: "contactRequests", icon: "person.badge.plus",
                    title: String(localized: "settings.privacy.contact_requests", defaultValue: "Demandes de contact", bundle: .main),
                    color: MeeshyColors.brandPrimaryHex, keyPath: \.allowContactRequests
                ),
                ToggleSpec(
                    id: "groupInvites", icon: "person.3.fill",
                    title: String(localized: "settings.privacy.group_invites", defaultValue: "Invitations de groupe", bundle: .main),
                    color: MeeshyColors.infoHex, keyPath: \.allowGroupInvites
                ),
                ToggleSpec(
                    id: "callsNonContacts", icon: "phone.arrow.down.left",
                    title: String(localized: "settings.privacy.calls_non_contacts", defaultValue: "Appels hors contacts", bundle: .main),
                    color: "FF6B6B", keyPath: \.allowCallsFromNonContacts
                ),
            ]
        )
    }

    /// Les réglages de partage de position — la MÊME vue que celle qu'ouvre le
    /// `(i)` du sélecteur de lieu. Une seule source, deux surfaces : ce sont
    /// des préférences applicatives, pas propres à une conversation.
    ///
    /// Contrairement aux autres sections de cet écran, celle-ci est pleinement
    /// fonctionnelle — pas de « Bientôt disponible ».
    private var locationSection: some View {
        LocationSharingSettingsSection(accentColor: accentColor)
    }

    private var mediaSection: some View {
        section(
            title: String(localized: "settings.privacy.media_data", defaultValue: "Média & Données", bundle: .main),
            icon: "photo.fill",
            color: "F8B500",
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
                    info: SettingsInfo(
                        id: "privacy.analytics",
                        title: String(localized: "settings.privacy.analytics", defaultValue: "Analytique", bundle: .main),
                        message: String(
                            localized: "settings.privacy.analytics.info",
                            defaultValue: "Mesure d'usage anonyme : écrans ouverts, fonctionnalités utilisées, plantages. Jamais le contenu de vos messages, ni vos contacts. Le réglage prend effet immédiatement.",
                            bundle: .main
                        )
                    )
                ),
                ToggleSpec(
                    id: "shareData", icon: "arrow.triangle.branch",
                    title: String(localized: "settings.privacy.share_data", defaultValue: "Partage données", bundle: .main),
                    color: "9B59B6", keyPath: \.shareUsageData
                ),
                ToggleSpec(
                    id: "blockScreenshots", icon: "camera.fill",
                    title: String(localized: "settings.privacy.block_screenshots", defaultValue: "Bloquer les captures", bundle: .main),
                    color: "FF6B6B", keyPath: \.blockScreenshots
                ),
            ]
        )
    }

    // MARK: - Chiffrement (bientôt disponible)

    /// Le chiffrement E2EE n'est pas encore opérationnel : la section est
    /// affichée GRISÉE et NON interactive avec un statut explicite « Désactivé /
    /// Bientôt disponible » (décision produit 2026-06-14). Aucune préférence de
    /// chiffrement n'est éditable tant que la fonctionnalité n'est pas livrée —
    /// éviter de laisser croire qu'un chiffrement optionnel/actif existe.
    private var encryptionSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            SettingsSectionHeader(
                title: String(localized: "settings.privacy.encryption", defaultValue: "Chiffrement", bundle: .main),
                icon: "lock.shield.fill",
                color: "3498DB"
            )
            SettingsCard(tint: "3498DB") {
                SettingsRow(
                    icon: "hourglass",
                    title: String(localized: "settings.privacy.encryption.coming_soon", defaultValue: "Bientôt disponible", bundle: .main),
                    color: "3498DB"
                ) {
                    Text(String(localized: "settings.privacy.encryption.status_disabled", defaultValue: "Désactivé", bundle: .main))
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .foregroundColor(theme.textSecondary)
                }
            }
        }
        .opacity(0.55)
        .allowsHitTesting(false)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "settings.privacy.encryption.coming_soon.a11y", defaultValue: "Chiffrement — bientôt disponible, actuellement désactivé", bundle: .main))
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

    @ViewBuilder
    private func privacyToggle(_ spec: ToggleSpec) -> some View {
        if Self.isComingSoon(spec.keyPath) {
            SettingsRow(icon: spec.icon, title: spec.title, color: spec.color) {
                Text(String(localized: "settings.privacy.coming_soon", defaultValue: "Bientôt disponible", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundColor(theme.textSecondary)
            }
            .opacity(0.55)
            .allowsHitTesting(false)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(spec.title) — \(String(localized: "settings.privacy.coming_soon.a11y", defaultValue: "bientôt disponible, actuellement sans effet", bundle: .main))")
        } else {
            SettingsRow(
                icon: spec.icon,
                title: spec.title,
                color: spec.color,
                info: spec.info,
                onInfo: { presentedInfo = $0 }
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

    /// Bascules de confidentialité pas encore appliquées — ni côté iOS, ni
    /// côté gateway (`hideProfileFromSearch` exigerait un filtre serveur sur
    /// la recherche ; `blockScreenshots` n'a pas d'API publique iOS pour
    /// réellement bloquer une capture ; `allowCallsFromNonContacts` exigerait
    /// de toucher `CallManager.swift`, hors-lane ici ; `saveMediaToGallery`
    /// supposerait un pipeline d'auto-save à la réception, inexistant ;
    /// `shareUsageData` n'a pas de mécanisme distinct de `allowAnalytics` ;
    /// `allowContactRequests`/`allowGroupInvites` exigeraient un check côté
    /// gateway avant la création d'une demande de contact
    /// (`routes/friends.ts`) ou l'ajout d'un membre à un groupe
    /// (`routes/conversations/participants.ts`) — `PrivacyPreferencesService`
    /// ne les expose aujourd'hui qu'à `PresenceVisibilityService`/l'accusé de
    /// lecture, jamais à ces deux flux).
    /// Grisées avec "Bientôt disponible" plutôt que persistées sans effet
    /// (faux sentiment de confidentialité) — cf.
    /// tasks/audit-backlog-2026-07-20.md LANE Réglages, item P1. Retirer un
    /// cas dès qu'une application réelle existe pour ce champ.
    /// `nonisolated`: pure Set membership check, no actor-isolated state.
    nonisolated static func isComingSoon(_ keyPath: WritableKeyPath<PrivacyPreferences, Bool>) -> Bool {
        Self.comingSoonPrivacyKeyPaths.contains(keyPath as AnyKeyPath)
    }

    nonisolated(unsafe) private static let comingSoonPrivacyKeyPaths: Set<AnyKeyPath> = [
        \PrivacyPreferences.hideProfileFromSearch,
        \PrivacyPreferences.blockScreenshots,
        \PrivacyPreferences.allowCallsFromNonContacts,
        \PrivacyPreferences.saveMediaToGallery,
        \PrivacyPreferences.shareUsageData,
        \PrivacyPreferences.allowContactRequests,
        \PrivacyPreferences.allowGroupInvites,
    ]

}
