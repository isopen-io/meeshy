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

    /// **La bande du couloir bas : la progression, sur toute la largeur de
    /// l'ÉCRAN** (#9577, directive porteur 2026-10-07).
    ///
    /// Elle était bornée à la largeur du CADRE et partageait sa ligne avec le
    /// son, le menu (...) et la durée : sur une vidéo 9:16, la seule ligne du
    /// plateau qu'on saisit au doigt perdait plus d'un tiers de sa course. Le
    /// son et (...) sont montés dans la colonne d'actions (`cadreTransportRail`),
    /// la durée dans la ligne d'informations ; la barre prend tout le reste.
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
    /// Tant que le player partagé n'est pas attaché à CE média, il n'y a rien à
    /// parcourir : une ligne de progression y serait un contrôle sans effet
    /// (loi 4).
    @ViewBuilder
    var transportCorridor: some View {
        if stageCorridors.transport > 0 {
            Group {
                if currentAttachmentIsActiveTrack {
                    VideoTransportControls(
                        manager: videoManager,
                        accentColor: accentColor,
                        controls: [.scrubber],
                        placement: .corridor
                    )
                } else if let scene = currentScene, scene.timeline != nil {
                    // **Une scène qui a une timeline se parcourt au doigt**
                    // (#8598) — la piste du lecteur de stories, au même couloir
                    // que la barre d'une vidéo, donc sous la même règle de
                    // chrome : elle part avec le plateau en plein cadre et sous
                    // le voile d'une ouverture.
                    // Une scène n'a pas de ligne d'informations : sa durée
                    // reste ici, discrète, au bout de sa piste.
                    HStack(spacing: MeeshySpacing.smPlus) {
                        GallerySceneScrubBar(clock: sceneClock, sceneId: scene.id, accentColor: accentColor)
                        if let duree = currentDurationLabel {
                            transportDurationLabel(duree)
                        }
                    }
                } else {
                    Color.clear
                }
            }
            .frame(maxWidth: .infinity)
            .frame(height: MediaGalleryStage.transportBandHeight)
        }
    }

    /// **Le son et (...), dans la colonne d'actions, sous « Composer »** (#9577).
    ///
    /// Ils quittent la ligne de la barre pour lui rendre sa largeur. C'est le
    /// gabarit `.rail` du transport partagé : mêmes contrôles, même moteur, même
    /// muet — la galerie ne tient toujours aucun état de son à elle.
    ///
    /// Montés seulement quand une piste est ATTACHÉE à la page : un muet sans
    /// son, une vitesse sans lecture sont des contrôles sans effet (loi 4).
    @ViewBuilder
    var cadreTransportRail: some View {
        if currentAttachmentIsActiveTrack {
            VideoTransportControls(
                manager: videoManager,
                accentColor: accentColor,
                controls: [.mute, .speed, .pip],
                placement: .rail
            )
        }
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
    ///
    /// **Une scène a SON play/pause, au même endroit** (#6709). Elle ne passe
    /// pas par le player partagé : sa lecture est la commande de la galerie
    /// (`scenePlaying`), que le player de la page descend à son canvas. Le bouton
    /// n'existe que si la scène BOUGE — sur une scène fixe, il mettrait en pause
    /// une image (loi 4).
    @ViewBuilder
    var cadreCenterPlayPause: some View {
        if let scene = currentScene {
            if scene.moves {
                GalleryScenePlayPause(isPlaying: scenePlaying, accentColor: accentColor) {
                    scenePlaying.toggle()
                }
            }
        } else if currentAttachmentIsActiveTrack {
            VideoTransportControls(
                manager: videoManager,
                accentColor: accentColor,
                controls: [.playPause],
                placement: .center,
                centerOpacity: 0.55,
                centerVisible: playPauseFade.isVisible
            )
        }
    }

    /// **Le bouton central s'efface une seconde après le début de la lecture**
    /// (#9577). Le délai et l'état sont la règle du SDK
    /// (`FullscreenPlayPauseFade`) ; cette tâche ne fait que l'attendre. Clée
    /// sur l'état : un réarmement (toucher, reprise) la relance d'elle-même.
    func fadePlayPauseAfterDelay() async {
        guard let delay = playPauseFade.fadeDelay else { return }
        try? await Task.sleep(for: .seconds(delay))
        guard !Task.isCancelled else { return }
        withAnimation(playPauseFadeAnimation) { playPauseFade = playPauseFade.fading() }
    }

    /// « Réduire les animations » : le bouton part et revient sans fondu.
    var playPauseFadeAnimation: Animation? {
        reduceMotion ? nil : .easeOut(duration: 0.25)
    }

    /// **La durée, discrète** : petite, tabulaire, faible opacité, à droite —
    /// et elle SCALE (`MeeshyFont.relative`, doctrine 82i) : seule au bout d'une
    /// ligne flexible, rien ne déborde quand elle grandit.
    private func transportDurationLabel(_ texte: String) -> some View {
        Text(texte)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold, design: .monospaced))
            .foregroundColor(MeeshyColors.mediaChromeTertiary)
            .lineLimit(1)
            .fixedSize()
            .padding(.trailing, MediaGalleryStage.gutter)
    }

    /// **La durée de la page ouverte, ou rien.** Le prédicat est le MÊME que
    /// celui qui réserve la bande (`MediaGalleryStage.carriesDuration`) : une
    /// durée nulle n'est pas une durée — un « 0:00 » FAUX est pire qu'un vide.
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
        return videoManagerPlayer != nil
            && SharedAVPlayerManager.mayMountFullscreenPlayer(surfaceMedia: att.fileUrl,
                                                              activeMedia: videoManagerActiveURL)
    }
}
