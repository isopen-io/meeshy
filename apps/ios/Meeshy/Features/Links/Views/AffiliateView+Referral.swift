import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La page Parrainage, faite du kit (planche `Parrainage`, #19507)

extension AffiliateView {

    // MARK: - Ton code (K30 + K31 + K32)

    @ViewBuilder
    func heroSection(_ hero: ReferralPage.Hero?) -> some View {
        if let hero {
            MeeshyTicket(
                title: ReferralCopy.yourCode,
                code: hero.displayLink,
                tint: accent,
                systemImage: "gift.fill",
                figure: hero.code,
                size: .hero,
                isFlipped: false,
                isSelected: false,
                isDragging: false,
                label: ReferralCopy.heroLabel(code: hero.code, link: hero.displayLink),
                onPress: nil,
                stub: { heroActions(hero) },
                leading: { EmptyView() },
                trailing: {
                    MeeshyCodeCard(payload: hero.url?.absoluteString, label: TrackingDetailCopy.enlargeQR, tint: accent,
                                   style: .plain, size: .mini, tilt: .none, boostsBrightness: false,
                                   onPress: { qrShareImage = LinkQRCode.shareImage(for: hero.link) })
                },
                status: { EmptyView() },
                back: { EmptyView() }
            )
            .accessibilityIdentifier("referral.hero")
        } else if !viewModel.isLoading {
            MeeshyNote(ReferralCopy.noCode, lead: .systemImage("gift"), tint: accent)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("referral.hero.empty")
        }
    }

    private func heroActions(_ hero: ReferralPage.Hero) -> some View {
        MeeshyActionGrid(columns: .fixed(4)) {
            MeeshyLabeledAction(title: TrackingDetailCopy.copy, systemImage: "doc.on.doc", tint: accent,
                                hint: hero.displayLink, action: {
                LinksClipboard.copy(hero.link, confirmation: .inline, message: ReferralCopy.linkCopied)
            })
            MeeshyLabeledAction(title: TrackingDetailCopy.qr, systemImage: "qrcode", tint: accent,
                                action: { qrShareImage = LinkQRCode.shareImage(for: hero.link) })
                .disabled(hero.url == nil)
            MeeshyLabeledAction(title: TrackingDetailCopy.share, systemImage: "square.and.arrow.up", tint: accent,
                                action: { sharedLink = hero.url.map { ShareableLink(url: $0) } })
                .disabled(hero.url == nil)
            MeeshyLabeledAction(title: ReferralCopy.byEmail, systemImage: "envelope", tint: accent,
                                action: { showsInviteSheet = true })
        }
    }

    // MARK: - Les chiffres (K34)

    func figuresBand(_ figures: [ReferralPage.Figure]) -> some View {
        MeeshyFigureBand(items: figures.map { figure in
            MeeshyFigureItem(value: figure.value.formatted(), unit: Self.unit(figure.kind))
        }, size: .compact, emptyLabel: ProfileActivityBand.emptyLabel)
        .accessibilityIdentifier("referral.figures")
    }

    static func unit(_ kind: ReferralPage.FigureKind) -> String {
        switch kind {
        case .referrals: return ReferralCopy.referralsUnit
        case .visits: return ReferralCopy.visitsUnit
        case .thisMonth: return ReferralCopy.thisMonthUnit
        }
    }

    // MARK: - Du lien au filleul (K50)

    @ViewBuilder
    func funnelSection(_ funnel: ReferralPage.Funnel?) -> some View {
        if let funnel {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: ReferralCopy.funnelTitle, size: .sheet)
                MeeshyChart(kind: .funnel, points: Self.funnelPoints(funnel),
                            summary: ReferralCopy.funnelSummary(visits: funnel.visits, registrations: funnel.registrations),
                            tint: accent, size: .regular, markers: [])
            }
            .accessibilityIdentifier("referral.funnel")
        }
    }

    /// Trois étages quand l'activité est mesurée, deux sinon ; un taux qui ne veut rien dire n'a pas de passage.
    static func funnelPoints(_ funnel: ReferralPage.Funnel) -> [MeeshyChartPoint] {
        let visits = ReferralCopy.visitsStage(funnel.visits)
        let registrations = ReferralCopy.registrationsStage(funnel.registrations)
        let signup = funnel.signupRate.map { ReferralCopy.signupHop($0) }
        let retention = funnel.retentionRate.map { ReferralCopy.retentionHop($0) }
        let head = [
            MeeshyChartPoint(id: "visits", value: Double(funnel.visits), label: visits,
                             spoken: [visits, signup].compactMap { $0 }.joined(separator: ", "), hop: signup),
            MeeshyChartPoint(id: "registrations", value: Double(funnel.registrations), label: registrations,
                             spoken: [registrations, retention].compactMap { $0 }.joined(separator: ", "), hop: retention)
        ]
        guard let active = funnel.active else { return head }
        let actives = ReferralCopy.activeStage(active)
        return head + [MeeshyChartPoint(id: "active", value: Double(active), label: actives, spoken: actives)]
    }

    // MARK: - Ce que ça te rapporte (K39 + K45) et le prochain palier (K42)

    @ViewBuilder
    func rewardSection(_ reward: ReferralPage.Reward?) -> some View {
        if let reward, let title = Self.rewardTitle(reward) {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: ReferralCopy.rewardTitle, size: .sheet)
                MeeshyGroupCard(layout: .group) {
                    MeeshyPersonRow(title: title, subtitle: Self.rewardSubtitle(reward), showsDivider: false) {
                        MeeshyMedallion(systemImage: "sparkles", kind: .warn, size: .s44)
                    }
                }
            }
            .accessibilityIdentifier("referral.reward")
        }
    }

    static func rewardTitle(_ reward: ReferralPage.Reward) -> String? {
        reward.perActiveReferral.map { ReferralCopy.perActive($0) } ?? reward.earned.map { ReferralCopy.earned($0) }
    }

    static func rewardSubtitle(_ reward: ReferralPage.Reward) -> String? {
        guard reward.perActiveReferral != nil else { return nil }
        return reward.earned.map { ReferralCopy.earned($0) }
    }

    @ViewBuilder
    func tierSection(_ tier: ReferralPage.Tier?) -> some View {
        if let tier {
            MeeshyGroupCard {
                MeeshyMeter(value: tier.fraction, label: ReferralCopy.nextTier,
                            spokenValue: ReferralCopy.tierSpoken(tier.reached, tier.target),
                            kind: .accent, fullKind: .ok, tint: accent, size: .s8,
                            title: ReferralCopy.nextTier, valueText: ReferralCopy.tierValue(tier.reached, tier.target),
                            endCaption: Self.tierCaption(tier))
            }
            .accessibilityIdentifier("referral.tier")
        }
    }

    static func tierCaption(_ tier: ReferralPage.Tier) -> String {
        let count = ReferralCopy.tierCaption(tier.target)
        guard let reward = tier.reward, !reward.isEmpty else { return count }
        return "\(count) : \(reward)"
    }

    // MARK: - Tes filleuls (K39 + K41)

    func referralsSection(_ referrals: [ReferralPage.Referral]) -> some View {
        let shown = showsAllReferrals ? referrals : Array(referrals.prefix(ReferralPage.shownReferrals))
        return VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ReferralCopy.referralsTitle, count: referrals.isEmpty ? nil : referrals.count,
                                size: .sheet, lead: { EmptyView() },
                                accessory: { seeAllButton(total: referrals.count) })
            if referrals.isEmpty {
                MeeshyStateBlock(kind: .empty, title: ReferralCopy.noReferrals, art: .none, size: .compact)
            } else {
                MeeshyGroupCard(layout: .group) {
                    MeeshyGroupCardRows(shown) { referral in referralRow(referral) }
                }
            }
        }
        .accessibilityIdentifier("referral.referrals")
    }

    @ViewBuilder
    private func seeAllButton(total: Int) -> some View {
        if total > ReferralPage.shownReferrals {
            MeeshyButton(showsAllReferrals ? ReferralCopy.seeLess : ReferralCopy.seeAll, kind: .text, size: .s36,
                         tint: accent, action: { showsAllReferrals.toggle() })
        }
    }

    private func referralRow(_ referral: ReferralPage.Referral) -> some View {
        MeeshyPersonRow(title: referral.name, subtitle: Self.joinedLine(referral.joinedAt), showsDivider: false) {
            MeeshyAvatar(name: referral.name, context: .custom(36), avatarURL: referral.avatar, enablePulse: false,
                         isDark: isDark)
        } trailing: {
            HStack(spacing: MeeshySpacing.sm) {
                MeeshyBadge(.label(Self.statusTitle(referral.status)), leading: .dot, surface: .tonal,
                            kind: Self.statusKind(referral.status), size: .s22)
                if referral.canSayHello {
                    MeeshyButton(ReferralCopy.sayHello, systemImage: "hand.wave", kind: .tinted, size: .s36, tint: accent,
                                 action: { sayHello(to: referral) })
                        .accessibilityLabel(ReferralCopy.sayHelloTo(referral.name))
                }
            }
        }
    }

    static func joinedLine(_ date: Date?) -> String? {
        date.map { ReferralCopy.joined($0.formatted(.relative(presentation: .named, unitsStyle: .abbreviated))) }
    }

    static func statusTitle(_ status: ReferralPage.ReferralStatus) -> String {
        switch status {
        case .active: return ReferralCopy.statusActive
        case .inactive: return ReferralCopy.statusInactive
        case .joined: return ReferralCopy.statusJoined
        case .pending: return ReferralCopy.statusPending
        case .expired: return ReferralCopy.statusExpired
        }
    }

    static func statusKind(_ status: ReferralPage.ReferralStatus) -> MeeshyBadgeKind {
        switch status {
        case .active, .joined: return .ok
        case .pending: return .warn
        case .inactive, .expired: return .neutral
        }
    }

    private func sayHello(to referral: ReferralPage.Referral) {
        HapticFeedback.light()
        Task {
            guard let conversation = await viewModel.sayHello(to: referral) else { return }
            HapticFeedback.success()
            router.navigateToConversation(conversation)
        }
    }

    // MARK: - Invitations envoyées (K39 + K45 + K40)

    @ViewBuilder
    func invitationsSection(_ invitations: [SentEmailInvitation]) -> some View {
        if !invitations.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: ReferralCopy.invitationsTitle, count: invitations.count, size: .sheet)
                MeeshyGroupCard(layout: .group) {
                    MeeshyGroupCardRows(invitations) { invitation in invitationRow(invitation) }
                }
            }
            .accessibilityIdentifier("referral.invitations")
        }
    }

    private func invitationRow(_ invitation: SentEmailInvitation) -> some View {
        MeeshyPersonRow(title: invitation.maskedEmail, subtitle: Self.invitationLine(invitation), showsDivider: false) {
            MeeshyMedallion(systemImage: invitation.phase == .sent ? "envelope" : "envelope.open", kind: .neutral,
                            size: .s36)
        } trailing: {
            if invitation.canResend == true, invitation.phase != .joined {
                MeeshyButton(ReferralCopy.resend, kind: .outline, size: .s36, tint: accent,
                             action: { resend(invitation) })
            }
        }
    }

    static func invitationLine(_ invitation: SentEmailInvitation) -> String {
        let state: String
        switch invitation.phase {
        case .sent: state = ReferralCopy.notOpened
        case .opened: state = ReferralCopy.openedNotJoined
        case .joined: state = ReferralCopy.joinedMeeshy
        }
        guard let sentAt = invitation.sentAt.flatMap({ WireDate.date(from: $0) }) else { return state }
        return ReferralCopy.sentLine(sentAt.formatted(.relative(presentation: .named, unitsStyle: .abbreviated)), state)
    }

    private func resend(_ invitation: SentEmailInvitation) {
        HapticFeedback.light()
        Task {
            guard await viewModel.resend(invitation) else {
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(ReferralCopy.resendFailed)
                return
            }
            HapticFeedback.success()
            FeedbackToastManager.shared.showSuccess(ReferralCopy.resent)
        }
    }

    // MARK: - Inviter quelqu'un (K40)

    var inviteButton: some View {
        MeeshyButton(ReferralCopy.invite, systemImage: "person.badge.plus", kind: .primary, width: .fill, tint: accent,
                     action: { showsInviteSheet = true })
            .accessibilityIdentifier("referral.invite")
    }
}
