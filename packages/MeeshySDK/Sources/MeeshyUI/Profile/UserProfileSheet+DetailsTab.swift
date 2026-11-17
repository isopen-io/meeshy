import SwiftUI
import MeeshySDK

// MARK: - UserProfileSheet — Details tab
//
// La Vitrine de la fiche d'un autre (#18870) : les pièces de l'ancien onglet
// Détails (bio, langues, fuseau, pays, chiffrement, complétude, voix, chiffres),
// puis « En commun » et « Publications », qui étaient deux onglets.

extension UserProfileSheet {

    /// La Vitrine de l'autre (loi 1) : qui il est, « Avec lui » (K32, vers la face Actions), « En direct » dès Proche,
    /// sa voix, son jeu, ses chiffres, puis ce que les anciens onglets portaient — ce que nous avons en commun et ses
    /// publications (loi 11). Planche `Autre-Vitrine` (#19416).
    @ViewBuilder
    var vitrineFace: some View {
        VStack(spacing: MeeshySpacing.xxl + MeeshySpacing.xs) {
            aboutSection
            withThemSection
            liveSection
            voiceSection
            gameSectionCard
            statsSection
            commonSection
            publicationsSection
            ProfileAcquaintanceSection.of(self)
        }
    }

    // MARK: - En commun (l'ancien onglet Conversations)

    /// Nos conversations, puis nos communautés, amis, médias et notre histoire (#19377, planche `Autre-Commun`).
    /// Bloqué dans un sens ou l'autre, ou sa propre fiche : seulement les conversations, comme avant.
    private var commonSection: some View {
        ProfileInCommonSection(
            userId: isCurrentUser || isInteractionDisabled ? nil : resolvedUserId,
            source: dependencies.inCommon,
            conversationCount: effectiveConversations.count,
            isLoadingConversations: effectiveIsLoadingConversations,
            tint: accentTint,
            accentHex: resolvedAccent,
            onFirstMessage: isCurrentUser || isInteractionDisabled ? nil : { openConversation() },
            onOpenImage: { url in openFullscreenImage(url: url, fallback: "") }
        ) {
            conversationsTab
        }
    }

    // MARK: - Publications (l'ancien onglet Publications)

