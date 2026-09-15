import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - L'ORCHESTRATION du plein cadre
//
// Le type d'état et ses transitions vivent au SDK (`StagePresentation`,
// `MediaStageGestures`) : ce sont des règles sans état, et quatre autres
// surfaces devront les partager (spec § 4, lots 2 à 7). Ce fichier-ci porte ce
// qui est propre à CETTE galerie — quand franchir la porte, ce qu'il faut
// mettre en pause, ce que la pastille annonce — c'est-à-dire exactement ce que
// la règle de pureté du SDK laisse app-side.
//
// Sorti du fichier racine (995 lignes au moment de l'écrire) parce que
// l'orchestration est une responsabilité à elle, pas parce qu'il fallait faire
// de la place : le budget en laissait.

extension ConversationMediaGalleryView {

    /// **La seule écriture de l'état d'immersion.**
    ///
    /// Un geste dit par quelle PORTE il passe ; la loi dit ce qu'elle produit.
    /// Aucun site d'appel ne compose lui-même un `StagePresentation` : deux
    /// écritures parallèles rendraient la distinction des portes indécidable
    /// dès la première divergence.
    ///
    /// Trois choses partent avec la bascule, et chacune pour sa raison :
    ///
    /// - la **traînée d'émojis se referme** en entrant. Elle flotte au-dessus du
    ///   bloc bas, qui n'existe plus en plein cadre — l'y laisser poserait une
    ///   rangée de contrôles sur un média que l'on vient précisément de mettre
    ///   à nu. C'est le contrat que `toggleControls` tenait déjà, repris ici
    ///   sans changement.
    /// - la **pause** n'est demandée que par la porte qui la promet, et elle
    ///   s'adresse au player PARTAGÉ : personne d'autre ne sait quelle piste
    ///   joue réellement.
    /// - l'**animation** est portée par cette transaction et non par la racine :
    ///   posée plus haut, elle installerait une transaction animée sur tout
    ///   l'arbre, pager compris.
    func onEnterStage(_ door: StageEntry) {
        let next = stagePresentation.after(door)

        /*
         **LE TRANSPORT S'APPLIQUE AVANT LE COURT-CIRCUIT DE CADRAGE.**

         `guard next != stagePresentation` protège l'ANIMATION : rejouer une
         transition vers l'état courant ferait clignoter le plateau pour rien.
         Mais il avalait aussi la commande de LECTURE, et c'est ce qui rendait
         l'appui long muet une fois en plein cadre : `after(.longPress)` y rend
         `.full(pausedOnEntry: true)`, c'est-à-dire l'état courant — donc retour
         immédiat, sans avoir rien pausé ni repris. Le lecteur ne pouvait
         reprendre que par le bouton central (retour porteur 2026-09-13 :
         « appui long permet de faire pause et D'ENLEVER LA PAUSE sans quitter
         le plein écran »).

         > Un court-circuit posé pour une raison en sert souvent une seconde à
         > son insu. Ici, « ne pas rejouer l'animation » avait fini par vouloir
         > dire « ne rien faire du tout ».

         La commande de lecture est donc lue et appliquée d'abord ; le retour
         anticipé ne gouverne plus que le cadrage. Le retour haptique suit le
         GESTE, pas la transition : un appui long qui bascule la lecture sans
         changer de cadre doit se sentir.
        */
        applyTransport(StagePresentation.transportIntent(for: door, from: stagePresentation))

        guard next != stagePresentation else {
            if door == .longPress { HapticFeedback.light() }
            return
        }

        if next.isFull, reactionBarOpen { reactionBarOpen = false }
        HapticFeedback.light()

        withAnimation(.easeInOut(duration: 0.25)) { stagePresentation = next }
    }

    /// Applique ce que la porte commande — et rien d'autre.
    ///
    /// **Une scène se commande par la GALERIE, pas par le player partagé**
    /// (#6709). Sa lecture est `scenePlaying`, que le player de la page descend à
    /// son canvas ; l'appui long l'arrête en entrant et la bascule une fois
    /// dedans (`GalleryScenePlayback`), exactement comme il le fait d'une vidéo.
    /// Une scène FIXE n'a rien à arrêter : la commande reste où elle est.
    ///
    /// Pour une vidéo, `pauseActiveVideo()` porte déjà la garde qui compte : ne
    /// toucher au player que si la piste active est bien celle de cette page. La
    /// bascule la reprend telle quelle, sans quoi reprendre depuis la galerie
    /// relancerait la lecture d'une AUTRE surface (le feed, une bulle, une
    /// image-dans-l'image).
    func applyTransport(_ intent: StageTransportIntent) {
        if let scene = currentScene {
            guard scene.moves else { return }
            scenePlaying = GalleryScenePlayback.playing(after: intent, isPlaying: scenePlaying)
            return
        }
        switch intent {
        case .none:
            return
        case .pause:
            pauseActiveVideo()
        case .togglePlayback:
            guard currentIndex < allAttachments.count else { return }
            let attachment = allAttachments[currentIndex]
            guard attachment.type == .video,
                  videoManager.activeURL == attachment.fileUrl else { return }
            videoManager.togglePlayPause()
        }
    }

