import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La page SCÈNE du plein écran (#6709)
//
// Directive porteur 2026-09-15 : « lorsqu'on ouvre les scènes de poste, on doit
// utiliser LE même composant qu'on utilise pour afficher les attachements de
// conversation ! ».
//
// Une scène de post s'ouvrait dans un second plein écran, `SocialSceneFullscreenView`,
// qui n'avait ni cadre, ni plein cadre au toucher (#6694), ni couloirs pour ses
// contrôles (#6695), ni pellicule, ni « Répondre ». La galerie avait tout cela :
// la scène y devient une PAGE, à côté des pages image et vidéo, et elle hérite
// du plateau au lieu de le réécrire.
//
// Fichier à part plutôt qu'une section de plus dans `+Pages.swift` (858 lignes) :
// la page scène a son moteur (le player), sa loi de lecture et sa légende
// traduisible, et le fichier des pages média dépasserait le seuil de 1 000.

/// **Une page scène, PROPRIÉTAIRE de ce qui ne concerne qu'elle.**
///
/// Elle ne peint rien elle-même : `MeeshyScenePlayer(mode: .reader)` est le
/// moteur unique de rendu d'un canvas — le même que la carte du fil monte en
/// `.card` et que le viewer de story monte en `.reader`. Elle pose ce moteur
/// dans le CADRE du solveur, à la taille `stage.media` que le solveur a ajustée
/// au rapport de la scène, et elle répond aux trois portes du plateau (#6142)
/// exactement comme ses sœurs image et vidéo : le tap, l'appui long, le
/// glissement.
///
/// `Equatable` et montée en `.equatable()`, pour la raison que la galerie écrit
/// en tête de son fichier : une réévaluation de la racine ne re-rend que les
/// pages dont la position relative a changé.
struct GalleryScenePage: View, Equatable {
    let item: GallerySceneItem
    /// Le cadre de cette page — voir `GalleryImagePage.stage` (#6141).
    let stage: MediaStageFraming.Result
    /// Voir `GalleryImagePage.presentation` (#6142).
    let presentation: StagePresentation
    let accentColor: String
    /// Le Prisme du LECTEUR, servi aux textes de la scène. Vide ⇒ les textes
    /// originaux, licite mais jamais souhaitable.
    let preferredContentLanguages: [String]
    let isActive: Bool
    /// La commande de lecture de la galerie. Seule la page ACTIVE la suit : les
    /// voisines, montées pour la fluidité du glissement, restent en pause —
    /// sans quoi deux pistes sonneraient à la fois.
    let isPlaying: Bool
    /// Dans la fenêtre de rendu (`GalleryRenderWindow`) : le player est monté.
    /// Hors fenêtre, un aperçu léger — trois canvas vivants au plus, quel que
    /// soit le nombre de scènes traversées.
    let rendersPlayer: Bool
    /// La scène par laquelle on est ENTRÉ — la seule qui reprend la position que
    /// la carte du fil a léguée (#6580). Une scène rejointe au glissement n'a
    /// jamais été jouée : elle commence.
    let isEntry: Bool
    let accessibilityLabel: String
    let onEnterStage: (StageEntry) -> Void
    let onDismiss: () -> Void

    static func == (lhs: GalleryScenePage, rhs: GalleryScenePage) -> Bool {
        lhs.item == rhs.item
            && lhs.stage == rhs.stage
            && lhs.presentation == rhs.presentation
            && lhs.accentColor == rhs.accentColor
            && lhs.preferredContentLanguages == rhs.preferredContentLanguages
            && lhs.isActive == rhs.isActive
            && lhs.isPlaying == rhs.isPlaying
            && lhs.rendersPlayer == rhs.rendersPlayer
            && lhs.isEntry == rhs.isEntry
            && lhs.accessibilityLabel == rhs.accessibilityLabel
    }

    /// Décalage de fermeture, LOCAL à la page (cf. `GalleryImagePage`).
    @State private var offset: CGSize = .zero
    /// **La seconde à laquelle la scène d'entrée s'OUVRE** (#6580) — un
    /// instantané lu une fois, à l'apparition, jamais un fil : la mémoire
    /// continue de s'écrire pendant qu'on regarde, et la relire à chaque rendu
    /// ferait recaler la lecture en boucle.
    @State private var openingPosition: Double = 0
    /// La position est lue : la lecture peut partir. Sans ce verrou, le player
    /// jouerait depuis zéro le temps d'une passe, puis sauterait à la position
    /// léguée — un hoquet audible sur un fond sonore.
    @State private var openingResolved = false

    private static let dismissThreshold: CGFloat = 150
    /// Aperçu hors fenêtre : la VIGNETTE, décodée à une taille modeste — même
    /// budget que `GalleryImagePage.previewSize`.
    private static let previewSize = CGSize(width: 320, height: 320)

    /// **En plein cadre, le canvas COUVRE le viewport** (#6806, directive porteur
    /// 2026-09-16 : « il faut pas afficher une troisieme couche en plein plein
    /// écran, mais juste agrandir le canvas à sa taille total du viewport »).
    ///
    /// La décision est ICI et pas dans le solveur, et c'est tout le lot : une
    /// page SAIT ce qu'elle porte. `GalleryImagePage` porte le CONTENU d'un
    /// message — le rogner retirerait ce que l'expéditeur a envoyé, et son
    /// hors-champ habillé est une finition. Cette page-ci porte une SURFACE DE
    /// COMPOSITION, dont les bords ne sont à personne : la laisser en boîte aux
    /// lettres peint une surface que nul n'a composée.
    ///
    /// Faire trancher cela au solveur a été essayé et mesuré au simulateur : les
    /// médias de post se posaient EN HAUT À GAUCHE, à leurs cotes cardées. Le
    /// solveur ne sait pas ce qu'il cadre ; cette page, si.
    private var canvasCoverScale: CGFloat {
        guard presentation.isFull else { return 1 }
        return MediaStageFraming.coverScale(frame: stage.frame, media: stage.media)
    }

    /// Le canvas couvre-t-il déjà tout le cadre ? Alors plus rien à habiller —
    /// ni le sol du visualiseur, ni le hors-champ du canvas. **Les deux
    /// disparaissent ENSEMBLE**, parce qu'une seule des deux qui resterait serait
    /// la même bande peinte par l'autre main.
    private var canvasCovers: Bool { canvasCoverScale > 1.0001 }

    var body: some View {
        ZStack {
            if !canvasCovers {
                MediaStageBackdrop(
                    source: MediaGalleryStage.backdrop(stage: stage, thumbHash: item.thumbHash)
                )
            }

            if rendersPlayer {
                player
            } else {
                preview
            }
        }
        .frame(width: stage.frame.width, height: stage.frame.height)
        .clipShape(RoundedRectangle(cornerRadius: stage.cornerRadius, style: .continuous))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .contentShape(Rectangle())
        // **Le tap franchit la porte du plein cadre, et en revient** (#6142,
        // #6694). En lecture, le canvas ne RECONNAÎT aucun geste de manipulation
        // (`StoryCanvasUIView.gestureRecognizerShouldBegin`) : le doigt reste au
        // conteneur, qui répond comme celui des pages image et vidéo.
        .onTapGesture { onEnterStage(.tap) }
        .offset(y: offset.height)
        // `isActive` désarme les pages VOISINES — la raison est écrite au SDK
        // (`MediaStageGestures.longPressArmed`) et reprise par la page vidéo.
        .gesture(stageDragGesture, including: isActive ? .all : .none)
        // Une scène n'a ni zoom ni déplacement : rien ne dispute le doigt à
        // l'appui long. Le dire par le paramètre laisse la MÊME règle répondre
        // pour les trois natures.
        .gesture(longPressGesture,
                 including: MediaStageGestures.longPressArmed(isActive: isActive,
                                                              isTransformed: false) ? .all : .none)
        .onAppear(perform: resolveOpening)
    }

    /// **Le player, à la taille que le solveur a ajustée au rapport de la scène.**
    ///
    /// La taille est posée en dur depuis `stage.media`, jamais par un
    /// `.aspectRatio` : c'est la leçon de `GalleryImagePage` (« la taille vient
    /// du solveur ») — le cadre proposé a exactement le rapport de la scène, donc
    /// le canvas le remplit sans rogner ni déformer.
    private var player: some View {
        MeeshyScenePlayer(
            document: item.document,
            mode: .reader,
            sceneIndex: .constant(item.sceneIndex),
            isPlaying: .constant(isPlaying && isActive && openingResolved),
            accentColorHex: accentColor,
            carrier: item.carrier,
            preferredContentLanguages: preferredContentLanguages,
            startAt: isEntry ? openingPosition : 0,
            // **La bande INTERNE du canvas s'éteint avec la troisième couche**
            // (#6806). Le paramètre existe depuis #6636 ; sans lui, le canvas
            // continuerait de peindre et de composer son propre hors-champ —
            // invisible sous le rognage, payé à chaque image.
            servesLetterboxFill: !canvasCovers
        )
        // **La taille COUVRANTE, pas un `scaleEffect`** (#6806).
        //
        // Deux façons d'agrandir, et elles ne rendent pas la même image. Un
        // `scaleEffect` compose le canvas à 402 × 714,7 puis étire la COUCHE de
        // 22 % : un texte de scène y perd ses arêtes, une vidéo y gagne du flou.
        // Une taille plus grande, elle, redescend jusqu'au canvas, qui projette
        // ses éléments depuis des coordonnées normalisées et les compose donc à
        // la résolution de l'écran.
        //
        // Poser `stage.frame` tel quel ne fermerait RIEN : le canvas garde des
        // bornes intrinsèques 9:16 (`CanvasGeometry.aspectFitSize`) et se
        // recentrerait dedans, bandes comprises — simplement peintes par sa
        // propre passe de letterbox au lieu du backdrop. La troisième couche
        // aurait changé de main, pas disparu. Ce qu'il faut est la taille que la
        // couverture demande ; le `clipShape` du cadre, une couche plus haut,
        // rogne ce qui dépasse.
        .frame(width: stage.media.width * canvasCoverScale,
               height: stage.media.height * canvasCoverScale)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(accessibilityLabel)
    }

    /// Hors fenêtre de rendu, JAMAIS un canvas : c'est ce qui borne le nombre de
    /// scènes vivantes, et avec elles les vidéos décodées et les pistes montées.
    private var preview: some View {
        ProgressiveCachedImage(
            thumbHash: item.thumbHash,
            thumbnailUrl: item.thumbnailURL,
            fullUrl: item.thumbnailURL,
            targetSize: Self.previewSize
        ) {
            Color.black
        }
        .aspectRatio(contentMode: .fill)
        // **L'aperçu suit la même couverture que le player** (#6806) : sans quoi
        // traverser trois scènes au glissement ferait battre l'écran entre une
        // vignette bordée de bandes et un canvas qui les ferme — un défaut qu'on
        // ne voit qu'EN MOUVEMENT, donc jamais dans une capture.
        .frame(width: stage.media.width * canvasCoverScale,
               height: stage.media.height * canvasCoverScale)
        .clipped()
        .accessibilityHidden(true)
    }

    private func resolveOpening() {
        guard !openingResolved else { return }
        if isEntry {
            openingPosition = ScenePlaybackPositions.shared.position(
                for: ScenePlaybackPositions.key(carrierId: item.postId, sceneIndex: item.sceneIndex)
            ) ?? 0
        }
        openingResolved = true
    }

    /// **Le bas ferme, le haut ouvre le plein cadre** (#6142) — la règle du
    /// SDK, au même seuil que les pages image et vidéo : les trois natures ne
    /// peuvent pas répondre différemment au même geste.
    private var stageDragGesture: some Gesture {
        DragGesture(minimumDistance: 30)
            .onChanged { value in
                guard resolveDrag(value.translation) != .ignored else { return }
                offset = CGSize(width: 0, height: value.translation.height)
            }
            .onEnded { value in
                switch resolveDrag(value.translation) {
                case .dismisses:
                    onDismiss()
                case .entersFull:
                    withAnimation(.spring()) { offset = .zero }
                    onEnterStage(.swipeUp)
                case .follows, .ignored:
                    withAnimation(.spring()) { offset = .zero }
                }
            }
    }

    private func resolveDrag(_ translation: CGSize) -> MediaStageGestures.DragOutcome {
        MediaStageGestures.resolveDrag(translation: translation,
                                       presentation: presentation,
                                       threshold: Self.dismissThreshold)
    }

    private var longPressGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.4, maximumDistance: 10)
            .onEnded { _ in onEnterStage(.longPress) }
    }
}

