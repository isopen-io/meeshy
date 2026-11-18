import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La jauge, les règles, les chiffres et les parts d'un lien de partage (planche `Lien-Partage`, #18871)

extension ShareLinkDetailView {

    var stats: ShareLinkArrivalStats? {
        guard case .loaded(let stats) = viewModel.stats else { return nil }
        return stats
    }

    // MARK: - Les entrées (K34 + K41 + K42)

    var entriesMeter: some View {
        let quota = ShareLinkEntryQuota(link: link)
        let expiry = ShareLinkExpiry.resolve(expiresAt: link.expiresAt, now: Date(), calendar: .current)
        return VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ShareLinkDetailCopy.entries, form: .overline, size: .sheet)
            HStack(alignment: .lastTextBaseline, spacing: MeeshySpacing.md) {
                MeeshyFigure(value: quota.used.formatted(), unit: ShareLinkDetailCopy.entriesUnit(limit: quota.limit),
                             size: .hero, emptyLabel: TrackingDetailCopy.noData)
                Spacer(minLength: MeeshySpacing.sm)
                expiryBadge(expiry)
            }
            if let fraction = quota.fraction, let limit = quota.limit {
                MeeshyMeter(value: fraction, label: ShareLinkDetailCopy.entries,
                            spokenValue: ShareLinkDetailCopy.entriesSpoken(quota.used, limit),
                            kind: .accent, fullKind: .warn, tint: MeeshyColors.brandPrimary, size: .s12,
                            startCaption: ShareLinkDetailCopy.quotaShare(fraction),
                            endCaption: quota.isFull ? ShareLinkDetailCopy.quotaFull
                                                     : ShareLinkDetailCopy.placesLeft(quota.remaining ?? 0))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("shareLink.detail.entries")
    }

    @ViewBuilder
    private func expiryBadge(_ expiry: ShareLinkExpiry) -> some View {
        switch expiry {
        case .never:
            EmptyView()
        case .expired:
            MeeshyBadge(.label(ShareLinkDetailCopy.linkExpired), leading: .systemImage("clock.badge.xmark"),
                        surface: .tonal, kind: .err, size: .s28)
        case .today, .inDays:
            MeeshyBadge(.label(ShareLinkDetailCopy.expiresIn(expiry)), leading: .systemImage("timer"),
                        surface: .outline, kind: expiry.isSoon ? .warn : .neutral, size: .s28)
        }
    }

    // MARK: - Qui peut entrer (K41)

