import SwiftUI
import MeeshyUI

struct CrashReportSheet: View {
    let reports: [CrashDiagnostic]
    @Environment(\.dismiss) private var dismiss
    @State private var expandedId: UUID?

    var body: some View {
        NavigationStack {
            List {
                ForEach(reports) { report in
                    Section {
                        let isExpanded = expandedId == report.id
                        VStack(alignment: .leading, spacing: 8) {
                            // Always-visible header is the single VoiceOver
                            // activation point: it toggles the details, so it
                            // must read as one combined `.isButton` element with
                            // a state-aware hint — otherwise the `.onTapGesture`
                            // is invisible to VoiceOver and the badge/date/summary
                            // scatter into three unrelated stops.
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    kindBadge(report.kind)
                                    Spacer()
                                    Text(report.timestamp, style: .relative)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }

                                Text(report.summary)
                                    .font(.subheadline.weight(.medium))
                            }
                            .accessibilityElement(children: .combine)
                            .accessibilityAddTraits(.isButton)
                            .accessibilityHint(isExpanded
                                ? String(localized: "crash.reports.collapse.hint", defaultValue: "Masquer les détails", bundle: .main)
                                : String(localized: "crash.reports.expand.hint", defaultValue: "Afficher les détails", bundle: .main))
                            .accessibilityAction { toggleExpansion(report.id) }

                            if isExpanded {
                                Text(report.details)
                                    .font(.caption2.monospaced())
                                    .foregroundStyle(.secondary)
                                    .textSelection(.enabled)
                            }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture { toggleExpansion(report.id) }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(String(localized: "crash.reports.title", defaultValue: "Crash Reports", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(String(localized: "common.close", defaultValue: "Fermer", bundle: .main)) { dismiss() }
                }
                ToolbarItem(placement: .topBarLeading) {
                    ShareLink(item: formatAllReports()) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityLabel(String(localized: "crash.reports.share.a11yLabel", defaultValue: "Partager les rapports", bundle: .main))
                }
            }
        }
    }

    /// One-way toggle of the expanded report, shared by the touch
    /// `.onTapGesture` and the VoiceOver `.accessibilityAction` so both paths
    /// stay behaviourally identical.
    private func toggleExpansion(_ id: UUID) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            expandedId = expandedId == id ? nil : id
        }
    }

    @ViewBuilder
    private func kindBadge(_ kind: CrashDiagnostic.Kind) -> some View {
        let color: Color = switch kind {
        case .nsException, .crash: MeeshyColors.error
        case .hang, .cpuException: MeeshyColors.warning
        case .diskWriteException: MeeshyColors.info
        }
        Text(kind.localizedLabel)
            .font(.caption2.weight(.bold))
            .foregroundColor(.white)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Capsule().fill(color))
    }

    private func formatAllReports() -> String {
        reports.map { report in
            """
            [\(report.kind.rawValue)] \(report.timestamp.ISO8601Format())
            \(report.summary)
            \(report.details)
            """
        }.joined(separator: "\n\n---\n\n")
    }
}