// MARK: - Le play/pause d'une scène

/// **Le play/pause d'une scène, au centre du cadre** — là où la galerie pose
/// celui d'une vidéo (#6162), au même gabarit : verre prominent, 55 %.
///
/// Il ne pilote rien lui-même : il bascule la commande de la galerie, que le
/// player descend à l'hôte canvas, dont `setPaused` gèle EN BLOC la vidéo de
/// fond, chaque piste d'avant-plan, le mixeur (son de fond compris) et
/// l'horloge des animations. Une seule pause, pas une par média.
///
/// **Il n'existe que si la scène BOUGE** (`GallerySceneItem.moves`) : sur une
/// scène fixe il mettrait en pause une image (loi 4).
///
/// Le glyphe suit le texte (`MeeshyFont.relative`) et le cercle suit le glyphe
/// (`UIFontMetrics`) : aucune taille figée, donc rien qui déborde ni rapetisse
/// quand la personne monte son Dynamic Type.
struct GalleryScenePlayPause: View {
    let isPlaying: Bool
    let accentColor: String
    let onToggle: () -> Void

    var body: some View {
        Button {
            HapticFeedback.light()
            onToggle()
        } label: {
            Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                .font(MeeshyFont.relative(28, weight: .bold))
                .foregroundColor(.white)
                .offset(x: isPlaying ? 0 : 2)
                .frame(width: UIFontMetrics.default.scaledValue(for: 64),
                       height: UIFontMetrics.default.scaledValue(for: 64))
                .adaptiveGlassProminent(in: Circle(), tint: Color(hex: accentColor).opacity(0.85))
        }
        .opacity(0.55)
        // **L'annonce SUIT l'état** : un libellé figé ferait dire « Lecture » à
        // un bouton qui met en pause.
        .accessibilityLabel(isPlaying
            ? String(localized: "scene.fullscreen.pause",
                     defaultValue: "Tout mettre en pause", bundle: .main)
            : String(localized: "scene.fullscreen.play",
                     defaultValue: "Tout reprendre", bundle: .main))
    }
}

