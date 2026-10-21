import SwiftUI
import MeeshySDK
import MeeshyUI

/// Panneau de traduction secondaire inline du détail d'un post : séparateur
/// coloré par langue, drapeau + nom, texte traduit. Extrait de
/// `PostDetailView.textZone`.
struct PostDetailSecondaryTranslationPanel: View {
    let content: String
    let code: String
    var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        let langColor = Color(hex: LanguageDisplay.colorHex(for: code))
        let display = LanguageDisplay.from(code: code)
        VStack(spacing: 0) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
                Circle().fill(langColor).frame(width: 4, height: 4)
                Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
            }
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                if let display {
                    HStack(spacing: MeeshySpacing.xs) {
                        Text(display.flag).font(.caption)
                        Text(display.name)
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(langColor)
                    }
                }
                Text(content)
                    .font(.subheadline)
                    .foregroundColor(theme.textPrimary.opacity(0.8))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, MeeshySpacing.sm)
            .padding(.horizontal, MeeshySpacing.smPlus)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(langColor.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm))
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.xsPlus)
        .transition(.opacity.combined(with: .move(edge: .top)))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(format: String(localized: "a11y.post.secondary_translation", defaultValue: "Traduction en %1$@ : %2$@", bundle: .main), display?.name ?? code, content))
    }
}
