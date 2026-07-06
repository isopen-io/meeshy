import SwiftUI
import MeeshySDK
import MeeshyUI

/// Signalement d'un message — extrait de l'ancien
/// `MessageDetailSheet.reportTabContent`. État de sélection 100 %
/// encapsulé. Aucun changement de comportement : la sélection du motif +
/// le détail optionnel sont envoyés via le callback `onReport(type, reason)`,
/// puis `onDismiss()` ferme la surface hôte.
struct MessageReportDetailView: View {
    let message: Message
    var onReport: ((String, String?) -> Void)? = nil
    var onDismiss: (() -> Void)? = nil

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    @State private var selectedReportType: ReportType? = nil
    @State private var reportReason = ""
    @State private var isSubmittingReport = false

    var body: some View {
        VStack(spacing: 16) {
            Text(String(localized: "message-detail.report.title", defaultValue: "Pourquoi signalez-vous ce message ?", bundle: .main))
                .font(.callout.weight(.semibold))
                .foregroundColor(theme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)

            ForEach(ReportType.allCases) { type in
                reportTypeRow(type)
            }

            if selectedReportType != nil {
                VStack(alignment: .leading, spacing: 6) {
                    Text(String(localized: "message-detail.report.details", defaultValue: "Details (optionnel)", bundle: .main))
                        .font(.footnote.weight(.medium))
                        .foregroundColor(theme.textSecondary)

                    TextField(String(localized: "message-detail.report.placeholder", defaultValue: "Decrivez le probleme...", bundle: .main), text: $reportReason, axis: .vertical)
                        .font(.subheadline)
                        .lineLimit(3...6)
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(theme.inputBackground)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12)
                                        .stroke(theme.textMuted.opacity(0.2), lineWidth: 1)
                                )
                        )
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }

            if let reportType = selectedReportType {
                Button {
                    isSubmittingReport = true
                    HapticFeedback.medium()
                    onReport?(reportType.rawValue, reportReason.isEmpty ? nil : reportReason)
                    onDismiss?()
                } label: {
                    if isSubmittingReport {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text(String(localized: "message-detail.report.send", defaultValue: "Envoyer le signalement", bundle: .main))
                            .font(.callout.weight(.semibold))
                    }
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(MeeshyColors.error)
                )
                .disabled(isSubmittingReport)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: selectedReportType)
    }

    private func reportTypeRow(_ type: ReportType) -> some View {
        let isSelected = selectedReportType == type
        let accent = MeeshyColors.error

        return Button {
            HapticFeedback.light()
            selectedReportType = type
        } label: {
            HStack(spacing: 12) {
                Image(systemName: type.icon)
                    .font(.callout)
                    .foregroundColor(isSelected ? accent : theme.textSecondary)
                    .frame(width: 24)

                VStack(alignment: .leading, spacing: 2) {
                    Text(type.label)
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(theme.textPrimary)
                    Text(type.description)
                        .font(.caption)
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundColor(accent)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? accent.opacity(0.08) : theme.inputBackground)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(isSelected ? accent.opacity(0.3) : theme.textMuted.opacity(0.1), lineWidth: 1)
                    )
            )
        }
    }
}