    @ViewBuilder
    private var publicationsSection: some View {
        if postsContent != nil && !isCurrentUser {
            postsTab.environment(\.meeshyProfileAccent, resolvedAccent)
        } else {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: String(localized: "profile.relation.section.posts", defaultValue: "Publications", bundle: .module))
                    .padding(.horizontal, MeeshySpacing.xl)
                postsTab
            }
        }
    }

    /// En-tête + contenu, marges d'écran comprises — l'exact pendant du
    /// `section(...)` de `PrivacySettingsView`.
    @ViewBuilder
    private func profileSection<Content: View>(
        title: String,
        icon: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            SettingsSectionHeader(title: title, icon: icon, color: resolvedAccent)
            content()
        }
        .padding(.horizontal, MeeshySpacing.xl)
    }

    // MARK: - À propos

    @ViewBuilder
    private var aboutSection: some View {
        let hasChips = displayUser.timezone != nil || displayUser.registrationCountry != nil
        let hasBio = !(displayUser.bio ?? "").isEmpty

        if hasBio || hasChips || displayUser.hasE2EE || displayUser.profileCompletionRate != nil {
            profileSection(
                title: String(localized: "profile.section.about", defaultValue: "À propos", bundle: .module),
                icon: "person.text.rectangle.fill"
            ) {
                VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                    if let bio = displayUser.bio, !bio.isEmpty {
                        bioCard(bio)
                    }

                    languagePills

                    if hasChips {
                        HStack(spacing: MeeshySpacing.sm) {
                            if let tz = displayUser.timezone {
                                TimelineView(.everyMinute) { context in
                                    infoChip(icon: "clock.fill", text: ProfileVitrineCopy.localTime(
                                        timezone: tz, name: displayUser.resolvedDisplayName, now: context.date))
                                }
                            }
                            if let country = displayUser.registrationCountry {
                                let countryName = CountryFlag.name(for: country) ?? country
                                infoChip(icon: CountryFlag.emoji(for: country), text: countryName)
                            }
                        }
                    }

                    if displayUser.hasE2EE {
                        ProfileE2EEBadge()
                    }

                    if let completionRate = displayUser.profileCompletionRate {
                        ProfileCompletionRing(progress: Double(completionRate) / 100.0)
                            .frame(maxWidth: .infinity)
                            .padding(.top, MeeshySpacing.xs)
                    }
                }
            }
        }
    }

    // MARK: - Voix

    @ViewBuilder
    private var voiceSection: some View {
        if displayUser.voicePublic == true, !(displayUser.voiceSampleUrl ?? "").isEmpty {
            profileSection(
                title: String(localized: "profile.voice.title", defaultValue: "Voix", bundle: .module),
                icon: "waveform"
            ) {
                voiceCard
            }
        }
    }

    // MARK: - Statistiques

    private var statsSection: some View {
        profileSection(
            title: String(localized: "profile.section.stats", defaultValue: "STATISTIQUES", bundle: .module),
            icon: "chart.bar.fill"
        ) {
            compactStatsBand
        }
    }

    // MARK: - Voice card

    @ViewBuilder
    var voiceCard: some View {
        if displayUser.voicePublic == true,
           let url = displayUser.voiceSampleUrl, !url.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    Image(systemName: "waveform")
                        .font(.system(size: MeeshyIconSize.xs, weight: .semibold))
                        .foregroundStyle(Color(hex: resolvedAccent))
                    Text(String(localized: "profile.voice.title", defaultValue: "Voix", bundle: .module))
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold))
                        .foregroundStyle(theme.textPrimary)
                }

                AudioPlayerView(
                    attachment: voiceAttachment(url: url),
                    context: .feedPost,
                    accentColor: resolvedAccent
                )
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(MeeshySpacing.lg)
            .background(theme.surfaceGradient(tint: resolvedAccent))
            .glassCard(cornerRadius: MeeshyRadius.xxl)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(String(localized: "profile.voice.title", defaultValue: "Voix", bundle: .module))
        }
    }

    private func voiceAttachment(url: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: "voice-\(displayUser.id)",
            mimeType: "audio/mp4",
            fileUrl: url,
            duration: displayUser.voiceSampleDurationMs,
            thumbnailColor: resolvedAccent
        )
    }

    // MARK: - Compact stats band

    /// « Membre depuis » puis la bande de chiffres du kit (K34, planche
    /// `Autre-Vitrine` § « En chiffres »). Les chiffres sont lus avec le profil
    /// à l'ouverture (#10093) — cache d'abord, puis synchronisés ; le squelette
    /// du kit ne se montre que sur un cache vide.
    @ViewBuilder
    var compactStatsBand: some View {
        // Aucune marge horizontale ici : `profileSection` porte déjà celles de
        // l'écran. En reposer donnerait un double retrait, visible comme un
        // décrochement par rapport aux autres sections.
        VStack(spacing: MeeshySpacing.md) {
            if let createdAt = displayUser.createdAt {
                statCard(
                    icon: "calendar",
                    label: String(localized: "profile.stats.memberSince", defaultValue: "Membre depuis", bundle: .module),
                    value: formatRegistrationDate(createdAt)
                )
            }

            if ProfileVitrineFigures.isVisible(stats: effectiveUserStats, isLoading: effectiveIsLoadingStats) {
                MeeshyFigureBand(items: ProfileVitrineFigures.items(of: effectiveUserStats), size: .compact,
                                 isLoading: effectiveUserStats == nil && effectiveIsLoadingStats,
                                 emptyLabel: ProfileVitrineFigures.emptyLabel)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("profile.vitrine.figures")
            }
        }
    }

    // MARK: - Stat card (member-since)

    func statCard(icon: String, label: String, value: String) -> some View {
        // Icône teintée, libellé, valeur à droite : c'est exactement une ligne
        // de réglage. Elle emprunte la trame partagée au lieu d'en redessiner
        // une cinquième, et hérite au passage de la cible tactile de 44 pt et
        // de l'étiquette VoiceOver « libellé, valeur ».
        SettingsCard(tint: resolvedAccent) {
            SettingsRow(icon: icon, title: label, color: resolvedAccent) {
                Text(value)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                    .foregroundStyle(theme.textPrimary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(SettingsRowMetrics.accessibilityLabel(title: label, value: value))
        }
    }
}
