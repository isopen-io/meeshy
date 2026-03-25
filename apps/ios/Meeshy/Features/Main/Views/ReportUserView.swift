import SwiftUI
import MeeshySDK
import MeeshyUI

struct ReportUserView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    let userId: String
    let username: String

    @State private var selectedReason: ReportReason = .spam
    @State private var details: String = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private let accentColor = "EF4444"

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

            Text("Signaler @\(username)")
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
            .accessibilityLabel("Fermer")
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
                        .foregroundColor(Color(hex: "EF4444"))
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
            sectionHeader(title: "Raison du signalement", icon: "exclamationmark.triangle.fill", color: "F59E0B")

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
                                .foregroundColor(Color(hex: selectedReason == reason ? accentColor : "6B7280"))
                                .frame(width: 28, height: 28)
                                .background(
                                    RoundedRectangle(cornerRadius: 8)
                                        .fill(Color(hex: selectedReason == reason ? accentColor : "6B7280").opacity(0.12))
                                )

                            Text(reason.label)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(theme.textPrimary)

                            Spacer()

                            if selectedReason == reason {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 18))
                                    .foregroundColor(Color(hex: accentColor))
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                    }
                    .accessibilityLabel(reason.label)
                    .accessibilityValue(selectedReason == reason ? "selectionne" : "")
                    .accessibilityAddTraits(selectedReason == reason ? .isSelected : [])
                }
            }
            .background(sectionBackground(tint: "F59E0B"))
        }
    }

    // MARK: - Details Section

    private var detailsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Details (optionnel)", icon: "text.alignleft", color: "3498DB")

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
                    .onChange(of: details) { _, newValue in
                        if newValue.count > 500 {
                            details = String(newValue.prefix(500))
                        }
                    }
                    .accessibilityLabel("Details du signalement")

                Text("\(details.count)/500")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(details.count >= 450 ? Color(hex: "EF4444") : theme.textMuted)
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
                Text("Envoyer le signalement")
                    .font(.system(size: 15, weight: .bold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(isSubmitting ? Color(hex: accentColor).opacity(0.5) : Color(hex: accentColor))
            )
        }
        .disabled(isSubmitting)
        .accessibilityLabel("Envoyer le signalement")
        .accessibilityHint("Envoie le signalement pour \(username)")
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
                ToastManager.shared.showSuccess("Signalement envoye")
                dismiss()
            } catch {
                HapticFeedback.error()
                errorMessage = "Erreur lors de l'envoi du signalement"
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
        case .spam: return "Spam"
        case .harassment: return "Harcelement"
        case .inappropriate: return "Contenu inapproprie"
        case .impersonation: return "Usurpation d'identite"
        case .other: return "Autre"
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
