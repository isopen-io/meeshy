import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les chiffres, les entrées, les règles et les arrivées d'un lien de communauté (planche `Lien-Communaute`, #18871)

extension CommunityLinkDetailView {

    // MARK: - Les chiffres (K34)

    /// « 342 membres · 58 entrées par ce lien · 12 cette semaine » quand la passerelle sert les entrées du lien
    /// (#19290) ; sans elles, la bande garde la semaine et les trente jours lus sur les arrivées.
    var figuresBand: some View {
        let entries = viewModel.loadedEntries
        let now = Date()
        let members = MeeshyFigureItem(value: viewModel.memberCount.formatted(),
                                       unit: CommunityLinkDetailCopy.membersUnit)
        let week = MeeshyFigureItem(
            value: entries.map { $0.count(lastDays: 7, now: now, calendar: .current).formatted() },
            unit: CommunityLinkDetailCopy.weekUnit)
        let third: MeeshyFigureItem = viewModel.linkEntryCount.map {
            MeeshyFigureItem(value: $0.formatted(), unit: CommunityLinkDetailCopy.linkEntriesUnit)
        } ?? MeeshyFigureItem(value: entries.map {
            $0.count(lastDays: CommunityLinkEntries.windowDays, now: now, calendar: .current).formatted()
        }, unit: CommunityLinkDetailCopy.monthUnit)
        let items = viewModel.linkEntryCount == nil ? [members, week, third] : [members, third, week]
        return MeeshyFigureBand(items: items, emptyLabel: TrackingDetailCopy.noData)
            .accessibilityIdentifier("communityLink.detail.figures")
    }

    // MARK: - Les entrées sur trente jours (K50)

    var entriesChart: some View {
        let now = Date()
        let entries = viewModel.loadedEntries ?? CommunityLinkEntries(entries: [], excludingUserId: nil)
        let days = entries.days(now: now, calendar: .current)
        let total = days.map(\.count).reduce(0, +)
        let average = entries.dailyAverage(now: now, calendar: .current)
            .formatted(.number.precision(.fractionLength(0...1)))
        return VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: CommunityLinkDetailCopy.chartTitle, size: .sheet,
                                lead: { EmptyView() },
                                accessory: {
                if viewModel.loadedEntries != nil {
                    Text(CommunityLinkDetailCopy.perDay(average))
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                        .foregroundStyle(.secondary)
                }
            })
            MeeshyChart(kind: .bars, points: days.map { Self.point($0) },
                        summary: CommunityLinkDetailCopy.chartSummary(total),
                        tint: Self.accent, size: .regular, markers: [.peak],
                        axisLabels: TrackingLinkDetailView.axisLabels(days), selection: $selectedDay,
                        callout: { id in Self.callout(id, in: days) }, isLoading: viewModel.entries == .loading,
                        emptyText: CommunityLinkDetailCopy.chartEmpty)
        }
        .accessibilityIdentifier("communityLink.detail.chart")
    }

    static func point(_ bucket: TrackingDayBucket) -> MeeshyChartPoint {
        let label = bucket.day.formatted(.dateTime.day().month(.abbreviated))
        return MeeshyChartPoint(id: TrackingLinkDetailView.dayID(bucket.day), value: Double(bucket.count), label: label,
                                spoken: CommunityLinkDetailCopy.dayEntries(label, bucket.count))
    }

    static func callout(_ id: String, in days: [TrackingDayBucket]) -> MeeshyChartCallout? {
        days.first { TrackingLinkDetailView.dayID($0.day) == id }.map { bucket in
            MeeshyChartCallout(title: bucket.day.formatted(.dateTime.day().month(.abbreviated)),
                               value: CommunityLinkDetailCopy.entriesCount(bucket.count))
        }
    }

    // MARK: - Règles d'entrée (K41)

    @ViewBuilder
    var entryRules: some View {
        if let isClosed = viewModel.isClosed {
            VStack(alignment: .leading, spacing: MeeshySpacing.md) {
                MeeshySectionHeader(title: CommunityLinkDetailCopy.rulesTitle, size: .sheet)
                FlowLayout(itemSpacing: MeeshySpacing.sm, lineSpacing: MeeshySpacing.sm) {
                    ForEach(CommunityEntryRule.rules(isPrivate: isClosed), id: \.self) { rule in
                        MeeshyBadge(.label(Self.ruleTitle(rule)), leading: .systemImage(Self.ruleGlyph(rule)),
                                    surface: .outline, kind: .neutral, size: .s28, lineLimit: nil)
                    }
                }
                .accessibilityElement(children: .combine)
                if isClosed {
                    Text(CommunityLinkDetailCopy.closedHint)
                        .font(MeeshyFont.relative(MeeshyFont.smallSize))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier("communityLink.detail.rules")
        }
    }

    static func ruleTitle(_ rule: CommunityEntryRule) -> String {
        switch rule {
        case .open: return CommunityLinkDetailCopy.ruleOpen
        case .invitationOnly: return CommunityLinkDetailCopy.ruleInvitation
        case .roleMember: return CommunityLinkDetailCopy.ruleRole
        case .everyCountry: return CommunityLinkDetailCopy.ruleCountries
        case .noExpiry: return CommunityLinkDetailCopy.ruleNoExpiry
        }
    }

    static func ruleGlyph(_ rule: CommunityEntryRule) -> String {
        switch rule {
        case .open: return "door.left.hand.open"
        case .invitationOnly: return "envelope"
        case .roleMember: return "person"
        case .everyCountry: return "flag"
        case .noExpiry: return "infinity"
        }
    }

    // MARK: - Entrées récentes (K39 dans K43)

    @ViewBuilder
    var recentSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: CommunityLinkDetailCopy.recentTitle, size: .sheet)
            switch viewModel.entries {
            case .loading:
                MeeshySkeleton(shape: .card(aspect: 2.4, radius: Double(MeeshyRadius.lg)))
            case .failed:
                MeeshyStateBlock(kind: .error, title: CommunityLinkDetailCopy.recentFailed,
                                 primary: MeeshyStateBlockAction(title: ShareLinkDetailCopy.retry,
                                                                 systemImage: "arrow.clockwise",
                                                                 perform: { Task { await viewModel.load() } }),
                                 art: .none, size: .compact, tint: Self.accent)
            case .loaded(let entries) where entries.recent.isEmpty:
                MeeshyStateBlock(kind: .empty, title: CommunityLinkDetailCopy.recentEmpty, art: .none, size: .compact)
            case .loaded(let entries):
                MeeshyGroupCard(layout: .group) {
                    MeeshyGroupCardRows(entries.recent, id: \.id) { entry in entryRow(entry) }
                }
            }
        }
        .accessibilityIdentifier("communityLink.detail.recent")
    }

    /// Une entrée faite dit quand ; une demande en attente le dit à la place (Accepter et Refuser attendent #19290).
    private func entryRow(_ entry: CommunityLinkEntry) -> some View {
        let status = entry.isPending
            ? CommunityLinkDetailCopy.pending
            : CommunityLinkDetailCopy.joined(entry.joinedAt.formatted(.relative(presentation: .named)))
        return MeeshyPersonRow(title: entry.name,
                               subtitle: status,
                               meta: entry.username.map { "@\($0)" },
                               showsDivider: false,
                               label: [entry.name, status].joined(separator: ", ")) {
            MeeshyAvatar(name: entry.name, context: .custom(36), avatarURL: entry.avatar, enablePulse: false,
                         isDark: isDark)
        }
    }
}
