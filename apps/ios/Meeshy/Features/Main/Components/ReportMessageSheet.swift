import SwiftUI
import MeeshySDK

struct ReportMessageSheet: View {
    let accentColor: String
    let onSubmit: (String, String?) -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss
    @State private var selectedType: ReportType? = nil
    @State private var reason = ""
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    Text("Pourquoi signalez-vous ce message ?")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 8)

                    ForEach(ReportType.allCases) { type in
                        reportTypeRow(type)
                    }

                    if selectedType != nil {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Details (optionnel)")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(theme.textSecondary)

                            TextField("Decrivez le probleme...", text: $reason, axis: .vertical)
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
            .navigationTitle("Signaler")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
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
                            Text("Envoyer")
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
        case .spam: return "Spam"
        case .inappropriate: return "Contenu inapproprie"
        case .harassment: return "Harcelement"
        case .violence: return "Violence"
        case .hate_speech: return "Discours haineux"
        case .impersonation: return "Usurpation d'identite"
        case .other: return "Autre"
        }
    }

    var description: String {
        switch self {
        case .spam: return "Messages repetitifs ou publicitaires"
        case .inappropriate: return "Contenu sexuel ou choquant"
        case .harassment: return "Intimidation ou menaces"
        case .violence: return "Incitation a la violence"
        case .hate_speech: return "Discrimination ou propos haineux"
        case .impersonation: return "Se fait passer pour quelqu'un d'autre"
        case .other: return "Autre raison"
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
