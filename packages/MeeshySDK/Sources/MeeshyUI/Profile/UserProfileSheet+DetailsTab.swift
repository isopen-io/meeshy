import SwiftUI
import MeeshySDK

// MARK: - UserProfileSheet — Details tab
//
// La Vitrine de la fiche d'un autre (#18870) : les pièces de l'ancien onglet
// Détails (bio, langues, fuseau, pays, chiffrement, complétude, voix, chiffres),
// puis « En commun » et « Publications », qui étaient deux onglets.

extension UserProfileSheet {

    /// La Vitrine de l'autre (loi 1) : qui il est, puis ce que les anciens onglets portaient — ce que nous avons en
    /// commun et ses publications (loi 11). Les opérations sont sur la face Actions.
    @ViewBuilder
    var vitrineFace: some View {
        VStack(spacing: MeeshySpacing.xxl + MeeshySpacing.xs) {
            aboutSection
            voiceSection
            statsSection
            commonSection
            publicationsSection
        }
    }

    // MARK: - En commun (l'ancien onglet Conversations)

    private var commonSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(
                title: String(localized: "profile.relation.section.common", defaultValue: "En commun", bundle: .module),
                count: effectiveConversations.isEmpty ? nil : effectiveConversations.count
            )
            .padding(.horizontal, MeeshySpacing.xl)
            conversationsTab
        }
    }

    // MARK: - Publications (l'ancien onglet Publications)

    private var publicationsSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(
                title: String(localized: "profile.relation.section.posts", defaultValue: "Publications", bundle: .module)
            )
            .padding(.horizontal, MeeshySpacing.xl)
            postsTab
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
                                infoChip(icon: "clock.fill", text: tz)
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

    /// A small horizontal band of mini stat chips + member-since, replacing the
    /// full stats stack. The figures are read with the profile when the sheet
    /// opens (#10093) — cached first, then synchronized. Achievements grid is
    /// dropped here for compactness.
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

            if let stats = effectiveUserStats {
                HStack(spacing: MeeshySpacing.sm) {
                    miniStatChip(icon: "paperplane.fill", value: stats.totalMessages,
                                 label: String(localized: "profile.stats.messagesShort", defaultValue: "Messages", bundle: .module))
                    miniStatChip(icon: "character.book.closed.fill", value: stats.totalTranslations,
                                 label: String(localized: "profile.stats.translationsShort", defaultValue: "Traductions", bundle: .module))
                    miniStatChip(icon: "globe", value: stats.languagesUsed,
                                 label: String(localized: "profile.stats.languagesShort", defaultValue: "Langues", bundle: .module))
                    miniStatChip(icon: "calendar.badge.checkmark", value: stats.memberDays,
                                 label: String(localized: "profile.stats.daysShort", defaultValue: "Jours", bundle: .module))
                }
            } else if effectiveIsLoadingStats {
                HStack(spacing: MeeshySpacing.sm) {
                    ForEach(0..<4, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                            .fill(theme.surface(tint: resolvedAccent, intensity: 0.1))
                            .frame(height: 56)
                            .shimmer()
                    }
                }
            }
        }
    }

    private func miniStatChip(icon: String, value: Int, label: String) -> some View {
        VStack(spacing: MeeshySpacing.xs) {
            Image(systemName: icon)
                .font(.system(size: MeeshyIconSize.sm, weight: .medium))
                .foregroundStyle(Color(hex: resolvedAccent))
            Text("\(value)")
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold, design: .rounded))
                .foregroundStyle(theme.textPrimary)
            Text(label)
                .font(.caption2)
                .foregroundStyle(theme.textMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, MeeshySpacing.smPlus)
        .background(theme.surfaceGradient(tint: resolvedAccent))
        .glassCard(cornerRadius: MeeshyRadius.lg)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String("\(value) \(label)"))
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
