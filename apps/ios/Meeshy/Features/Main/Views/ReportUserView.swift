import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct ReportUserView: View {
    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }

    let userId: String
    let username: String

    @State private var selectedReason: ReportReason = .spam
    @State private var details: String = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?


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
            Spacer()

            Text("\(String(localized: "report.user.title", defaultValue: "Signaler", bundle: .main)) @\(username)")
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(MeeshyFont.relative(24))
                    .foregroundColor(theme.textMuted)
            }
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: MeeshySpacing.xl) {
                reasonSection
                detailsSection
                submitSection

                if let errorMessage {
                    Text(errorMessage)
                        .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                        .frame(maxWidth: .infinity, alignment: .center)
                }

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.sm)
        }
    }

    // MARK: - Reason Section

    private var reasonSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "report.user.reason", defaultValue: "Motif du signalement", bundle: .main), icon: "exclamationmark.triangle.fill", color: MeeshyColors.warningHex)

            VStack(spacing: 0) {
                ForEach(ReportReason.allCases, id: \.self) { reason in
                    Button {
                        HapticFeedback.light()
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            selectedReason = reason
                        }
                    } label: {
                        HStack(spacing: MeeshySpacing.md) {
                            Image(systemName: reason.icon)
                                .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .medium))
                                .foregroundColor(selectedReason == reason ? MeeshyColors.error : MeeshyColors.neutral500)
                                .frame(width: 28, height: 28)
                                .background(
                                    RoundedRectangle(cornerRadius: MeeshyRadius.xs)
                                        .fill((selectedReason == reason ? MeeshyColors.error : MeeshyColors.neutral500).opacity(0.12))
                                )

                            Text(reason.label)
                                .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                                .foregroundColor(theme.textPrimary)

                            Spacer()

                            if selectedReason == reason {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(MeeshyFont.relative(MeeshyIconSize.lg))
                                    .foregroundColor(MeeshyColors.error)
                            }
                        }
                        .padding(.horizontal, MeeshySpacing.mdPlus)
                        .padding(.vertical, MeeshySpacing.smPlus)
                    }
                    .accessibilityLabel(reason.label)
                    .accessibilityValue(selectedReason == reason ? String(localized: "common.selected", defaultValue: "Sélectionné", bundle: .main) : "")
                    .accessibilityAddTraits(selectedReason == reason ? .isSelected : [])
                }
            }
            .background(sectionBackground(tint: MeeshyColors.warningHex))
        }
    }

    // MARK: - Details Section

    private var detailsSection: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            sectionHeader(title: String(localized: "report.user.details", defaultValue: "Détails (facultatif)", bundle: .main), icon: "text.alignleft", color: MeeshyColors.infoHex)

            VStack(spacing: MeeshySpacing.sm) {
                TextEditor(text: $details)
                    .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .regular))
                    .foregroundColor(theme.textPrimary)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 100, maxHeight: 150)
                    .padding(MeeshySpacing.smPlus)
                    .background(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .fill(theme.surfaceGradient(tint: MeeshyColors.infoHex))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(theme.border(tint: MeeshyColors.infoHex), lineWidth: 1)
                    )
                    .adaptiveOnChange(of: details) { _, newValue in
                        if newValue.count > 500 {
                            details = String(newValue.prefix(500))
                        }
                    }
                    .accessibilityLabel(String(localized: "report.user.details.a11y", defaultValue: "Détails du signalement", bundle: .main))

                CharacterCountLabel(count: details.count, limit: 500, warningThreshold: 450)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
    }

    // MARK: - Submit Section

    private var submitSection: some View {
        Button {
            HapticFeedback.heavy()
            submitReport()
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                if isSubmitting {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(.white)
                }
                Text(String(localized: "report.user.submit", defaultValue: "Envoyer le signalement", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.mdPlus)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(isSubmitting ? MeeshyColors.error.opacity(0.5) : MeeshyColors.error)
            )
        }
        .disabled(isSubmitting)
        .accessibilityLabel(String(localized: "report.user.submit", defaultValue: "Envoyer le signalement", bundle: .main))
        .accessibilityHint("\(String(localized: "report.user.submit.hint", defaultValue: "Envoyer le signalement pour", bundle: .main)) \(username)")
    }

    // MARK: - Actions

    private func submitReport() {
        isSubmitting = true
        errorMessage = nil
        Task {
            do {
                try await ReportService.shared.reportUser(
                    userId: userId,
                    reportType: selectedReason.rawValue,
                    reason: details.isEmpty ? nil : details
                )
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(String(localized: "report.user.success", defaultValue: "Signalement envoyé", bundle: .main))
                dismiss()
            } catch {
                HapticFeedback.error()
                errorMessage = String(localized: "report.user.error", defaultValue: "Impossible d'envoyer le signalement", bundle: .main)
            }
            isSubmitting = false
        }
    }

    // MARK: - Helpers

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, MeeshySpacing.xs)
    }

    private func sectionBackground(tint: String) -> some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
            .fill(theme.surfaceGradient(tint: tint))
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .stroke(theme.border(tint: tint), lineWidth: 1)
            )
    }
}

// MARK: - Report Reason

private enum ReportReason: String, CaseIterable {
    case spam = "SPAM"
    case harassment = "HARASSMENT"
    case inappropriate = "INAPPROPRIATE_CONTENT"
    case impersonation = "IMPERSONATION"
    case other = "OTHER"

    var label: String {
        switch self {
        case .spam: return String(localized: "report.user.reason.spam", defaultValue: "Spam", bundle: .main)
        case .harassment: return String(localized: "report.user.reason.harassment", defaultValue: "Harcèlement", bundle: .main)
        case .inappropriate: return String(localized: "report.user.reason.inappropriate", defaultValue: "Contenu inapproprié", bundle: .main)
        case .impersonation: return String(localized: "report.user.reason.impersonation", defaultValue: "Usurpation d'identité", bundle: .main)
        case .other: return String(localized: "report.user.reason.other", defaultValue: "Autre", bundle: .main)
        }
    }

    var icon: String {
        switch self {
        case .spam: return "envelope.badge.fill"
        case .harassment: return "hand.raised.fill"
        case .inappropriate: return "exclamationmark.triangle.fill"
        case .impersonation: return "person.crop.circle.badge.exclamationmark"
        case .other: return "ellipsis.circle.fill"
        }
    }
}
