import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct ReportUserView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
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
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 24))
                    .foregroundColor(theme.textMuted)
            }
            .accessibilityLabel(String(localized: "common.close", defaultValue: "Fermer", bundle: .main))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                reasonSection
                detailsSection
                submitSection

                if let errorMessage {
                    Text(errorMessage)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(MeeshyColors.error)
                        .frame(maxWidth: .infinity, alignment: .center)
                }

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    // MARK: - Reason Section

    private var reasonSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "report.user.reason", defaultValue: "Raison du signalement", bundle: .main), icon: "exclamationmark.triangle.fill", color: "F59E0B")

            VStack(spacing: 0) {
                ForEach(ReportReason.allCases, id: \.self) { reason in
                    Button {
                        HapticFeedback.light()
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            selectedReason = reason
                        }
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: reason.icon)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(selectedReason == reason ? MeeshyColors.error : MeeshyColors.neutral500)
                                .frame(width: 28, height: 28)
                                .background(
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill((selectedReason == reason ? MeeshyColors.error : MeeshyColors.neutral500).opacity(0.12))
                                )

                            Text(reason.label)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(theme.textPrimary)

                            Spacer()

                            if selectedReason == reason {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 18))
                                    .foregroundColor(MeeshyColors.error)
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                    }
                    .accessibilityLabel(reason.label)
                    .accessibilityValue(selectedReason == reason ? String(localized: "common.selected", defaultValue: "selectionne", bundle: .main) : "")
                    .accessibilityAddTraits(selectedReason == reason ? .isSelected : [])
                }
            }
            .background(sectionBackground(tint: "F59E0B"))
        }
    }

    // MARK: - Details Section

    private var detailsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "report.user.details", defaultValue: "Details (optionnel)", bundle: .main), icon: "text.alignleft", color: "3498DB")

            VStack(spacing: 8) {
                TextEditor(text: $details)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundColor(theme.textPrimary)
                    .scrollContentBackground(.hidden)
                    .frame(minHeight: 100, maxHeight: 150)
                    .padding(10)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(theme.surfaceGradient(tint: "3498DB"))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(theme.border(tint: "3498DB"), lineWidth: 1)
                    )
                    .adaptiveOnChange(of: details) { _, newValue in
                        if newValue.count > 500 {
                            details = String(newValue.prefix(500))
                        }
                    }
                    .accessibilityLabel(String(localized: "report.user.details.a11y", defaultValue: "Details du signalement", bundle: .main))

                Text("\(details.count)/500")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(details.count >= 450 ? MeeshyColors.error : theme.textMuted)
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
            HStack(spacing: 8) {
                if isSubmitting {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(.white)
                }
                Text(String(localized: "report.user.submit", defaultValue: "Envoyer le signalement", bundle: .main))
                    .font(.system(size: 15, weight: .bold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(isSubmitting ? MeeshyColors.error.opacity(0.5) : MeeshyColors.error)
            )
        }
        .disabled(isSubmitting)
        .accessibilityLabel(String(localized: "report.user.submit", defaultValue: "Envoyer le signalement", bundle: .main))
        .accessibilityHint("\(String(localized: "report.user.submit.hint", defaultValue: "Envoie le signalement pour", bundle: .main)) \(username)")
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
                FeedbackToastManager.shared.showSuccess(String(localized: "report.user.success", defaultValue: "Signalement envoye", bundle: .main))
                dismiss()
            } catch {
                HapticFeedback.error()
                errorMessage = String(localized: "report.user.error", defaultValue: "Erreur lors de l'envoi du signalement", bundle: .main)
            }
            isSubmitting = false
        }
    }

    // MARK: - Helpers

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, 4)
    }

    private func sectionBackground(tint: String) -> some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(theme.surfaceGradient(tint: tint))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
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
        case .harassment: return String(localized: "report.user.reason.harassment", defaultValue: "Harcelement", bundle: .main)
        case .inappropriate: return String(localized: "report.user.reason.inappropriate", defaultValue: "Contenu inapproprie", bundle: .main)
        case .impersonation: return String(localized: "report.user.reason.impersonation", defaultValue: "Usurpation d'identite", bundle: .main)
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
