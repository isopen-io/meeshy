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
/// aux cotes que la LOI de forme donne à la scène (`GallerySceneStage`, une
/// projection de `SceneShape.layout(_:in:)`, #6904), et elle répond aux trois
/// portes du plateau (#6142) exactement comme ses sœurs image et vidéo : le
/// tap, l'appui long, le glissement.
///
/// **Elle ne passe PLUS par `MediaStageFraming`**, et c'est la décision du
/// 2026-09-17 : ce solveur cadre des pièces JOINTES — il ajuste, donc il laisse
/// des bandes même sur une scène au gabarit, et son plein cadre n'était pas
/// plein (402 × 714,67 mesuré dans un viewport de 402 × 874). Les pages image
/// et vidéo, elles, y restent : leur contenu est reçu, et le rogner retirerait
/// ce que l'expéditeur a envoyé.
///
/// `Equatable` et montée en `.equatable()`, pour la raison que la galerie écrit
/// en tête de son fichier : une réévaluation de la racine ne re-rend que les
/// pages dont la position relative a changé.
struct GalleryScenePage: View, Equatable {
    let item: GallerySceneItem
    /// **Le cadre de cette page — la LOI de forme, pas le solveur des pièces
    /// jointes** (#6904). `GallerySceneStage` projette
    /// `SceneShape.layout(_:in:)` : cadrée, la scène tient entière dans la zone
    /// libre ; immersive, elle couvre le viewport et déborde.
    let stage: GallerySceneStage.Frame
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

    var body: some View {
        // **LA carte de scène — la même que le lecteur de stories monte**
        // (directive porteur du 2026-09-17). Elle cadre le contenu aux cotes de
        // la loi, peint le fond DANS la carte et rogne aux coins de la loi.
        // Cette page n'en refait aucune des trois : elle donne le VIEWPORT que
        // le plateau laisse (`GallerySceneStage`), et ses gestes.
        SceneCard(layout: stage.layout, thumbHash: item.thumbHash) {
            if rendersPlayer {
                player
            } else {
                preview
            }
        }
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

    /// **Le player — et la CARTE le dimensionne** (#6904).
    ///
    /// Plus aucun `.frame` ici : `SceneCard` pose le contenu aux cotes que la
    /// loi donne à la scène, jamais un `.aspectRatio` réécrit à la main —
    /// c'est la leçon de `GalleryImagePage` (« la taille vient du solveur »),
    /// et c'est aussi ce qui garantit que le lecteur de stories et cette page
    /// cadrent la MÊME scène. Elle tient TOUJOURS dans son viewport : depuis la
    /// directive du 2026-09-17 (3e message), aucune surface ne rogne une scène.
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
            // **Le canvas ne peint JAMAIS son hors-champ** (#6791, #6904) :
            // c'est la CARTE qui le peint, dans les deux plein écrans, comme
            // aux quatre montages du lecteur de stories. Le laisser peindre le
            // sien empilait deux dégradés du MÊME hachage, étirés dans deux
            // cadres différents — mesuré au simulateur, deux teintes au-dessus
            // d'un même média.
            //
            // La valeur était `stage.paintsOwnLetterbox` jusqu'au 3e message de
            // la directive du 2026-09-17 : l'immersif n'avait alors pas de
            // plateau, donc le canvas y redevenait le seul peintre possible.
            // Un seul état de carte ⇒ un seul peintre, et il se dit par la
            // STRUCTURE — `SceneCard` — plutôt que par un champ de loi devenu
            // constant.
            servesLetterboxFill: false
        )
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
            stage: sceneStage(for: scene),
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
