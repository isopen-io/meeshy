import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La PROGRESSION, descendue au couloir du plateau (#6162)
//
// Directive porteur 2026-09-12 : « la progression pour les vidéos et scène avec
// durée doit être en bas juste au-dessus du rail de défilement […] la durée de
// la vidéo peut être positionnée plus discrètement et le bouton pause/play plus
// transparent au centre ».
//
// Le transport vivait SUR le cadre depuis #6141, dans la même pile que la
// légende. Il en descend pour la raison qui gouverne tout le plateau : ce qui
// DÉCRIT le média reste avec lui, ce qui le PARCOURT rejoint les couloirs. Le
// rail parcourt la série ; la bande parcourt le média. Elles se suivent donc, et
// le play/pause — qui ne parcourt rien, qui COMMANDE — reste au centre de
// l'image.
//
// Fichier à part plutôt qu'une section de plus dans `+Geometry.swift` : la
// géographie du plateau et ce qui s'y rend sont deux responsabilités, et le
// fichier racine était déjà à 865 lignes sur un plafond de 1 200.

extension ConversationMediaGalleryView {

    /// **La bande du couloir bas : la progression, et la durée en petit.**
    ///
    /// ## Elle n'existe que si le LOT a un temps à montrer
    ///
    /// La condition se lit sur `stageCorridors.transport`, pas sur le média
    /// courant, et c'est délibéré : la hauteur a été réservée pour le LOT
    /// (`MediaGalleryStage.carriesDuration`). Interroger la page ici ferait
    /// apparaître et disparaître la bande pendant le glissement, à l'intérieur
    /// d'une place qui, elle, ne bouge pas — un clignotement à la place d'un
    /// saut, ce qui n'est pas mieux.
    ///
    /// ## Ce qu'elle montre dépend de ce qui JOUE
    ///
    /// Tant que le player partagé n'est pas attaché à CE média, il n'y a rien à
    /// parcourir : une ligne de progression y serait un contrôle sans effet
    /// (loi 4). Seule la durée reste — et elle vient de la pièce jointe, donc
    /// elle est lisible avant la première image décodée.
    @ViewBuilder
    var transportCorridor: some View {
        if stageCorridors.transport > 0 {
            HStack(spacing: 10) {
                if currentAttachmentIsActiveTrack {
                    // **La barre du SDK, en gabarit de couloir.** `.duration`
                    // n'entre PAS dans le jeu : ce serait la durée du PLAYER,
                    // nulle tant que l'`AVPlayerItem` n'a pas chargé ses pistes
                    // — donc « 0:00 » sur exactement la page qu'on vient
                    // d'ouvrir. La durée de la pièce jointe la remplace, à
                    // droite, et elle ne ment jamais.
                    //
                    // `.mute` est ici parce que la bande est le SEUL endroit du
                    // plateau qui porte encore cette barre : l'en retirer
                    // priverait la galerie de tout muet, et les gardes qui
                    // l'affirment (`FullscreenGallerySoundScopeGuardTests`)
                    // resteraient vertes — elles mesurent la présence du
                    // composant, pas celle de l'option.
                    VideoTransportControls(
                        manager: videoManager,
                        accentColor: accentColor,
                        controls: [.scrubber, .mute, .speed, .pip],
                        placement: .corridor
                    )
                } else {
                    Spacer(minLength: 0)
                }

                if let duree = currentDurationLabel {
                    transportDurationLabel(duree)
                }
            }
            .frame(width: currentStage.frame.width,
                   height: MediaGalleryStage.transportBandHeight)
            .frame(maxWidth: .infinity)
        }
    }

    /// **La durée, discrète** : petite, tabulaire, faible opacité, à droite.
    ///
    /// Tabulaire parce qu'elle voisine une ligne qui défile : des chiffres à
    /// chasse variable désaligneraient la fin de la bande d'une page à l'autre.
    /// Aucun `accessibilityLabel` : le texte EST la valeur, et VoiceOver lit
    /// « 0:12 » exactement comme le fait déjà le timecode du SDK — un libellé
    /// par-dessus ne ferait que répéter ce que l'élément dit.
    ///
    /// **Et elle SCALE** (`MeeshyFont.relative`, doctrine 82i). La tentation
    /// était de la figer « parce que la bande fait quarante-huit points » : cet
    /// argument vaut pour le timecode du SDK, qui compte les secondes DANS une
    /// capsule pleine de voisins. Ici la durée est seule au bout d'une ligne
    /// flexible — rien ne déborde quand elle grandit, donc rien ne justifie
    /// qu'elle ignore la personne qui a monté son Dynamic Type.
    private func transportDurationLabel(_ texte: String) -> some View {
        Text(texte)
            .font(MeeshyFont.relative(11, weight: .semibold, design: .monospaced))
            .foregroundColor(.white.opacity(0.55))
            .lineLimit(1)
            .fixedSize()
            .padding(.trailing, MediaGalleryStage.gutter)
    }

    /// **Le play/pause reste au centre du média, et devient plus transparent**
    /// (directive porteur 2026-09-12).
    ///
    /// Il ne descend pas avec la progression, et la raison mérite d'être dite :
    /// la progression RAPPORTE (où en est-on), le play/pause COMMANDE. Une
    /// commande se pose là où l'œil et le doigt sont déjà — au milieu de
    /// l'image. Aucun lecteur du marché ne la met ailleurs, et la déplacer
    /// coûterait à l'utilisateur la seule chose qu'il n'a jamais à apprendre.
    ///
    /// L'opacité est le SEUL changement de gabarit : il reste le verre prominent
    /// que le SDK lui donne, à 55 %. Un bouton opaque au centre d'une photo
    /// cache précisément ce qu'on regarde ; un bouton absent ne se retrouve pas.
    ///
    /// Les ±10 s ne sont plus là, et ce n'est pas parce que `.scrubber` a quitté
    /// le jeu : `TransportLayout.showsSkip` les refuse à tout placement autre
    /// que `.stacked`. #6163 les remplace par un geste — un bouton de plus les
    /// aurait fait revenir par la porte de derrière.
    @ViewBuilder
    var cadreCenterPlayPause: some View {
        if currentAttachmentIsActiveTrack {
            VideoTransportControls(
                manager: videoManager,
                accentColor: accentColor,
                controls: [.playPause],
                placement: .center,
                centerOpacity: 0.55
            )
        }
    }

    /// **La durée de la page ouverte, ou rien.**
    ///
    /// Le prédicat est le MÊME que celui qui réserve la bande
    /// (`MediaGalleryStage.carriesDuration`) : une durée nulle n'est pas une
    /// durée. `durationFormatted` seul rendrait « 0:00 » pour un média dont le
    /// serveur n'a pas encore calculé la durée — un chiffre FAUX est pire
    /// qu'une bande vide, parce qu'on le croit.
    var currentDurationLabel: String? {
        guard let att = currentAttachment,
              MediaGalleryStage.carriesDuration([att]) else { return nil }
        return att.durationFormatted
    }

    /// La pièce ouverte, ou `nil` si l'index a débordé — la galerie se démonte
    /// pendant que sa dernière page se re-rend, et c'est là que ce garde-fou
    /// sert.
    var currentAttachment: MessageAttachment? {
        guard currentIndex < allAttachments.count else { return nil }
        return allAttachments[currentIndex]
    }

    /// **Le player partagé joue-t-il CETTE pièce ?**
    ///
    /// Un player de processus : une page qui répondrait « oui » sans vérifier
    /// l'URL peindrait la progression d'une piste jouée par une autre surface.
    ///
    /// La condition lit les MIROIRS (`videoManagerActiveURL`,
    /// `videoManagerPlayer`) et non le manager, et ce n'est pas une commodité :
    /// c'est la seule façon de faire dépendre le RENDU de ces deux valeurs sans
    /// observer un objet qui publie `currentTime` à 5-10 Hz. `pauseActiveVideo`
    /// (`+Presentation.swift`) pose une question voisine sur le manager VIVANT
    /// — elle agit à l'instant du geste, là où un miroir d'un cycle de retard
    /// arrêterait la mauvaise piste.
    var currentAttachmentIsActiveTrack: Bool {
        guard let att = currentAttachment, att.type == .video else { return false }
        return videoManagerActiveURL == att.fileUrl && videoManagerPlayer != nil
    }
}
