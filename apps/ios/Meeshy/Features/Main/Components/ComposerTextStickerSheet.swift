import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les dix cadres, rendus avec les mots tapés (#5326)

/// **Le menu de l'appui long** (directive porteur 2026-09-06 : « affiche un
/// menu qui liste les possibles choix de sticker et leur rendu avec le
/// texte ! Lorsqu'on choisit ça envoi directement ! »).
///
/// Une FEUILLE et non un `contextMenu` : un menu système rend des libellés et
/// des symboles, jamais des dessins. Or ce qu'il y a à comparer ici EST le
/// dessin — dix cadres autour des mêmes mots. Le menu aurait montré dix lignes
/// de texte identiques.
///
/// Choisir envoie et referme, sans étape de confirmation : la vignette a déjà
/// montré le résultat, et le geste porte sa propre annulation (supprimer le
/// message envoyé) — demander « êtes-vous sûr ? » devant une image qu'on vient
/// de voir serait une friction sans information.
struct ComposerTextStickerSheet: View {

    let text: String
    let accentColor: String
    let onPick: (StickerTemplate) -> Void

    @Environment(\.dismiss) private var dismiss

    private static let previewSide: CGFloat = 104

    private var slots: [String: String] {
        [StickerSlotFiller.textSlot: text]
    }

    /// Le cadre que l'auteur emploie d'habitude en tête, le catalogue ensuite.
    private var templates: [StickerTemplate] {
        ComposerTextStickerChoice.rotation(
            recents: StickerUsageStore.shared.recents,
            favorites: StickerUsageStore.shared.favorites,
            catalog: StickerTemplateCatalog.templates(family: .text)
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3),
                          spacing: 10) {
                    ForEach(templates) { gabarit in
                        Button {
                            HapticFeedback.medium()
                            onPick(gabarit)
                            dismiss()
                        } label: {
                            StickerTemplatePreview(template: gabarit,
                                                   slots: slots,
                                                   side: Self.previewSide)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(StickerPickerView.accessibilityLabel(for: gabarit, slots: slots))
                    }
                }
                .padding(20)
            }
            .navigationTitle(String(localized: "composer.textSticker.sheet.title",
                                    defaultValue: "Envoyer dans un cadre",
                                    bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main)) {
                        dismiss()
                    }
                    .tint(Color(hex: accentColor))
                }
            }
        }
        .accessibilityIdentifier(MeeshyA11yID.composerTextStickerSheet)
    }
}
