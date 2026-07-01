import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct DataExportView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var selectedFormats: Set<ExportFormat> = [.json]
    @State private var includeMessages = true
    @State private var includeMedia = false
    @State private var includeContacts = true
    @State private var isExporting = false
    @State private var exportComplete = false
    @State private var exportError: String?
    @State private var exportedData: Data?
    @State private var showShareSheet = false

    private let accentColor = MeeshyColors.infoHex
    private let exportService: DataExportServiceProviding

    init(exportService: DataExportServiceProviding = DataExportService.shared) {
        self.exportService = exportService
    }

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

        var apiValue: String {
            switch self {
            case .json: return "json"
            case .csv: return "csv"
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
        .sheet(isPresented: $showShareSheet) {
            if let data = exportedData {
                ShareSheet(activityItems: [data])
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
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(MeeshyFont.relative(14, weight: .semibold))
                    Text(String(localized: "common.back", defaultValue: "Retour", bundle: .main))
                        .font(MeeshyFont.relative(15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "common.back", defaultValue: "Retour", bundle: .main))

            Spacer()

            Text(String(localized: "settings.data.export.title", defaultValue: "Export de donnees", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            Color.clear.frame(width: 60, height: 24)
                .accessibilityHidden(true)
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
                if let error = exportError {
                    errorBanner(message: error)
                }
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
                .font(MeeshyFont.relative(24, weight: .semibold))
                .foregroundColor(Color(hex: accentColor))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(String(localized: "settings.data.export.info.title", defaultValue: "Vos donnees, votre controle", bundle: .main))
                    .font(MeeshyFont.relative(14, weight: .bold))
                    .foregroundColor(theme.textPrimary)

                Text(String(localized: "settings.data.export.info.body", defaultValue: "Conformement au RGPD, vous pouvez exporter toutes vos donnees personnelles.", bundle: .main))
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(theme.textMuted)
            }
        }
        .accessibilityElement(children: .combine)
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
            sectionHeader(title: String(localized: "settings.data.export.section.format", defaultValue: "FORMAT", bundle: .main), icon: "doc.fill", color: Color(hex: accentColor))

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
                                .font(MeeshyFont.relative(22, weight: .semibold))
                                .accessibilityHidden(true)
                            Text(format.rawValue)
                                .font(MeeshyFont.relative(12, weight: .semibold))
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
                    .accessibilityLabel(format.rawValue)
                    .accessibilityAddTraits(selectedFormats.contains(format) ? .isSelected : [])
                }
            }
        }
    }

    private var optionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionHeader(title: String(localized: "settings.data.export.section.content", defaultValue: "CONTENU", bundle: .main), icon: "checklist", color: MeeshyColors.communityAccent)

            VStack(spacing: 0) {
                toggleRow(title: String(localized: "settings.data.export.content.messages", defaultValue: "Messages", bundle: .main), icon: "bubble.left.fill", color: MeeshyColors.error, isOn: $includeMessages)
                toggleRow(title: String(localized: "settings.data.export.content.media", defaultValue: "Media", bundle: .main), icon: "photo.fill", color: MeeshyColors.brandDeep, isOn: $includeMedia)
                toggleRow(title: String(localized: "settings.data.export.content.contacts", defaultValue: "Contacts", bundle: .main), icon: "person.2.fill", color: MeeshyColors.indigo500, isOn: $includeContacts)
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: MeeshyColors.communityAccent))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: MeeshyColors.communityAccent), lineWidth: 1)
                    )
            )
        }
    }

    private func toggleRow(title: String, icon: String, color: Color, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                // Glyphe figé : badge de dimension fixe 28×28 (doctrine 86i — le scaling
                // Dynamic Type déborderait/tronquerait le glyphe hors du cadre fixe).
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(color)
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(color.opacity(0.12))
                )
                .accessibilityHidden(true)

            Text(title)
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(Color(hex: accentColor))
                .accessibilityLabel(title)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func errorBanner(message: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(MeeshyFont.relative(14))
                .foregroundColor(MeeshyColors.error)
                .accessibilityHidden(true)
            Text(message)
                .font(MeeshyFont.relative(13))
                .foregroundColor(MeeshyColors.error)
        }
        .accessibilityElement(children: .combine)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(MeeshyColors.error.opacity(0.1))
        )
    }

    private var exportButton: some View {
        Button {
            HapticFeedback.medium()
            performExport()
        } label: {
            HStack(spacing: 8) {
                if isExporting {
                    ProgressView()
                        .tint(.white)
                        .scaleEffect(0.8)
                } else if exportComplete {
                    Image(systemName: "checkmark.circle.fill")
                        .font(MeeshyFont.relative(16, weight: .semibold))
                } else {
                    Image(systemName: "square.and.arrow.up")
                        .font(MeeshyFont.relative(16, weight: .semibold))
                }
                Text(exportComplete
                    ? String(localized: "settings.data.export.button.done", defaultValue: "Export termine", bundle: .main)
                    : String(localized: "settings.data.export.button.start", defaultValue: "Exporter mes donnees", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(exportComplete ? MeeshyColors.success : Color(hex: accentColor))
            )
        }
        .disabled(isExporting || selectedFormats.isEmpty)
        .accessibilityLabel(String(localized: "settings.data.export.button.start", defaultValue: "Exporter mes donnees", bundle: .main))
        .accessibilityHint(isExporting
            ? String(localized: "settings.data.export.hint.exporting", defaultValue: "Export en cours", bundle: .main)
            : String(localized: "settings.data.export.hint.start", defaultValue: "Lance l'export de vos donnees", bundle: .main))
    }

    private func sectionHeader(title: String, icon: String, color: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundColor(color)
                .accessibilityHidden(true)
            Text(title)
                .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                .foregroundColor(color)
                .tracking(1.2)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
        .padding(.leading, 4)
    }

    // MARK: - Export Logic

    private func performExport() {
        isExporting = true
        exportError = nil
        exportComplete = false

        var types: [String] = ["profile"]
        if includeMessages { types.append("messages") }
        if includeContacts { types.append("contacts") }

        let format = selectedFormats.contains(.csv) ? "csv" : "json"
        let service = exportService

        Task {
            do {
                let result = try await service.requestExport(format: format, types: types)
                let encoder = JSONEncoder()
                encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
                encoder.dateEncodingStrategy = .iso8601
                let jsonData = try encoder.encode(ExportWrapper(data: result))

                await MainActor.run {
                    exportedData = jsonData
                    isExporting = false
                    exportComplete = true
                    HapticFeedback.success()
                    showShareSheet = true
                }
            } catch {
                await MainActor.run {
                    isExporting = false
                    exportError = error.localizedDescription
                    HapticFeedback.error()
                }
            }
        }
    }
}

// MARK: - Encodable wrapper for sharing

private struct ExportWrapper: Encodable {
    let data: DataExportData

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(data.exportDate, forKey: .exportDate)
        try container.encode(data.format, forKey: .format)
        try container.encode(data.requestedTypes, forKey: .requestedTypes)
        try container.encodeIfPresent(data.messagesCount, forKey: .messagesCount)
        try container.encodeIfPresent(data.contactsCount, forKey: .contactsCount)
    }

    enum CodingKeys: String, CodingKey {
        case exportDate, format, requestedTypes, messagesCount, contactsCount
    }
}