// MARK: - La scène ouverte

extension ConversationMediaGalleryView {

    /// **La page d'une scène**, construite ici plutôt que dans le fichier racine
    /// (1 020 lignes) : tout ce qu'elle lit est déjà visible des extensions. La
    /// fermeture vient de l'appelant — `dismissGallery()` arrête aussi la piste
    /// vidéo, et elle est privée au fichier racine.
    func scenePage(_ scene: GallerySceneItem,
                   attachment: MessageAttachment,
                   distance: Int,
                   onDismiss: @escaping () -> Void) -> some View {
        GalleryScenePage(
            item: scene,
            stage: stage(for: attachment),
            presentation: stagePresentation,
            accentColor: accentColor,
            preferredContentLanguages: sceneContext?.playerLanguages ?? [],
            isActive: distance == 0,
            isPlaying: scenePlaying,
            rendersPlayer: GalleryRenderWindow.rendersFullPixels(distance: distance),
            isEntry: attachment.id == startAttachmentId,
            accessibilityLabel: sceneAccessibilityLabel(attachment),
            onEnterStage: { onEnterStage($0) },
            onDismiss: onDismiss
        )
        .equatable()
    }

    /// **La scène de la page OUVERTE, ou `nil`** — la seule question que le
    /// transport, la pastille, le menu et le play/pause posent à la nature d'une
    /// page (#6709). Elle se lit sur `sceneContext`, jamais sur le MIME de la
    /// pièce synthétique.
    var currentScene: GallerySceneItem? {
        currentAttachment.flatMap { sceneContext?.scenes[$0.id] }
    }

    /// **Ce que VoiceOver dit d'une page scène** : sa légende quand elle en a
    /// une, sinon « Scène partagée par … » — la page ne doit jamais être muette.
    func sceneAccessibilityLabel(_ attachment: MessageAttachment) -> String {
        if let legende = captionMap[attachment.id], !legende.isEmpty { return legende }
        return String(format: String(localized: "a11y.feed.post.scene",
                                     defaultValue: "Scène partagée par %@", bundle: .main),
                      senderInfoMap[attachment.id]?.senderName ?? "")
    }
}
