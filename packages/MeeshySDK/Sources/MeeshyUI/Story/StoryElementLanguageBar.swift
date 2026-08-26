import SwiftUI

/// **E3 (#3888) — le contrôle « langue de l'élément » pour les objets NON-TEXTE.**
///
/// Le texte porte sa langue via la pastille de son éditeur inline
/// (`TextEditToolOptions`). Média, audio, sticker et lieu passent par cette
/// barre flottante, montée dans le ZStack du canvas comme le toolbar texte :
/// elle n'apparaît QUE quand un objet non-texte est sélectionné
/// (`selectedElementSupportsLanguage`, loi 4) et écrit par le point d'entrée
/// unique `updateElementLanguage`. Mêmes CHOIX de langue que le texte
/// (`TextEditToolOptions.languageChoices`) — jamais une liste recopiée.
struct StoryElementLanguageBar: View {
    @ObservedObject var viewModel: StoryComposerViewModel

    var body: some View {
        if viewModel.selectedElementSupportsLanguage, let elementId = viewModel.selectedElementId {
            let current = viewModel.selectedElementSourceLanguage
            VStack(spacing: 0) {
                Spacer()
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        Image(systemName: "globe")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.secondary)
                        ForEach(TextEditToolOptions.languageChoices(current: current), id: \.self) { code in
                            chip(code, current: current, elementId: elementId)
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                }
                .background(.ultraThinMaterial, in: Capsule())
                .padding(.horizontal, 16)
                .padding(.bottom, 96)
                .accessibilityElement(children: .contain)
                .accessibilityLabel(Text(String(
                    localized: "composer.element.language",
                    defaultValue: "Langue de l'élément", bundle: .module)))
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private func chip(_ code: String, current: String?, elementId: String) -> some View {
        let isSel = TextEditToolOptions.normalisedCode(current) == code
        return Button {
            viewModel.updateElementLanguage(elementId: elementId, language: code)
            HapticFeedback.light()
        } label: {
            Text(code.uppercased())
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(isSel ? Color.white : Color.primary)
                .frame(minWidth: 38, minHeight: 30)
                .padding(.horizontal, 4)
                .background(
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isSel ? AnyShapeStyle(MeeshyColors.brandGradient)
                                    : AnyShapeStyle(Color.gray.opacity(0.18)))
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Locale.current.localizedString(forLanguageCode: code) ?? code)
        .accessibilityAddTraits(isSel ? [.isSelected] : [])
    }
}