    var entryRules: some View {
        let rules = ShareLinkEntryRule.rules(for: link.settings)
        return VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: ShareLinkDetailCopy.whoCanEnter, size: .sheet)
            FlowLayout(itemSpacing: MeeshySpacing.sm, lineSpacing: MeeshySpacing.sm) {
                ForEach(rules, id: \.self) { rule in
                    MeeshyBadge(.label(ruleTitle(rule)), leading: .systemImage(Self.ruleGlyph(rule)),
                                surface: .outline, kind: .neutral, size: .s28, lineLimit: nil)
                }
            }
            .accessibilityElement(children: .combine)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("shareLink.detail.rules")
    }

    private func ruleTitle(_ rule: ShareLinkEntryRule) -> String {
        switch rule {
        case .guestsWithoutAccount: return ShareLinkDetailCopy.guestsWithoutAccount
        case .accountRequired: return ShareLinkDetailCopy.requireAccount
        case .askedFields: return ShareLinkDetailCopy.askedRule(ShareLinkDetailCopy.askedFields(link.settings))
        case .historyVisible: return ShareLinkDetailCopy.historyVisible
        case .guestMessages: return InviteLandingCopy.rightMessages
        case .guestImages: return InviteLandingCopy.rightImages
        case .guestFiles: return InviteLandingCopy.rightFiles
        case .concurrentLimit(let count): return ShareLinkDetailCopy.concurrentRule(count)
        case .allLanguages: return ShareLinkDetailCopy.allLanguages
        case .languages(let codes): return ShareLinkDetailCopy.languages(codes)
        }
    }

    static func ruleGlyph(_ rule: ShareLinkEntryRule) -> String {
        switch rule {
        case .guestsWithoutAccount: return "person"
        case .accountRequired: return "checkmark.seal"
        case .askedFields: return "at"
        case .historyVisible: return "clock.arrow.circlepath"
        case .guestMessages: return "text.bubble"
        case .guestImages: return "photo"
        case .guestFiles: return "doc"
        case .concurrentLimit: return "person.2"
        case .allLanguages, .languages: return "globe"
        }
    }

    // MARK: - Les chiffres (K34)

    var figuresBand: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            MeeshyFigureBand(items: [
                MeeshyFigureItem(value: stats?.visits.formatted(), unit: ShareLinkDetailCopy.visits),
                MeeshyFigureItem(value: stats?.arrivals.formatted(), unit: ShareLinkDetailCopy.arrivals),
                MeeshyFigureItem(value: stats?.anonymousArrivals.formatted(), unit: ShareLinkDetailCopy.withoutAccount)
            ], isLoading: viewModel.stats == .loading, emptyLabel: TrackingDetailCopy.noData)
            if viewModel.stats == .unavailable {
                MeeshyNote(ShareLinkDetailCopy.statsUnavailable, lead: .systemImage("chart.bar.xaxis"),
                           tint: MeeshyColors.brandPrimary)
            }
        }
        .accessibilityIdentifier("shareLink.detail.figures")
    }

    // MARK: - Arrivées (K39 dans K43)

    @ViewBuilder
    var arrivalsSection: some View {
        if let stats {
            let recent = Array(stats.recentArrivals.prefix(Self.recentLimit))
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: ShareLinkDetailCopy.arrivals, count: stats.arrivals, size: .sheet,
                                    lead: { EmptyView() }, accessory: { seeAll(stats) })
                if recent.isEmpty {
                    MeeshyStateBlock(kind: .empty, title: ShareLinkDetailCopy.noArrivals, art: .none, size: .compact)
                } else {
                    MeeshyGroupCard(layout: .group) {
                        MeeshyGroupCardRows(recent) { arrival in arrivalRow(arrival) }
                    }
                }
            }
            .accessibilityIdentifier("shareLink.detail.arrivals")
        } else if viewModel.stats == .loading {
            MeeshySkeleton(shape: .card(aspect: 2.4, radius: Double(MeeshyRadius.lg)))
        }
    }

    /// Combien d'arrivées la fiche montre ; au-delà, « Tout voir » ouvre la liste complète (#7813).
    static let recentLimit = 6

    /// « Tout voir » n'apparaît que si la liste complète montre plus que la fiche.
    static func showsSeeAll(_ stats: ShareLinkArrivalStats) -> Bool {
        stats.arrivals > min(stats.recentArrivals.count, recentLimit)
    }

    @ViewBuilder
    private func seeAll(_ stats: ShareLinkArrivalStats) -> some View {
        if Self.showsSeeAll(stats) {
            NavigationLink {
                ShareLinkArrivalsListView(linkId: link.linkId, totalCount: stats.arrivals,
                                          seed: stats.recentArrivals.map(ShareLinkArrivalEntry.init))
            } label: {
                Text(ShareLinkDetailCopy.seeAll)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .bold))
                    .foregroundStyle(MeeshyColors.brandPrimary)
                    .frame(minHeight: MeeshyControlSize.tapTarget)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(ShareLinkDetailCopy.seeAllArrivals(stats.arrivals))
        }
    }

    /// Une arrivée ; « Retirer » vit dans le menu contextuel et les actions du lecteur d'écran, et n'est offert que
    /// si la fiche connaît la conversation que le lien ouvre.
    private func arrivalRow(_ arrival: ShareLinkArrivalStats.Arrival) -> some View {
        let canRemove = viewModel.canRemoveArrivals
        return ShareLinkArrivalRow(entry: ShareLinkArrivalEntry(arrival), avatarURL: arrival.avatar, isDark: isDark)
            .contextMenu {
                if canRemove {
                    Button(role: .destructive) { arrivalToRemove = arrival } label: {
                        Label(ShareLinkDetailCopy.removeArrival, systemImage: "person.badge.minus")
                    }
                }
            }
            .accessibilityActions {
                if canRemove {
                    Button(ShareLinkDetailCopy.removeArrival) { arrivalToRemove = arrival }
                }
            }
    }

    // MARK: - Arrivées par pays (K34)

    @ViewBuilder
    var countriesSection: some View {
        if let stats, !stats.arrivalsByCountry.isEmpty {
            let shares = ShareLinkCountryShare.top(stats.arrivalsByCountry)
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: ShareLinkDetailCopy.byCountry,
                                    count: ShareLinkCountryShare.countryCount(stats.arrivalsByCountry), size: .sheet)
                MeeshyGroupCard {
                    VStack(spacing: MeeshySpacing.md) {
                        ForEach(shares, id: \.country) { share in
                            MeeshyShareBar(title: CountryFlag.name(for: share.country) ?? share.country,
                                           value: share.count.formatted(), share: share.share,
                                           tint: MeeshyColors.brandPrimary) {
                                MeeshyBadge(.code(share.country), surface: .outline, size: .s22)
                            }
                        }
                    }
                }
            }
            .accessibilityIdentifier("shareLink.detail.countries")
        }
    }

    // MARK: - Langues des arrivants (K34)

    @ViewBuilder
    var languagesSection: some View {
        if let stats, !stats.languageShares.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: ShareLinkDetailCopy.arrivalLanguages, size: .sheet)
                MeeshyGroupCard {
                    LanguageShareBar(shares: stats.languageShares, isDark: isDark)
                }
            }
            .accessibilityIdentifier("shareLink.detail.languages")
        }
    }
}
