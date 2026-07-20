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
        VStack(spacing: 16) {
            if let bio = displayUser.bio, !bio.isEmpty {
                bioCard(bio)
                    .padding(.horizontal, 20)
            }

            languagePills
                .padding(.horizontal, 20)

            if let completionRate = displayUser.profileCompletionRate {
                ProfileCompletionRing(progress: Double(completionRate) / 100.0)
                    .padding(.vertical, 8)
            }

            if displayUser.timezone != nil || displayUser.registrationCountry != nil {
                HStack(spacing: 8) {
                    if let tz = displayUser.timezone {
                        infoChip(icon: "clock.fill", text: tz)
                    }
                    if let country = displayUser.registrationCountry {
                        let countryName = CountryFlag.name(for: country) ?? country
                        let flag = CountryFlag.emoji(for: country)
                        infoChip(icon: flag, text: countryName)
                    }
                }
                .padding(.horizontal, 20)
            }

            if displayUser.hasE2EE {
                e2eeBadge
                    .padding(.horizontal, 20)
            }

            voiceCard
                .padding(.horizontal, 20)

            if !isCurrentUser {
                actionButtons
                    .padding(.horizontal, 20)
                    .padding(.top, 4)
            }

            compactStatsBand
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
            .padding(14)
            .background(theme.surfaceGradient(tint: resolvedAccent))
            .glassCard(cornerRadius: 16)
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
        VStack(spacing: 10) {
            if let createdAt = displayUser.createdAt {
                statCard(
                    icon: "calendar",
                    label: String(localized: "profile.stats.memberSince", defaultValue: "Membre depuis", bundle: .module),
                    value: formatRegistrationDate(createdAt)
                )
                .padding(.horizontal, 20)
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
                .padding(.horizontal, 20)
            } else if effectiveIsLoadingStats {
                HStack(spacing: 8) {
                    ForEach(0..<4, id: \.self) { _ in
                        RoundedRectangle(cornerRadius: 12)
                            .fill(theme.surface(tint: resolvedAccent, intensity: 0.1))
                            .frame(height: 56)
                            .shimmer()
                    }
                }
                .padding(.horizontal, 20)
            } else {
                Color.clear
                    .frame(height: 1)
                    .onAppear {
                        Task { await loadStatsIfNeeded() }
                    }
            }
        }
        .padding(.top, 4)
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
        .glassCard(cornerRadius: 12)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(value) \(label)")
    }

    // MARK: - Stat card (member-since)

    func statCard(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(Color(hex: resolvedAccent))
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textMuted)

                Text(value)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
            }

            Spacer()
        }
        .padding(14)
        .background(theme.surfaceGradient(tint: resolvedAccent))
        .glassCard(cornerRadius: 12)
    }
}
