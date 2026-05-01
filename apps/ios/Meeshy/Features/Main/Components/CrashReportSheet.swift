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
                            HStack {
                                kindBadge(report.kind)
                                Spacer()
                                Text(report.timestamp, style: .relative)
                                    .font(.system(size: 11))
                                    .foregroundStyle(.secondary)
                            }

                            Text(report.summary)
                                .font(.system(size: 14, weight: .medium))

                            if expandedId == report.id {
                                Text(report.details)
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(.secondary)
                                    .textSelection(.enabled)
                            }
                        }
                        .contentShape(Rectangle())
                        .onTapGesture {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                expandedId = expandedId == report.id ? nil : report.id
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Crash Reports")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Fermer") { dismiss() }
                }
                ToolbarItem(placement: .topBarLeading) {
                    ShareLink(item: formatAllReports()) {
                        Image(systemName: "square.and.arrow.up")
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func kindBadge(_ kind: CrashDiagnostic.Kind) -> some View {
        let (label, color): (String, Color) = switch kind {
        case .nsException: ("Exception", MeeshyColors.error)
        case .crash: ("Crash", MeeshyColors.error)
        case .hang: ("Blocage", MeeshyColors.warning)
        case .cpuException: ("CPU", MeeshyColors.warning)
        case .diskWriteException: ("Disque", MeeshyColors.info)
        }
        Text(label)
            .font(.system(size: 10, weight: .bold))
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
