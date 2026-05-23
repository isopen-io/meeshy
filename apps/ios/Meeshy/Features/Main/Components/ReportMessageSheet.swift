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
                    Text(String(localized: "report.message.title", defaultValue: "Pourquoi signalez-vous ce message ?", bundle: .main))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 8)

                    ForEach(ReportType.allCases) { type in
                        reportTypeRow(type)
                    }

                    if selectedType != nil {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(String(localized: "report.message.details.label", defaultValue: "Details (optionnel)", bundle: .main))
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(theme.textSecondary)

                            TextField(String(localized: "report.message.details.placeholder", defaultValue: "Decrivez le probleme...", bundle: .main), text: $reason, axis: .vertical)
                                .font(.system(size: 14))
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
            .navigationTitle(String(localized: "report.message.nav.title", defaultValue: "Signaler", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) { dismiss() }
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
                            Text(String(localized: "report.message.send", defaultValue: "Envoyer", bundle: .main))
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
                    .font(.system(size: 16))
                    .foregroundColor(isSelected ? accent : theme.textSecondary)
                    .frame(width: 24)

                VStack(alignment: .leading, spacing: 2) {
                    Text(type.label)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                    Text(type.description)
                        .font(.system(size: 12))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 20))
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
        case .inappropriate: return String(localized: "report.message.type.inappropriate.label", defaultValue: "Contenu inapproprie", bundle: .main)
        case .harassment: return String(localized: "report.message.type.harassment.label", defaultValue: "Harcelement", bundle: .main)
        case .violence: return String(localized: "report.message.type.violence.label", defaultValue: "Violence", bundle: .main)
        case .hate_speech: return String(localized: "report.message.type.hate_speech.label", defaultValue: "Discours haineux", bundle: .main)
        case .impersonation: return String(localized: "report.message.type.impersonation.label", defaultValue: "Usurpation d'identite", bundle: .main)
        case .other: return String(localized: "report.message.type.other.label", defaultValue: "Autre", bundle: .main)
        }
    }

    var description: String {
        switch self {
        case .spam: return String(localized: "report.message.type.spam.description", defaultValue: "Messages repetitifs ou publicitaires", bundle: .main)
        case .inappropriate: return String(localized: "report.message.type.inappropriate.description", defaultValue: "Contenu sexuel ou choquant", bundle: .main)
        case .harassment: return String(localized: "report.message.type.harassment.description", defaultValue: "Intimidation ou menaces", bundle: .main)
        case .violence: return String(localized: "report.message.type.violence.description", defaultValue: "Incitation a la violence", bundle: .main)
        case .hate_speech: return String(localized: "report.message.type.hate_speech.description", defaultValue: "Discrimination ou propos haineux", bundle: .main)
        case .impersonation: return String(localized: "report.message.type.impersonation.description", defaultValue: "Se fait passer pour quelqu'un d'autre", bundle: .main)
        case .other: return String(localized: "report.message.type.other.description", defaultValue: "Autre raison", bundle: .main)
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
