import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La pastille du cadre à mots (#5326)

/// **L'emplacement d'envoi porte un CADRE À MOTS quand il n'y a que du texte**
/// (directive porteur 2026-09-06).
///
/// Depuis que la touche Retour envoie (`ComposerReturnKey`), le bouton rond
/// doublonnait le clavier pour un message de texte. Il devient ici la seule
/// chose que le clavier ne sait pas faire : envoyer ces mots **dessinés dans un
/// cadre**. `ComposerActionSlot` décide QUAND ; `ComposerTextStickerChoice`
/// décide LEQUEL ; cette vue ne fait que le montrer et transmettre les deux
/// gestes.
///
/// ## La vignette n'est pas une illustration
///
/// `StickerTemplatePreview` est la vignette de la palette, rendue par
/// `StickerTemplateRenderer` — le moteur qui dessinera le sticker envoyé. À
/// 44 points le texte est petit, et c'est assumé : ce que la pastille doit
/// faire reconnaître est la FORME du cadre, et ce qu'elle montre est
/// exactement ce qui partira. Une pastille peinte à part aurait dérivé du rendu
/// au premier ajustement (exigence #4110).
///
/// ## Deux gestes, et pourquoi le second est simultané
///
/// Un tap envoie ; un appui long ouvre les dix cadres. Le `Button` porte le
/// tap, l'appui long arrive en `.simultaneousGesture` : enchaîné avec
/// `.onLongPressGesture`, il aurait mangé le tap sur certaines versions d'iOS —
/// le geste le plus fréquent aurait payé pour le plus rare. VoiceOver, qui ne
/// connaît ni l'un ni l'autre, reçoit une action nommée.
struct ComposerTextStickerButton: View {

    let template: StickerTemplate
    let text: String
    let accentColor: String
    let isDark: Bool
    let onSend: () -> Void
    let onBrowse: () -> Void

    /// Le côté du dessin dans l'emplacement de 44 points — quatre points de
    /// souffle de chaque côté, pour que le cadre ne touche pas le champ.
    private static let previewSide: CGFloat = 40

    private var slots: [String: String] {
        [StickerSlotFiller.textSlot: text]
    }

    var body: some View {
        Button {
            HapticFeedback.light()
            onSend()
        } label: {
            // RONDE, comme le bouton d'envoi qu'elle remplace et comme les
            // emojis rapides qui occupent le même emplacement : trois contenus
            // pour une seule case, qui ne doivent pas changer de forme en se
            // relayant. Le clip mord sur les coins de la vignette, où le
            // dessin ne va jamais — il est centré et `scaledToFit`.
            StickerTemplatePreview(template: template,
                                   slots: slots,
                                   side: Self.previewSide)
                .clipShape(Circle())
                .overlay(
                    Circle().stroke(isDark ? Color.white.opacity(0.15)
                                           : Color(hex: accentColor).opacity(0.20),
                                    lineWidth: 1)
                )
        }
        .buttonStyle(.plain)
        .frame(width: 44, height: 44)
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.45).onEnded { _ in
                HapticFeedback.medium()
                onBrowse()
            }
        )
        .accessibilityLabel(String(localized: "composer.textSticker.label",
                                   defaultValue: "Envoyer dans le cadre",
                                   bundle: .main)
                            + " " + StickerPickerView.templateName(template.id))
        .accessibilityHint(String(localized: "composer.textSticker.hint",
                                  defaultValue: "Envoie vos mots dessinés dans ce cadre",
                                  bundle: .main))
        .accessibilityAction(named: Text(String(localized: "composer.textSticker.browse",
                                                defaultValue: "Choisir un autre cadre",
                                                bundle: .main))) {
            onBrowse()
        }
        .accessibilityIdentifier(MeeshyA11yID.composerTextSticker)
    }
}

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

    private var templates: [StickerTemplate] {
        StickerTemplateCatalog.templates(family: .text)
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
