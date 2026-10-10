import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Presentation

/// What the call detail sheets say about a call's link (#8698): a summary
/// (averages, peaks, reconnections, route, profiles) and the timeline of its
/// milestones. Samples feed the summary and never crowd the timeline.
struct CallNetworkJournalPresentation: Equatable {
    struct Row: Equatable, Identifiable {
        let id: String
        let title: String
        let value: String
    }

    struct Moment: Equatable, Identifiable {
        let id: Int
        let elapsed: String
        let text: String
        let detail: String?
        let isAlert: Bool
    }

    let summary: [Row]
    let timeline: [Moment]
    /// A call whose link was never observed (missed, declined) has nothing to
    /// say: its only event is its end, and the sheets then hide the section.
    let isEmpty: Bool

    init(journal: CallNetworkJournal, locale: Locale = .autoupdatingCurrent) {
        isEmpty = journal.events.allSatisfy { event in
            if case .ended = event.kind { return true }
            return false
        }
        summary = Self.summaryRows(journal.summary, locale: locale)
        timeline = journal.events.enumerated().compactMap { index, event in
            Self.moment(index: index, event: event, startedAt: journal.startedAt, locale: locale)
        }
    }

    static var title: String {
        String(localized: "calls.detail.network", defaultValue: "Qualité et réseau", bundle: .main)
    }

    static var timelineTitle: String {
        String(localized: "calls.network.timeline", defaultValue: "Chronologie", bundle: .main)
    }

    // MARK: - Summary

    private static func summaryRows(_ summary: CallNetworkSummary, locale: Locale) -> [Row] {
        let measured = summary.sampleCount > 0
        let loss = measured ? Row(
            id: "loss",
            title: CallQualityMetric.packetLoss.title,
            value: peak(
                CallQualityRows.formatted(summary.meanPacketLossPercent, as: .packetLoss, locale: locale),
                CallQualityRows.formatted(summary.peakPacketLossPercent, as: .packetLoss, locale: locale)
            )
        ) : nil
        let latency = measured ? Row(
            id: "latency",
            title: CallQualityMetric.latency.title,
            value: peak(
                CallQualityRows.formatted(summary.meanRoundTripTimeMs, as: .latency, locale: locale),
                CallQualityRows.formatted(summary.peakRoundTripTimeMs, as: .latency, locale: locale)
            )
        ) : nil
        let jitter = measured ? Row(
            id: "jitter",
            title: CallQualityMetric.jitter.title,
            value: CallQualityRows.formatted(summary.meanJitterMs, as: .jitter, locale: locale)
        ) : nil
        let reconnections = Row(
            id: "reconnections",
            title: String(localized: "calls.network.reconnections", defaultValue: "Reconnexions", bundle: .main),
            value: summary.reconnectionCount.formatted(.number.locale(locale))
        )
        let route = summary.relayed.map { relayed in
            Row(
                id: "route",
                title: CallQualityNetworkContext.routeTitle,
                value: CallQualityNetworkContext(profile: nil, relayed: relayed).routeLabel ?? ""
            )
        }
        let profiles = summary.profiles.isEmpty ? nil : Row(
            id: "profiles",
            title: CallQualityNetworkContext.profileTitle,
            value: summary.profiles.map(profileLabel).joined(separator: " → ")
        )
        let faults = summary.faultCount > 0 ? Row(
            id: "faults",
            title: String(localized: "calls.network.faults", defaultValue: "Incidents média", bundle: .main),
            value: summary.faultCount.formatted(.number.locale(locale))
        ) : nil
        return [loss, latency, jitter, reconnections, route, profiles, faults].compactMap { $0 }
    }

    private static func peak(_ mean: String, _ peak: String) -> String {
        String(localized: "calls.network.peak", defaultValue: "\(mean) (pic \(peak))", bundle: .main)
    }

    private static func profileLabel(_ name: String) -> String {
        CallDataProfile(rawValue: name)?.label ?? name
    }

    // MARK: - Timeline

    private static func moment(index: Int, event: CallNetworkEvent, startedAt: Date, locale: Locale) -> Moment? {
        guard let described = describe(event.kind) else { return nil }
        let elapsed = CallManager.formatDuration(max(0, event.at.timeIntervalSince(startedAt)), locale: locale)
        return Moment(id: index, elapsed: elapsed, text: described.text, detail: described.detail, isAlert: described.isAlert)
    }

