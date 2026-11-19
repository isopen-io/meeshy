import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les chiffres, le graphique et les parts d'un lien de suivi (planche `Lien-Detail`, #18871)

extension TrackingLinkDetailView {

    static let shareTints: [Color] = [MeeshyColors.trackingAccent, MeeshyColors.brandPrimary,
                                      MeeshyColors.indigo300, MeeshyColors.neutral500]

    // MARK: - Les chiffres (K34)

    var figuresBand: some View {
        MeeshyFigureBand(items: [
            MeeshyFigureItem(value: current.totalClicks.formatted(), unit: TrackingDetailCopy.clicksUnit),
            MeeshyFigureItem(value: current.uniqueClicks.formatted(), unit: TrackingDetailCopy.uniqueUnit),
            MeeshyFigureItem(value: viewModel.phase == .loaded ? viewModel.insights.countryCount.formatted() : nil,
                             unit: TrackingDetailCopy.countriesUnit)
        ], emptyLabel: TrackingDetailCopy.noData)
        .accessibilityIdentifier("tracking.detail.figures")
    }

    // MARK: - Les clics (K50)

    var clicksChart: some View {
        let days = viewModel.insights.days(period: period, now: Date(), calendar: .current)
        let total = days.map(\.count).reduce(0, +)
        return VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: TrackingDetailCopy.chartTitle, size: .sheet)
            MeeshySegmented(TrackingDetailCopy.periodLabel, selection: $period,
                            options: TrackingInsightsPeriod.allCases.map { $0.option }, tone: .theme)
            MeeshyChart(kind: .bars, points: days.map { Self.point($0) }, summary: TrackingDetailCopy.chartSummary(total),
                        tint: MeeshyColors.trackingAccent, size: .regular, markers: [.peak],
                        axisLabels: Self.axisLabels(days), selection: $selectedDay,
                        callout: { id in Self.callout(id, in: days) }, isLoading: viewModel.isFirstLoad,
                        emptyText: TrackingDetailCopy.chartEmpty)
        }
        .accessibilityIdentifier("tracking.detail.chart")
    }

    static func dayID(_ day: Date) -> String {
        String(Int(day.timeIntervalSince1970))
    }

    static func point(_ bucket: TrackingDayBucket) -> MeeshyChartPoint {
        let label = bucket.day.formatted(.dateTime.day().month(.abbreviated))
        return MeeshyChartPoint(id: dayID(bucket.day), value: Double(bucket.count), label: label,
                                spoken: TrackingDetailCopy.dayClicks(label, bucket.count))
    }

    static func axisLabels(_ days: [TrackingDayBucket]) -> [String] {
        guard days.count > 1 else { return days.map { $0.day.formatted(.dateTime.day().month(.abbreviated)) } }
        let steps = min(MeeshyChartRecipe.maxAxisLabels - 1, days.count - 1)
        return (0...steps).map { step in
            let index = (days.count - 1) * step / steps
            return days[index].day.formatted(.dateTime.day().month(.abbreviated))
        }
    }

    static func callout(_ id: String, in days: [TrackingDayBucket]) -> MeeshyChartCallout? {
        days.first { dayID($0.day) == id }.map { bucket in
            MeeshyChartCallout(title: bucket.day.formatted(.dateTime.day().month(.abbreviated)),
                               value: TrackingDetailCopy.clicksCount(bucket.count))
        }
    }

    // MARK: - D'où ils viennent (K34)

    var originsSection: some View {
        let countries = viewModel.insights.countries()
        return VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: TrackingDetailCopy.originsTitle, count: viewModel.insights.countryCount, size: .sheet)
            if viewModel.isFirstLoad {
                loadingBlock
            } else if countries.isEmpty {
                emptyBlock
            } else {
                ForEach(countries, id: \.key) { share in
                    MeeshyShareBar(title: Self.countryName(share.key), value: Self.percent(share.percent),
                                   share: Double(share.percent) / 100, tint: MeeshyColors.trackingAccent) {
                        Text(verbatim: Self.flag(share.key)).font(.title3)
                    }
                }
            }
        }
        .accessibilityIdentifier("tracking.detail.origins")
    }

    // MARK: - Avec quoi (K50 + K34)

    var meansSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.lg) {
            MeeshySectionHeader(title: TrackingDetailCopy.meansTitle, size: .sheet)
            breakdown(title: TrackingDetailCopy.devicesTitle, shares: viewModel.insights.devices,
                      name: { Self.deviceName($0) }, glyph: { TrackingDeviceFamily(rawValue: $0)?.systemImage ?? "globe" })
            breakdown(title: TrackingDetailCopy.sourcesTitle, shares: viewModel.insights.sources,
                      name: { Self.sourceName($0) }, glyph: { _ in "link" })
        }
        .accessibilityIdentifier("tracking.detail.means")
    }

    private func breakdown(title: String, shares: [TrackingShare], name: @escaping (String) -> String,
                           glyph: @escaping (String) -> String) -> some View {
        let shown = Array(shares.prefix(TrackingLinkInsights.shownShares))
        return VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            MeeshySectionHeader(title: title, form: .overline, size: .sheet)
            if viewModel.isFirstLoad {
                loadingBlock
            } else if shown.isEmpty {
                emptyBlock
            } else {
                MeeshyChart(kind: .donut, points: Self.donutPoints(shown, name: name),
                            summary: shown.map { "\(name($0.key)) \(Self.percent($0.percent))" }.joined(separator: ", "),
                            tint: MeeshyColors.trackingAccent, size: .compact, markers: []) {
                    Text(verbatim: Self.percent(shown[0].percent)).font(.headline.weight(.heavy))
                }
                ForEach(Array(shown.enumerated()), id: \.element.key) { index, share in
                    MeeshyShareBar(title: name(share.key), value: Self.percent(share.percent),
                                   share: Double(share.percent) / 100, tint: Self.shareTints[index % Self.shareTints.count]) {
                        Image(systemName: glyph(share.key))
                    }
                }
            }
        }
    }

    static func donutPoints(_ shares: [TrackingShare], name: (String) -> String) -> [MeeshyChartPoint] {
        shares.enumerated().map { index, share in
            MeeshyChartPoint(id: share.key, value: Double(share.count), label: name(share.key),
                             spoken: "\(name(share.key)), \(percent(share.percent))",
                             tint: shareTints[index % shareTints.count])
        }
    }

    // MARK: - Derniers clics (K06 dans K43)

    var recentClicksSection: some View {
        let recent = Array(viewModel.clicks.prefix(20))
        return VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: TrackingDetailCopy.recentTitle, size: .sheet)
            if viewModel.isFirstLoad {
                MeeshySkeleton(shape: .card(aspect: 2.4, radius: Double(MeeshyRadius.lg)))
            } else if recent.isEmpty {
                emptyBlock
            } else {
                MeeshyGroupCard(layout: .group) {
                    MeeshyGroupCardRows(recent, id: \.id) { click in clickRow(click) }
                }
            }
        }
        .accessibilityIdentifier("tracking.detail.recent")
    }

    private func clickRow(_ click: TrackingLinkClick) -> some View {
        let place = [click.city, click.country.map { Self.countryName($0) }].compactMap { $0 }.joined(separator: ", ")
        let means = [click.os ?? click.browser, click.socialSource].compactMap { $0 }.joined(separator: " · ")
        return MeeshyToggleRowFace(
            content: MeeshyToggleRowContent(title: place.isEmpty ? TrackingDetailCopy.unknown : place,
                                            subtitle: means.isEmpty ? nil : means,
                                            accessory: .value(click.clickedAt.formatted(.relative(presentation: .named)))),
            leading: { Text(verbatim: click.country.map { Self.flag($0) } ?? "🌐").font(.title3) },
            titleAccessory: { MeeshyToggleRowNoSlot() },
            trailing: { MeeshyToggleRowNoSlot() }
        )
        .accessibilityElement(children: .combine)
        .accessibilityValue(click.redirectStatus == "confirmed" ? TrackingDetailCopy.redirectConfirmed
                                                                : TrackingDetailCopy.redirectFailed)
    }

    // MARK: - Configuration UTM

    var utmInfoSection: some View {
        let optionalRows: [TrackingUTMRow?] = [
            current.campaign.map { TrackingUTMRow(label: TrackingDetailCopy.campaignField, value: $0) },
            current.source.map { TrackingUTMRow(label: TrackingDetailCopy.sourceField, value: $0) },
            current.medium.map { TrackingUTMRow(label: TrackingDetailCopy.mediumField, value: $0) },
            TrackingUTMRow(label: TrackingDetailCopy.destination, value: current.originalUrl),
            TrackingUTMRow(label: TrackingDetailCopy.createdAt, value: current.createdAt.formatted(date: .abbreviated, time: .shortened)),
            current.expiresAt.map { TrackingUTMRow(label: ShareLinkDetailCopy.expiresOn, value: $0.formatted(date: .abbreviated, time: .shortened)) }
        ]
        let rows = optionalRows.compactMap { $0 }
        return VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            MeeshySectionHeader(title: TrackingDetailCopy.utmTitle, form: .overline, size: .sheet)
            MeeshyGroupCard(layout: .group) {
                MeeshyGroupCardRows(rows, id: \.label) { row in
                    MeeshyToggleRowFace(content: MeeshyToggleRowContent(title: row.label, accessory: .value(row.value)))
                        .accessibilityElement(children: .combine)
                }
            }
        }
    }

    // MARK: - Aides

    var emptyBlock: some View {
        MeeshyStateBlock(kind: .empty, title: TrackingDetailCopy.noData, art: .none, size: .compact)
    }

    /// Avant la première lecture, une section tient sa place : jamais « Aucune donnée » (loi 8).
    var loadingBlock: some View {
        MeeshySkeleton(shape: .card(aspect: 3.2, radius: Double(MeeshyRadius.lg)))
    }

    /// La lecture des clics a échoué et rien n'est montré : la fiche le dit, et « Réessayer » relit.
    var clicksFailedBlock: some View {
        MeeshyStateBlock(kind: .error, title: TrackingDetailCopy.clicksFailed,
                         primary: MeeshyStateBlockAction(title: ShareLinkDetailCopy.retry, systemImage: "arrow.clockwise",
                                                         perform: { Task { await viewModel.load() } }),
                         art: .none, size: .compact, tint: MeeshyColors.trackingAccent)
            .accessibilityIdentifier("tracking.detail.failed")
    }

    static func percent(_ value: Int) -> String {
        (Double(value) / 100).formatted(.percent.precision(.fractionLength(0)))
    }

    static func countryName(_ code: String) -> String {
        Locale.current.localizedString(forRegionCode: code) ?? code
    }

    static func flag(_ countryCode: String) -> String {
        let base: UInt32 = 127397
        return countryCode.uppercased().unicodeScalars
            .compactMap { Unicode.Scalar(base + $0.value) }.map { String($0) }.joined()
    }

    static func deviceName(_ key: String) -> String {
        switch TrackingDeviceFamily(rawValue: key) ?? .other {
        case .phone: return TrackingDetailCopy.phone
        case .desktop: return TrackingDetailCopy.desktop
        case .tablet: return TrackingDetailCopy.tablet
        case .other: return TrackingDetailCopy.otherDevice
        }
    }

    static func sourceName(_ key: String) -> String {
        key == TrackingLinkInsights.directSource ? TrackingDetailCopy.direct : key
    }
}

/// Une ligne de la configuration UTM : son nom et sa valeur.
struct TrackingUTMRow {
    let label: String
    let value: String
}

extension TrackingInsightsPeriod {
    var option: MeeshySegmentedOption<TrackingInsightsPeriod> {
        switch self {
        case .week:
            return MeeshySegmentedOption(id: self, title: TrackingDetailCopy.week, accessibilityLabel: TrackingDetailCopy.weekSpoken)
        case .month:
            return MeeshySegmentedOption(id: self, title: TrackingDetailCopy.month, accessibilityLabel: TrackingDetailCopy.monthSpoken)
        case .all:
            return MeeshySegmentedOption(id: self, title: TrackingDetailCopy.all, accessibilityLabel: TrackingDetailCopy.allSpoken)
        }
    }
}
