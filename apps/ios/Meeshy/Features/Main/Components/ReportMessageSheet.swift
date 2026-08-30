import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// Surfaces de `ReportMessageSheet`, résolues depuis le colorScheme RENDU.
///
/// La feuille n'a qu'un seul point de présentation : le rail d'actions de
/// `StoryViewerView` (`StoryViewerView+Sidebar.swift`). Le `body` du lecteur
/// porte `.preferredColorScheme(.dark)`, et une `.sheet` présentée depuis cette
/// hiérarchie en hérite — la feuille se rend donc en SOMBRE pour tout le monde,
/// quel que soit le thème choisi dans l'app.
///
/// `ThemeManager.mode` porte le thème *choisi dans l'app* ; `colorScheme` le
/// mode *réellement rendu*. Partout ailleurs les deux coïncident, parce que
/// `MeeshyApp` pilote `.preferredColorScheme(theme.preferredColorScheme)` depuis
/// cette même préférence : ils ne divergent que sous un override imbriqué,
/// c'est-à-dire exactement ici. `colorScheme` est donc le signal strictement
/// meilleur — égal au thème partout, correct en plus sous un forçage.
///
/// Se brancher sur `ThemeManager` posait `textPrimary` = `indigo950` (presque
/// noir) sur le fond système sombre de la feuille : 1,06:1.
enum ReportSheetPalette {
    /// Reprend mot pour mot `ThemeManager.inputBackground` — seul jeton de la
    /// vue que `MeeshyColors` n'expose pas déjà sous forme de `(isDark:)`.
    static func inputBackground(isDark: Bool) -> Color {
        isDark ? Color(hex: "16142A") : Color(hex: "F5F3FF")
    }
}

struct ReportMessageSheet: View {
    let accentColor: String
    let onSubmit: (String, String?) -> Void

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @Environment(\.dismiss) private var dismiss
    @State private var selectedType: ReportType? = nil
    @State private var reason = ""
    @State private var isSubmitting = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    Text(String(localized: "report.message.title", defaultValue: "Pourquoi signalez-vous ce message ?", bundle: .main))
                        .font(.callout.weight(.semibold))
                        .foregroundColor(MeeshyColors.textPrimary(isDark: isDark))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.top, 8)

                    ForEach(ReportType.allCases) { type in
                        reportTypeRow(type)
                    }

                    if selectedType != nil {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(String(localized: "report.message.details.label", defaultValue: "Détails (facultatif)", bundle: .main))
                                .font(.footnote.weight(.medium))
                                .foregroundColor(MeeshyColors.textSecondary(isDark: isDark))

                            TextField(String(localized: "report.message.details.placeholder", defaultValue: "Décrivez le problème…", bundle: .main), text: $reason, axis: .vertical)
                                .font(.subheadline)
                                .lineLimit(3...6)
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: 12)
                                        .fill(ReportSheetPalette.inputBackground(isDark: isDark))
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 12)
                                                .stroke(MeeshyColors.textMuted(isDark: isDark).opacity(0.2), lineWidth: 1)
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
                    // Same defect as the detail-sheet submit button: while
                    // submitting, the label collapses to a bare `ProgressView`,
                    // leaving a *toolbar* control with no accessible name — the
                    // hardest kind to identify by touch exploration. Reuses the
                    // visible key, so voice and screen stay identical.
                    .accessibilityLabel(String(localized: "report.message.send", defaultValue: "Envoyer", bundle: .main))
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
                    .foregroundColor(isSelected ? accent : MeeshyColors.textSecondary(isDark: isDark))
                    .frame(width: 24)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(type.label)
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(MeeshyColors.textPrimary(isDark: isDark))
                    Text(type.description)
                        .font(.caption)
                        .foregroundColor(MeeshyColors.textSecondary(isDark: isDark))
                        .lineLimit(1)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title3)
                        .foregroundColor(accent)
                        .transition(.scale.combined(with: .opacity))
                        .accessibilityHidden(true)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? accent.opacity(0.08) : ReportSheetPalette.inputBackground(isDark: isDark))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(isSelected ? accent.opacity(0.3) : MeeshyColors.textMuted(isDark: isDark).opacity(0.1), lineWidth: 1)
                    )
            )
        }
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
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
        case .inappropriate: return String(localized: "report.message.type.inappropriate.label", defaultValue: "Contenu inapproprié", bundle: .main)
        case .harassment: return String(localized: "report.message.type.harassment.label", defaultValue: "Harcèlement", bundle: .main)
        case .violence: return String(localized: "report.message.type.violence.label", defaultValue: "Violence", bundle: .main)
        case .hate_speech: return String(localized: "report.message.type.hate_speech.label", defaultValue: "Discours haineux", bundle: .main)
        case .impersonation: return String(localized: "report.message.type.impersonation.label", defaultValue: "Usurpation d'identité", bundle: .main)
        case .other: return String(localized: "report.message.type.other.label", defaultValue: "Autre", bundle: .main)
        }
    }

    var description: String {
        switch self {
        case .spam: return String(localized: "report.message.type.spam.description", defaultValue: "Messages répétitifs ou promotionnels", bundle: .main)
        case .inappropriate: return String(localized: "report.message.type.inappropriate.description", defaultValue: "Contenu sexuel ou choquant", bundle: .main)
        case .harassment: return String(localized: "report.message.type.harassment.description", defaultValue: "Intimidation ou menaces", bundle: .main)
        case .violence: return String(localized: "report.message.type.violence.description", defaultValue: "Incitation à la violence", bundle: .main)
        case .hate_speech: return String(localized: "report.message.type.hate_speech.description", defaultValue: "Discrimination ou contenu haineux", bundle: .main)
        case .impersonation: return String(localized: "report.message.type.impersonation.description", defaultValue: "Se faire passer pour quelqu'un d'autre", bundle: .main)
        case .other: return String(localized: "report.message.type.other.description", defaultValue: "Une autre raison", bundle: .main)
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