    private static func describe(_ kind: CallNetworkEventKind) -> (text: String, detail: String?, isAlert: Bool)? {
        switch kind {
        case .sample:
            return nil
        case let .link(state):
            return linkText(state)
        case let .reconnecting(attempt):
            return (String(localized: "calls.network.event.reconnecting", defaultValue: "Reconnexion, tentative \(attempt)", bundle: .main), nil, true)
        case .reconnected:
            return (String(localized: "calls.network.event.reconnected", defaultValue: "Reconnecté", bundle: .main), nil, false)
        case let .route(relayed):
            let label = CallQualityNetworkContext(profile: nil, relayed: relayed).routeLabel ?? ""
            return (String(localized: "calls.network.event.route", defaultValue: "Chemin : \(label)", bundle: .main), nil, false)
        case let .tier(level):
            return (String(localized: "calls.network.event.tier", defaultValue: "Qualité : \(tierLabel(level))", bundle: .main), nil, level == "poor" || level == "critical")
        case let .profile(name):
            return (String(localized: "calls.network.event.profile", defaultValue: "Profil : \(profileLabel(name))", bundle: .main), nil, false)
        case let .mediaFault(reason):
            return (String(localized: "calls.network.event.fault", defaultValue: "Incident média", bundle: .main), reason, true)
        case .ended:
            return (String(localized: "calls.network.event.ended", defaultValue: "Fin de l’appel", bundle: .main), nil, false)
        }
    }

    private static func linkText(_ state: String) -> (text: String, detail: String?, isAlert: Bool)? {
        switch PeerConnectionState(rawValue: state) {
        case .connecting:
            return (String(localized: "calls.network.event.link.connecting", defaultValue: "Liaison en cours", bundle: .main), nil, false)
        case .connected:
            return (String(localized: "calls.network.event.link.connected", defaultValue: "Liaison établie", bundle: .main), nil, false)
        case .disconnected:
            return (String(localized: "calls.network.event.link.disconnected", defaultValue: "Liaison interrompue", bundle: .main), nil, true)
        case .failed:
            return (String(localized: "calls.network.event.link.failed", defaultValue: "Liaison perdue", bundle: .main), nil, true)
        case .new, .closed, nil:
            return nil
        }
    }

    private static func tierLabel(_ level: String) -> String {
        switch VideoQualityLevel(rawValue: level) {
        case .excellent: return String(localized: "bubble.call.quality.excellent", defaultValue: "Excellente", bundle: .main)
        case .good: return String(localized: "bubble.call.quality.good", defaultValue: "Bonne", bundle: .main)
        case .fair: return String(localized: "bubble.call.quality.fair", defaultValue: "Moyenne", bundle: .main)
        case .poor, .critical, nil: return String(localized: "bubble.call.quality.poor", defaultValue: "Faible", bundle: .main)
        }
    }
}

// MARK: - Section

/// « Qualité et réseau » — shared by the call-log detail (`CallDetailSheet`)
/// and the in-chat call notice detail (`CallSummaryDetailSheet`).
struct CallNetworkJournalSection: View {
    let presentation: CallNetworkJournalPresentation
    let accentColor: Color

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionTitle(CallNetworkJournalPresentation.title)
            ForEach(presentation.summary) { row in
                HStack(spacing: MeeshySpacing.md) {
                    Text(row.title)
                        .font(.subheadline)
                        .foregroundColor(theme.textMuted)
                    Spacer(minLength: 8)
                    Text(row.value)
                        .font(.subheadline.weight(.medium).monospacedDigit())
                        .foregroundColor(theme.textPrimary)
                        .multilineTextAlignment(.trailing)
                }
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, MeeshySpacing.sm)
                .frame(minHeight: 44)
                .accessibilityElement(children: .combine)
            }
            if !presentation.timeline.isEmpty {
                sectionTitle(CallNetworkJournalPresentation.timelineTitle)
                ForEach(presentation.timeline) { moment in
                    momentRow(moment)
                }
            }
        }
        .padding(.bottom, MeeshySpacing.sm)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.backgroundSecondary)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title)
            .font(.footnote.weight(.semibold))
            .foregroundColor(theme.textMuted)
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.top, MeeshySpacing.md)
            .padding(.bottom, MeeshySpacing.xs)
            .accessibilityAddTraits(.isHeader)
    }

    private func momentRow(_ moment: CallNetworkJournalPresentation.Moment) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.smPlus) {
            Text(moment.elapsed)
                .font(.caption.monospacedDigit())
                .foregroundColor(theme.textMuted)
                .frame(minWidth: 44, alignment: .leading)
            Circle()
                .fill(moment.isAlert ? MeeshyColors.warning : accentColor)
                .frame(width: 6, height: 6)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                Text(moment.text)
                    .font(.subheadline)
                    .foregroundColor(theme.textPrimary)
                if let detail = moment.detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundColor(theme.textMuted)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.xsPlus)
        .accessibilityElement(children: .combine)
    }
}