    /// **L'appui long met en pause ce qui JOUE, jamais ce qui est à l'écran.**
    ///
    /// Le player est partagé par tout le processus : une page qui pauserait sans
    /// vérifier que la piste active est bien la sienne arrêterait la lecture
    /// d'une autre surface — le feed, une bulle, une image-dans-l'image.
    func pauseActiveVideo() {
        guard currentIndex < allAttachments.count else { return }
        let attachment = allAttachments[currentIndex]
        guard attachment.type == .video,
              videoManager.activeURL == attachment.fileUrl else { return }
        videoManager.pause()
    }

    /// **Y a-t-il seulement quelque chose à arrêter ?** La question que la
    /// pastille pose avant de s'afficher : au-dessus d'une photo — ou d'une
    /// scène fixe —, « en pause » annoncerait l'arrêt de rien.
    var currentMediaIsPlayable: Bool {
        if let scene = currentScene { return scene.moves }
        guard currentIndex < allAttachments.count else { return false }
        return allAttachments[currentIndex].type == .video
    }

    /// **Ce qui rend `pausedOnEntry` visible** (#6142, spec § 3.2).
    ///
    /// Sans elle, l'appui long et le glissement produiraient exactement le même
    /// écran, et la distinction des deux portes ne serait qu'un champ dans un
    /// `enum` — la définition d'un état décoratif.
    ///
    /// La couche ne teste aucune touche : la pastille ANNONCE, elle ne commande
    /// pas. Reprendre la lecture se fait par le play/pause du cadre, qu'un tap
    /// ramène (`cadreCenterPlayPause`, `+Transport.swift`, #6162) ; poser ici un
    /// second play/pause ferait deux contrôleurs pour une seule lecture, au
    /// MÊME endroit de l'écran — le défaut que le poster central de la page
    /// vidéo a déjà coûté une fois.
    ///
    /// L'état de lecture est celui de ce qui est OUVERT : la commande de la
    /// galerie pour une scène (#6709), le player partagé pour une vidéo.
    @ViewBuilder
    var pausedBadgeLayer: some View {
        if MediaStagePause.showsBadge(presentation: stagePresentation,
                                      isPlayable: currentMediaIsPlayable,
                                      isPlaying: currentScene != nil ? scenePlaying : videoManagerIsPlaying) {
            MediaStagePausedBadge()
                .allowsHitTesting(false)
                .transition(.opacity.combined(with: .scale(scale: 0.9)))
        }
    }
}

// MARK: - La pastille « en pause »

/// **Ce que l'appui long a promis, dit à voix haute.**
///
/// Elle se pose au centre du média — là où l'œil est déjà, et là où aucun
/// couloir ne la dispute puisqu'ils n'existent plus. Le verre plutôt qu'un
/// aplat : la pastille flotte sur une image dont on ne connaît ni la couleur ni
/// la luminosité, et c'est le matériau que le reste du chrome emploie pour
/// exactement cette raison.
struct MediaStagePausedBadge: View {
    var body: some View {
        HStack(spacing: 8) {
            // Le glyphe SUIT le texte, il ne se fige pas — et la doctrine 82i
            // ne le couvre pas : elle autorise une taille figée quand un CADRE
            // FIXE déborderait en scalant. Ici la capsule est dimensionnée par
            // son contenu (deux paddings autour du `HStack`), donc rien ne peut
            // déborder ; un glyphe figé à côté d'un texte relatif se contenterait
            // de rapetisser à vue d'œil dès que la personne monte son Dynamic
            // Type. Les deux montent ensemble. Il dit l'état, le texte le nomme,
            // et VoiceOver lit le second.
            Image(systemName: "pause.fill")
                .font(MeeshyFont.relative(15, weight: .bold))
                .accessibilityHidden(true)
            Text(String(localized: "media.stage.paused",
                        defaultValue: "En pause",
                        bundle: .main))
                .font(MeeshyFont.relative(14, weight: .semibold))
        }
        .foregroundColor(.white)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .adaptiveGlass(in: Capsule())
        .accessibilityElement(children: .combine)
    }
}
