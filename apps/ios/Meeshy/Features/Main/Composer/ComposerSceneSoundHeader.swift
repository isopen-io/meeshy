import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le son de fond, AU-DESSUS de la scène (#5001)

/// **La note et le détail du son de fond, en tête de la scène.**
///
/// > Directive porteur 2026-09-03 : « il faut ajouter au dessus de la scene une
/// > note suivi du detail de l'audio de fond d'une scene doit être mise et au
/// > touché ouvrir la feuille permettant de l'editer. »
///
/// ## Ce que ce lot DÉPLACE, et ce qu'il ne refait pas
///
/// La trace existait déjà (#4918) : la capsule `ComposerAvatarSoundBadge`, avec
/// sa note ♪, l'onde d'un enregistrement, le titre et le crédit d'un emprunt, sa
/// durée, sa feuille d'édition au doigt (#4668) et son retrait par appui long
/// (#4930). Elle vivait SOUS la scène, au niveau SLIDE de l'escalier du bas.
/// Ce lot ne compose donc pas une seconde capsule — deux capsules pour un même
/// objet auraient été deux vocabulaires — il change sa PLACE.
///
/// ## Pourquoi au-dessus, et ce que cela amende
///
/// L'escalier du bas descend les niveaux du modèle : l'objet (les rails), la
/// SCÈNE, la SLIDE, la PUBLICATION. Le son de fond y occupait la marche SLIDE,
/// et l'ordre était cohérent — c'est pour cela qu'il faut dire ce qui change.
///
/// **Un son de fond n'est pas un réglage qu'on va chercher : c'est un ÉTAT de la
/// scène.** Il commence avec elle, il dure autant qu'elle, et il n'apparaît sur
/// aucun de ses pixels — donc rien dans la scène ne le rappelle. Sous la carte,
/// il partageait la place avec la description, la bande d'outil et les jetons
/// d'objet, et se lisait en dernier ; au-dessus, il se lit AVEC la scène, comme
/// un titre se lit avec ce qu'il titre.
///
/// Ce que ce déplacement ne change pas : la capsule reste dans le COULOIR du
/// plateau, jamais sur le canvas (`apps/ios/CLAUDE.md` § 1, loi 6). Un son de
/// fond ne produit aucun pixel au rendu ; l'afficher sur la carte ferait mentir
/// l'aperçu.
struct ComposerSceneSoundHeader: View {

    /// Le fond sonore résolu par le meuble — `nil` ⇒ aucune ligne, et la scène
    /// reprend toute la hauteur. La vue ne le cherche pas : la loi qui dit
    /// « la place dit le FOND, un son de CONTENU n'y paraît jamais » vit dans
    /// `ComposerSoundColumn`, et une seconde lecture divergerait d'elle.
    let backgroundSound: StoryAudioPlayerObject?

    /// Vrai quand un outil est ouvert : ses réglages prennent l'écran, et la
    /// trace s'efface avec le reste de ce qui n'est pas l'outil. La décision
    /// est celle de `ComposerSceneSoundTrace.served`, pas la nôtre.
    var toolIsOpen: Bool = false

    var tint: Color = MeeshyColors.indigo400

    /// Ce que le doigt ouvre — la feuille d'édition du son de fond. `nil` ⇒ la
    /// capsule reste une lecture (loi 4).
    var onEdit: (() -> Void)?

    /// Le RETRAIT, par appui long (#4930). `nil` ⇒ aucun menu : c'est le cas
    /// d'un fond LEGACY, que le meuble synthétise et qui n'a aucun objet à
    /// supprimer.
    var onDelete: (() -> Void)?

    var body: some View {
        if let trace = ComposerSceneSoundTrace.served(background: backgroundSound,
                                                      toolIsOpen: toolIsOpen) {
            ComposerAvatarSoundBadge(sound: trace, tint: tint, onTap: onEdit)
                .modifier(ComposerSoundDeletionMenu(supprimer: onDelete))
                .padding(.horizontal, 16)
                .padding(.bottom, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
