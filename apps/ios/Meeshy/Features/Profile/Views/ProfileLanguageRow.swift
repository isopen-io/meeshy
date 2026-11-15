import SwiftUI
import MeeshySDK
import MeeshyUI

/// Une langue du Prisme sur ma fiche : son rang, la langue choisie (drapeau et nom natif) ou ce qui manque. Elle ne
/// s'ouvre qu'en édition ; au repos, elle se lit.
struct ProfileLanguageRow: View {
    let title: String
    let subtitle: String?
    let code: String
    let isRequired: Bool
    let isEditing: Bool
    let accentHex: String
    let onPick: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Button {
            guard isEditing else { return }
            HapticFeedback.light()
            onPick()
        } label: {
            HStack(spacing: MeeshySpacing.md) {
                ProfileFieldIcon(name: "globe", accentColor: accentHex)

                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(title)
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .medium))
                        .foregroundStyle(theme.textPrimary)

                    if let subtitle, !code.isEmpty {
                        Text(subtitle)
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize))
                            .foregroundStyle(theme.textMuted)
                    }
                }

                Spacer()

                chosenLanguage

                if isEditing {
                    Image(systemName: "chevron.forward")
                        .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                        .foregroundStyle(theme.textMuted)
                        .transition(.opacity)
                }
            }
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .padding(.vertical, MeeshySpacing.smPlus)
        }
        .disabled(!isEditing)
    }

    @ViewBuilder
    private var chosenLanguage: some View {
        if let info = LanguageData.info(for: code) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Text(info.flag)
                    .font(MeeshyFont.relative(MeeshyFont.subtitleSize))
                Text(info.nativeName)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    .foregroundStyle(theme.textMuted)
            }
        } else {
            Text(isRequired
                 ? String(localized: "profile.language.choose", bundle: .main)
                 : String(localized: "profile.language.none", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
    }
}
