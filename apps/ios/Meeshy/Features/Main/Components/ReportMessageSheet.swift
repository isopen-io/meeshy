import SwiftUI
import Combine
import MeeshySDK

struct ReportMessageSheet: View {
    let accentColor: String
    let onSubmit: (String, String?) -> Void

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.dismiss) private var dismiss
    @State private var selectedType: ReportType? = nil
    @State private var reason = ""
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    Text(String(localized: "report.message.title", defaultValue: "Why are you reporting this message?", bundle: .main))
                        .font(.callout.weight(.semibold))
                        .foregroundColor(theme.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 8)

                    ForEach(ReportType.allCases) { type in
                        reportTypeRow(type)
                    }

                    if selectedType != nil {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(String(localized: "report.message.details.label", defaultValue: "Details (optional)", bundle: .main))
                                .font(.footnote.weight(.medium))
                                .foregroundColor(theme.textSecondary)

                            TextField(String(localized: "report.message.details.placeholder", defaultValue: "Describe the issue...", bundle: .main), text: $reason, axis: .vertical)
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
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
            .navigationTitle(String(localized: "report.message.nav.title", defaultValue: "Report", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Cancel", bundle: .main)) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        guard let type = selectedType else { return }
                        isSubmitting = true
                        onSubmit(type.rawValue, reason.isEmpty ? nil : reason)
                    } label: {
                        if isSubmitting {
                            ProgressView()
                                .tint(Color(hex: accentColor))
                        } else {
                            Text(String(localized: "report.message.send", defaultValue: "Send", bundle: .main))
                                .fontWeight(.semibold)
                        }
                    }
                    .disabled(selectedType == nil || isSubmitting)
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: selectedType)
        }
    }

    private func reportTypeRow(_ type: ReportType) -> some View {
        let isSelected = selectedType == type
        let accent = Color(hex: accentColor)

        return Button {
            HapticFeedback.light()
            selectedType = type
        } label: {
            HStack(spacing: 12) {
                Image(systemName: type.icon)
                    .font(.callout)
                    .foregroundColor(isSelected ? accent : theme.textSecondary)
                    .frame(width: 24)
                    // Decorative — the reason label/description carry the meaning.
                    .accessibilityHidden(true)

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
                        // Selection is announced via the row's .isSelected trait.
                        .accessibilityHidden(true)
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
        // VoiceOver announces "Selected" for the active reason — selection was
        // conveyed only by the checkmark glyph + accent colour before (violates
        // "never rely on colour alone"). The row already reads label + description.
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

// MARK: - Report Types

enum ReportType: String, CaseIterable, Identifiable {
    case spam
    case inappropriate
    case harassment
    case violence
    case hate_speech
    case impersonation
    case other

    var id: String { rawValue }

    var label: String {
        switch self {
        case .spam: return String(localized: "report.message.type.spam.label", defaultValue: "Spam", bundle: .main)
        case .inappropriate: return String(localized: "report.message.type.inappropriate.label", defaultValue: "Inappropriate Content", bundle: .main)
        case .harassment: return String(localized: "report.message.type.harassment.label", defaultValue: "Harassment", bundle: .main)
        case .violence: return String(localized: "report.message.type.violence.label", defaultValue: "Violence", bundle: .main)
        case .hate_speech: return String(localized: "report.message.type.hate_speech.label", defaultValue: "Hate Speech", bundle: .main)
        case .impersonation: return String(localized: "report.message.type.impersonation.label", defaultValue: "Impersonation", bundle: .main)
        case .other: return String(localized: "report.message.type.other.label", defaultValue: "Other", bundle: .main)
        }
    }

    var description: String {
        switch self {
        case .spam: return String(localized: "report.message.type.spam.description", defaultValue: "Repetitive or promotional messages", bundle: .main)
        case .inappropriate: return String(localized: "report.message.type.inappropriate.description", defaultValue: "Sexual or disturbing content", bundle: .main)
        case .harassment: return String(localized: "report.message.type.harassment.description", defaultValue: "Intimidation or threats", bundle: .main)
        case .violence: return String(localized: "report.message.type.violence.description", defaultValue: "Incitement to violence", bundle: .main)
        case .hate_speech: return String(localized: "report.message.type.hate_speech.description", defaultValue: "Discrimination or hateful content", bundle: .main)
        case .impersonation: return String(localized: "report.message.type.impersonation.description", defaultValue: "Pretending to be someone else", bundle: .main)
        case .other: return String(localized: "report.message.type.other.description", defaultValue: "Another reason", bundle: .main)
        }
    }

    var icon: String {
        switch self {
        case .spam: return "envelope.badge.fill"
        case .inappropriate: return "eye.slash.fill"
        case .harassment: return "hand.raised.fill"
        case .violence: return "exclamationmark.shield.fill"
        case .hate_speech: return "bubble.left.and.exclamationmark.bubble.right.fill"
        case .impersonation: return "person.crop.circle.badge.questionmark.fill"
        case .other: return "ellipsis.circle.fill"
        }
    }
}
