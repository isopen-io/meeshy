import SwiftUI
import MeeshyUI

/// **Les quatre emphases à portée de doigt** (#7849) — la barre qui paraît
/// au-dessus du champ dès qu'un mot est SÉLECTIONNÉ. Gras, italique,
/// souligné, barré, et rien d'autre : le reste du markdown (titres, listes,
/// citations, code) se tape mais ne s'offre pas. Miroir de
/// `ComposerFormatBar` (`apps/web/src/components/composer-format-bar.tsx`).
///
/// Chaque bouton se DESSINE dans son style (un « B » gras, un « S » barré) :
/// c'est l'étiquette qu'un traitement de texte a apprise à l'utilisateur.
struct ComposerFormatBar: View {
    let accent: Color
    let onFormat: (ComposerTextFormat.Style) -> Void

    var body: some View {
        HStack(spacing: 6) {
            ForEach(ComposerTextFormat.Style.allCases, id: \.self) { style in
                Button {
                    HapticFeedback.light()
                    onFormat(style)
                } label: {
                    letter(style)
                        .frame(width: 44, height: 36)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(accent.opacity(0.12))
                        )
                }
                .buttonStyle(.plain)
                .accessibilityLabel(label(style))
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "composer.format.bar", defaultValue: "Mise en forme", bundle: .main))
    }

    @ViewBuilder
    private func letter(_ style: ComposerTextFormat.Style) -> some View {
        switch style {
        case .bold:
            Text(verbatim: "B").font(.body.weight(.heavy))
        case .italic:
            Text(verbatim: "I").font(.system(.body, design: .serif).italic())
        case .underline:
            Text(verbatim: "U").font(.body).underline()
        case .strikethrough:
            Text(verbatim: "S").font(.body).strikethrough()
        }
    }

    private func label(_ style: ComposerTextFormat.Style) -> String {
        switch style {
        case .bold: return String(localized: "composer.format.bold", defaultValue: "Gras", bundle: .main)
        case .italic: return String(localized: "composer.format.italic", defaultValue: "Italique", bundle: .main)
        case .underline: return String(localized: "composer.format.underline", defaultValue: "Souligné", bundle: .main)
        case .strikethrough: return String(localized: "composer.format.strikethrough", defaultValue: "Barré", bundle: .main)
        }
    }
}
