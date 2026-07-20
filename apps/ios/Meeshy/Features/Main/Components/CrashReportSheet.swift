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
                            Button {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                    expandedId = expandedId == report.id ? nil : report.id
                                }
                            } label: {
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
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityValue(
                                expandedId == report.id
                                    ? String(localized: "crash.reports.details.expanded", defaultValue: "Détails affichés", bundle: .main)
                                    : String(localized: "crash.reports.details.collapsed", defaultValue: "Détails masqués", bundle: .main)
                            )
                            .accessibilityHint(String(localized: "crash.reports.details.hint", defaultValue: "Double-tapez pour afficher ou masquer les détails du rapport", bundle: .main))

                            if expandedId == report.id {
                                Text(report.details)
                                    .font(.caption2.monospaced())
                                    .foregroundStyle(.secondary)
                                    .textSelection(.enabled)
                            }
                        }
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
                    .accessibilityLabel(String(localized: "crash.reports.share", defaultValue: "Partager les rapports", bundle: .main))
                }
            }
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
