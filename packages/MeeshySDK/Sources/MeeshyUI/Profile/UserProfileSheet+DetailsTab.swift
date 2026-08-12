import SwiftUI
import MeeshySDK

// MARK: - UserProfileSheet — Details tab
//
// Reuses the historical "Profil" tab pieces (bioCard, languagePills,
// ProfileCompletionRing, infoChip, e2eeBadge, actionButtons) and adds:
//   1. a Report ("Signaler") action with a reasons confirmation dialog,
//   2. a Voice ("Voix") card playing the public voice sample,
//   3. a compact stats band (member-since + mini stat chips).

extension UserProfileSheet {

    @ViewBuilder
    var detailsTab: some View {
        // Même trame que les écrans de réglages : en-tête de section teinté,
        // contenu groupé, respiration constante entre les blocs. Ici la teinte
        // n'est pas fixe — c'est `resolvedAccent`, la couleur déterministe du
        // profil, donc chaque fiche porte sa propre identité chromatique.
        VStack(spacing: MeeshySpacing.xxl + MeeshySpacing.xs) {
            aboutSection
            voiceSection
            if !isCurrentUser { actionsSection }
            statsSection
        }
        .confirmationDialog(
            String(localized: "profile.action.report", defaultValue: "Signaler", bundle: .module),
            isPresented: $showReportSheet,
            titleVisibility: .visible
        ) {
            ForEach(Self.reportReasons, id: \.key) { reason in
                Button(reason.label, role: .destructive) {
                    submitReport(reportType: reason.key)
                }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
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
                        e2eeBadge
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

    // MARK: - Actions

    private var actionsSection: some View {
        profileSection(
            title: String(localized: "profile.section.actions", defaultValue: "Actions", bundle: .module),
            icon: "hand.tap.fill"
        ) {
            actionButtons
        }
    }

    // MARK: - Statistiques

    private var statsSection: some View {
        profileSection(
            title: String(localized: "profile.section.stats", defaultValue: "Statistiques", bundle: .module),
            icon: "chart.bar.fill"
        ) {
            compactStatsBand
        }
    }

    // MARK: - Action buttons (connection + block + report)

    @ViewBuilder
    var actionButtons: some View {
        VStack(spacing: 10) {
            connectionContextBanner

            switch connectionStatus {
            case .none:
                profileActionButton(
                    icon: "person.badge.plus.fill",
                    label: String(localized: "profile.action.connectionRequest", defaultValue: "Demande de connexion", bundle: .module),
                    color: Color(hex: resolvedAccent),
                    action: { Task { await sendConnectionRequest() } }
                )
            case .pendingSent:
                profileActionButton(
                    icon: "xmark.circle.fill",
                    label: String(localized: "profile.action.cancelRequest", defaultValue: "Annuler la demande", bundle: .module),
                    color: theme.textMuted,
                    action: { Task { await cancelRequest() } }
                )
                profileActionButton(
                    icon: "arrow.clockwise.circle.fill",
                    label: String(localized: "profile.action.resendRequest", defaultValue: "Renvoyer la demande", bundle: .module),
                    color: Color(hex: resolvedAccent),
                    action: { Task { await resendRequest() } }
                )
            case .pendingReceived:
                profileActionButton(
                    icon: "checkmark.circle.fill",
                    label: String(localized: "profile.action.acceptConnection", defaultValue: "Accepter la connexion", bundle: .module),
                    color: MeeshyColors.success,
                    action: { Task { await acceptRequest() } }
                )
                profileActionButton(
                    icon: "xmark.circle.fill",
                    label: String(localized: "profile.action.declineConnection", defaultValue: "Refuser la connexion", bundle: .module),
                    color: theme.textMuted,
                    action: { Task { await declineRequest() } }
                )
            case .connected:
                HStack(spacing: 8) {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 14))
                        .foregroundColor(MeeshyColors.success)
                    Text(String(localized: "profile.status.connected", defaultValue: "Connectes", bundle: .module))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(MeeshyColors.success)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(MeeshyColors.success.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }

            if isBlocked {
                profileActionButton(
                    icon: "hand.raised.slash.fill",
                    label: String(localized: "profile.action.unblockUser", defaultValue: "Debloquer l'utilisateur", bundle: .module),
                    color: MeeshyColors.warning,
                    action: { Task { await unblockUser() } }
                )
            } else {
                profileActionButton(
                    icon: "hand.raised.fill",
                    label: String(localized: "profile.action.blockUser", defaultValue: "Bloquer cet utilisateur", bundle: .module),
                    color: theme.error,
                    action: { Task { await blockUser() } }
                )
            }

            // Report — placed below block.
            profileActionButton(
                icon: "flag.fill",
                label: String(localized: "profile.action.report", defaultValue: "Signaler", bundle: .module),
                color: theme.warning,
                action: { showReportSheet = true }
            )
        }
    }

    /// Explanatory context shown above the connection action buttons so the
    /// accept/decline (or cancel/resend) actions are self-explanatory even when
    /// the originating notification is gone — answers "connexion de quoi ?".
    @ViewBuilder
    var connectionContextBanner: some View {
        let name = displayUser.resolvedDisplayName
        switch connectionStatus {
        case .pendingReceived:
            connectionContextRow(
                icon: "person.crop.circle.badge.questionmark.fill",
                text: String(
                    localized: "profile.connection.context.received",
                    defaultValue: "\(name) souhaite entrer en contact avec vous. Acceptez pour échanger des messages.",
                    bundle: .module
                )
            )
        case .pendingSent:
            connectionContextRow(
                icon: "paperplane.circle.fill",
                text: String(
                    localized: "profile.connection.context.sent",
                    defaultValue: "Vous avez envoyé une demande de connexion à \(name). En attente de sa réponse.",
                    bundle: .module
                )
            )
        case .none, .connected:
            EmptyView()
        }
    }

    private func connectionContextRow(icon: String, text: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Color(hex: resolvedAccent))
            Text(text)
                .font(.system(size: 13))
                .foregroundColor(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(theme.surface(tint: resolvedAccent, intensity: 0.1))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }

    func profileActionButton(icon: String, label: String, color: Color, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.medium()
            action()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .semibold))
                Text(label)
                    .font(.system(size: 14, weight: .semibold))
            }
            .foregroundColor(color)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(color.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(color.opacity(0.3), lineWidth: 1.5)
            )
        }
        .pressable()
        .accessibilityLabel(label)
    }

    // MARK: - Report reasons (mapped to gateway enum)

    struct ReportReason: Identifiable {
        let key: String
        let label: String
        var id: String { key }
    }

    static var reportReasons: [ReportReason] {
        [
            ("spam", String(localized: "report.reason.spam", defaultValue: "Spam", bundle: .module)),
            ("inappropriate", String(localized: "report.reason.inappropriate", defaultValue: "Contenu inapproprié", bundle: .module)),
            ("harassment", String(localized: "report.reason.harassment", defaultValue: "Harcèlement", bundle: .module)),
            ("violence", String(localized: "report.reason.violence", defaultValue: "Violence", bundle: .module)),
            ("hate_speech", String(localized: "report.reason.hate_speech", defaultValue: "Discours haineux", bundle: .module)),
            ("fake_profile", String(localized: "report.reason.fake_profile", defaultValue: "Faux profil", bundle: .module)),
            ("impersonation", String(localized: "report.reason.impersonation", defaultValue: "Usurpation d'identité", bundle: .module)),
            ("other", String(localized: "report.reason.other", defaultValue: "Autre", bundle: .module))
        ].map { ReportReason(key: $0.0, label: $0.1) }
    }

    private func submitReport(reportType: String) {
        guard let userId = resolvedUserId, !userId.isEmpty else { return }
        HapticFeedback.medium()
        Task {
            do {
                try await ReportService.shared.reportUser(userId: userId, reportType: reportType, reason: nil)
                postToast(String(localized: "profile.toast.reportSent", defaultValue: "Signalement envoyé", bundle: .module), isSuccess: true)
            } catch {
                postToast(String(localized: "profile.toast.reportFailed", defaultValue: "Impossible d'envoyer le signalement", bundle: .module), isSuccess: false)
            }
        }
    }

    // MARK: - Voice card

    @ViewBuilder
    var voiceCard: some View {
        if displayUser.voicePublic == true,
           let url = displayUser.voiceSampleUrl, !url.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "waveform")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color(hex: resolvedAccent))
                    Text(String(localized: "profile.voice.title", defaultValue: "Voix", bundle: .module))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
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
    /// full stats stack. Triggers `loadStatsIfNeeded()` on appear. Achievements
    /// grid is dropped here for compactness.
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
                HStack(spacing: 8) {
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
                HStack(spacing: 8) {
                    ForEach(0..<4, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 12)
                            .fill(theme.surface(tint: resolvedAccent, intensity: 0.1))
                            .frame(height: 56)
                            .shimmer()
                    }
                }
            } else {
                Color.clear
                    .frame(height: 1)
                    .onAppear {
                        Task { await loadStatsIfNeeded() }
                    }
            }
        }
    }

    private func miniStatChip(icon: String, value: Int, label: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: resolvedAccent))
            Text("\(value)")
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
            Text(label)
                .font(.caption2)
                .foregroundColor(theme.textMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
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
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(SettingsRowMetrics.accessibilityLabel(title: label, value: value))
        }
    }
}
