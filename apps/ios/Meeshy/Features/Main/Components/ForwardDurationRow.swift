import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - ForwardDurationRow

/// **La rangée de durée d'une flamme transférée** (#9573) — la copie d'un
/// message qui disparaît dure AU PLUS autant que sa source : la durée de la
/// source est présélectionnée, seuls les paliers inférieurs ou égaux sont
/// offerts (`ContentExitLaw.ForwardVerdict.durationChoices`). Sans choix, la
/// rangée n'est pas montée.
///
/// Sous-vue `Equatable` à entrées de VALEUR, comme `ForwardPickerRow` : une
/// cible qui passe `sending` → `sent` ne la réévalue pas.
struct ForwardDurationRow: View, Equatable {
    let choices: [ForwardDurationChoice]
    let selectedSeconds: Int?
    let accentHex: String
    let isDark: Bool
    let onSelect: (Int) -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    static func == (lhs: ForwardDurationRow, rhs: ForwardDurationRow) -> Bool {
        lhs.choices == rhs.choices
            && lhs.selectedSeconds == rhs.selectedSeconds
            && lhs.accentHex == rhs.accentHex
            && lhs.isDark == rhs.isDark
    }

    /// La durée DITE par VoiceOver, dans la langue du système : « 30 secondes ».
    nonisolated static func spokenDuration(seconds: Int) -> String {
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = [.hour, .minute, .second]
        formatter.unitsStyle = .full
        return formatter.string(from: TimeInterval(seconds)) ?? ForwardDurationChoice(seconds: seconds).label
    }

    private var title: String {
        String(localized: "forward.duration.title", defaultValue: "Disparaît après", bundle: .main)
    }

    var body: some View {
        if !choices.isEmpty {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                Label(title, systemImage: "flame")
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .accessibilityAddTraits(.isHeader)

                // Défilement horizontal : aux tailles Dynamic Type accessibles,
                // six paliers dépassent la largeur d'un iPhone.
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: MeeshySpacing.sm) {
                        ForEach(choices) { choice in
                            chip(choice)
                        }
                    }
                    .padding(.vertical, 1)
                }

                Text(String(
                    localized: "forward.duration.note",
                    defaultValue: "La copie disparaît au plus tard après la durée du message d’origine, et ne pourra pas être transférée à son tour.",
                    bundle: .main
                ))
                .font(MeeshyFont.relative(MeeshyFont.smallSize))
                .foregroundColor(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.sm)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(MeeshyColors.surfaceFill(isDark: isDark))
        }
    }

    private func chip(_ choice: ForwardDurationChoice) -> some View {
        let isSelected = choice.seconds == selectedSeconds
        let spoken: String = [title, Self.spokenDuration(seconds: choice.seconds)].joined(separator: ", ")
        return Button {
            onSelect(choice.seconds)
        } label: {
            Text(choice.label)
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: isSelected ? .semibold : .medium))
                .foregroundColor(isSelected ? .white : Color(hex: accentHex))
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                .background(
                    Capsule().fill(isSelected ? Color(hex: accentHex) : Color(hex: accentHex).opacity(MeeshyOpacity.light))
                )
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(spoken)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}
