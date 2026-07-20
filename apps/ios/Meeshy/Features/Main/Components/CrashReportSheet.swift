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
                        VStack(alignment: .leading, spacing: 8) {
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
                            .accessibilityValue(Text(isExpanded(report)
                                ? String(localized: "crash.report.expanded", defaultValue: "Développé", bundle: .main)
                                : String(localized: "crash.report.collapsed", defaultValue: "Réduit", bundle: .main)))
                            .accessibilityHint(Text(String(localized: "crash.report.expand-hint",
                                                           defaultValue: "Appuyez pour afficher ou masquer les détails techniques",
                                                           bundle: .main)))
                            .accessibilityAction { toggleExpansion(report) }

                            if isExpanded(report) {
                                Text(report.details)
                                    .font(.caption2.monospaced())
                                    .foregroundStyle(.secondary)
                                    .textSelection(.enabled)
                                    .accessibilityLabel(Text(String(localized: "crash.report.details-label",
                                                                    defaultValue: "Détails techniques",
                                                                    bundle: .main)))
                            }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture { toggleExpansion(report) }
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
                    .accessibilityLabel(Text(String(localized: "crash.reports.share",
                                                    defaultValue: "Partager les rapports",
                                                    bundle: .main)))
                }
            }
        }
    }

    private func isExpanded(_ report: CrashDiagnostic) -> Bool {
        expandedId == report.id
    }

    private func toggleExpansion(_ report: CrashDiagnostic) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            expandedId = expandedId == report.id ? nil : report.id
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
