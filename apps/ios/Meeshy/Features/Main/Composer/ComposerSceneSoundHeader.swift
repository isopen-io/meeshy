import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le bord gauche du DESSIN, remonté à qui se pose au-dessus (#5011)

/// **Ce que la carte occupe réellement, publié vers le haut.**
///
/// L'en-tête est un FRÈRE du canvas, pas un overlay : il ne peut donc pas
/// connaître la géométrie de la carte, qui dépend de la hauteur que la pile lui
/// laisse. Cette clé la lui remonte.
///
/// `max` plutôt que « le dernier gagne » : une seule vue la publie, mais une
/// réduction qui dépend de l'ORDRE de parcours donnerait une valeur instable le
/// jour où une seconde la publie.
struct ComposerSceneCardLeadingKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

// MARK: - Le son de fond, EN TÊTE de la scène (#5001, dépouillé au #5011)

/// **La note, le spectre, le crédit et la durée — sans capsule.**
///
/// > Directive porteur 2026-09-03 : « La bulle de son de fond n'a pas lieux
/// > d'être, juste la note et le spectre et la durée au dessus avec les
/// > **bordures gauches alignées à celle de la scene**. »
///
/// ## Ce que #5011 retire, et ce qu'il ne retire pas
///
/// La CAPSULE part ; le CONTENU reste, et il reste le même que celui de la
/// surface document — `ComposerSoundTraceRow` est le vocabulaire partagé. Une
/// ligne nue écrite à part aurait donné deux façons de dire le même son.
///
/// ## L'alignement, et pourquoi il ne se règle pas au padding
///
/// La carte est ajustée à son ratio et se CENTRE dans la largeur qu'on lui
/// donne. Padder de `sceneInset` alignerait sur le COULOIR — mesuré : 44 pt,
/// quand la carte commence à 65. Le bord vient donc de
/// `ComposerRailGeometry.sceneLeadingInset`, calculé sur la géométrie réelle et
/// remonté par `ComposerSceneCardLeadingKey`. C'est la leçon de #4119, appliquée
/// à l'axe horizontal : un chrome qui suit la FRAME et non le DESSIN cesse de
/// dire à quoi il s'applique.
///
/// ## Où elle vit
///
/// Dans le COULOIR, au-dessus de la carte — jamais dessus (`apps/ios/CLAUDE.md`
/// § 1, loi 6) : un son de fond ne produit aucun pixel au rendu.
struct ComposerSceneSoundHeader: View {

    /// Le fond sonore résolu par le meuble — `nil` ⇒ aucune ligne, et la scène
    /// reprend toute la hauteur. La vue ne le cherche pas : la loi « la place
    /// dit le FOND » vit dans `ComposerSoundColumn`.
    let backgroundSound: StoryAudioPlayerObject?

    /// Vrai quand un outil est ouvert : ses réglages prennent l'écran, et la
    /// trace s'efface avec le reste. La décision est celle de
    /// `ComposerSceneSoundTrace.served`, pas la nôtre.
    var toolIsOpen: Bool = false

    /// **Le bord gauche du DESSIN**, mesuré par la surface. `0` avant la
    /// première passe de mise en page — la ligne se pose alors au bord, et se
    /// recale à la frame suivante sans que rien ne saute (elle n'apparaît que
    /// lorsqu'un fond existe, donc jamais pendant l'ouverture).
    var leadingInset: CGFloat = 0

    var tint: Color = MeeshyColors.indigo400

    /// Ce que le doigt ouvre. `nil` ⇒ la ligne reste une lecture et ne
    /// s'annonce ni comme bouton ni comme activable (loi 4) — le cas d'un son
    /// EMPRUNTÉ, dont `ComposerSoundColumn.opensEditor` protège le crédit.
    var onEdit: (() -> Void)?

    /// Le RETRAIT, par appui long (#4930). `nil` ⇒ aucun menu.
    var onDelete: (() -> Void)?

    var body: some View {
        if let trace = ComposerSceneSoundTrace.served(background: backgroundSound,
                                                      toolIsOpen: toolIsOpen) {
            ligne(trace)
                .modifier(ComposerSoundDeletionMenu(supprimer: onDelete))
                .padding(.leading, leadingInset)
                .padding(.trailing, leadingInset)
                .padding(.bottom, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// **Le spectre même pour un son emprunté** — la troisième voie de #5011.
    /// #4669 retire l'onde d'un emprunt parce qu'elle prenait la place du
    /// crédit dans une CAPSULE ; en pleine largeur, les deux tiennent. Le
    /// porteur demande le spectre, le droit d'auteur demande le crédit : aucun
    /// des deux ne cède.
    @ViewBuilder
    private func ligne(_ trace: StoryAudioPlayerObject) -> some View {
        let contenu = ComposerSoundTraceRow(sound: trace,
                                            tint: tint,
                                            showsWaveformEvenWhenBorrowed: true,
                                            creditMaxWidth: nil)
            // 44 pt reste le PLANCHER même sans enclos : ce qui se touche se
            // touche, que ça porte un fond ou non (dimension 5).
            .frame(minHeight: 44, alignment: .leading)

        if let onEdit {
            Button {
                onEdit()
                HapticFeedback.light()
            } label: { contenu }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(ComposerAvatarSoundBadge.spokenLabel(trace))
                .accessibilityAddTraits(.isButton)
                .accessibilityHint(ComposerAvatarSoundBadge.editHint)
        } else {
            contenu
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(ComposerAvatarSoundBadge.spokenLabel(trace))
        }
    }
}
