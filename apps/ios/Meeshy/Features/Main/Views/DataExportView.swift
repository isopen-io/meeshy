import SwiftUI
import MeeshySDK

struct DataExportView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    @State private var selectedFormats: Set<ExportFormat> = [.json]
    @State private var includeMessages = true
    @State private var includeMedia = false
    @State private var isExporting = false
    @State private var exportComplete = false

    private let accentColor = "3498DB"

    enum ExportFormat: String, CaseIterable, Identifiable {
        case json = "JSON"
        case csv = "CSV"

        var id: String { rawValue }

        var icon: String {
            switch self {
            case .json: return "doc.text"
            case .csv: return "tablecells"
            }
        }
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text("Export de donnees")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Color.clear.frame(width: 24, height: 24)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                infoCard
                formatSection
                optionsSection
                exportButton
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    private var infoCard: some View {
        HStack(spacing: 12) {
            Image(systemName: "shield.checkered")
                .font(.system(size: 24, weight: .semibold))
                .foregroundColor(Color(hex: accentColor))

            VStack(alignment: .leading, spacing: 4) {
                Text("Vos donnees, votre controle")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(theme.textPrimary)

                Text("Conformement au RGPD, vous pouvez exporter toutes vos donnees personnelles.")
                    .font(.system(size: 12))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: accentColor), lineWidth: 1)
                )
        )
    }

    private var formatSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: "FORMAT", icon: "doc.fill", color: accentColor)

            HStack(spacing: 12) {
                ForEach(ExportFormat.allCases) { format in
                    Button {
                        HapticFeedback.light()
                        if selectedFormats.contains(format) {
                            selectedFormats.remove(format)
                        } else {
                            selectedFormats.insert(format)
                        }
                    } label: {
                        VStack(spacing: 6) {
                            Image(systemName: format.icon)
                                .font(.system(size: 22, weight: .semibold))
                            Text(format.rawValue)
                                .font(.system(size: 12, weight: .semibold))
                        }
                        .foregroundColor(selectedFormats.contains(format) ? .white : Color(hex: accentColor))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(
                            RoundedRectangle(cornerRadius: 14)
                                .fill(
                                    selectedFormats.contains(format)
                                        ? Color(hex: accentColor)
                                        : Color(hex: accentColor).opacity(0.12)
                                )
                        )
                    }
                }
            }
        }
    }

    private var optionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: "CONTENU", icon: "checklist", color: "F8B500")

            VStack(spacing: 0) {
                toggleRow(title: "Messages", icon: "bubble.left.fill", color: "FF6B6B", isOn: $includeMessages)
                toggleRow(title: "Media", icon: "photo.fill", color: "9B59B6", isOn: $includeMedia)
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: "F8B500"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: "F8B500"), lineWidth: 1)
                    )
            )
        }
    }

    private func toggleRow(title: String, icon: String, color: String, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: color))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(hex: color).opacity(0.12))
                )

            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(Color(hex: accentColor))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private var exportButton: some View {
        Button {
            HapticFeedback.medium()
            isExporting = true
            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                isExporting = false
                exportComplete = true
                HapticFeedback.success()
            }
        } label: {
            HStack(spacing: 8) {
                if isExporting {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.8)
                } else if exportComplete {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 16, weight: .semibold))
                } else {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 16, weight: .semibold))
                }
                Text(exportComplete ? "Export termine" : "Exporter mes donnees")
                    .font(.system(size: 15, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(exportComplete ? Color(hex: "2ECC71") : Color(hex: accentColor))
            )
        }
        .disabled(isExporting || selectedFormats.isEmpty)
    }

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title)
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, 4)
    }
}
