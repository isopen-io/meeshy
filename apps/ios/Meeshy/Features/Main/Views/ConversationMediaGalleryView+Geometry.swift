import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le PLATEAU de la galerie média
//
// Extrait de `ConversationMediaGalleryView.swift` (#6141), qui était à 991
// lignes sur un plafond de 1 200 : la géographie du plateau n'y tenait pas sans
// pousser le fichier hors budget. La découpe suit la même règle que celle des
// pages au #4014 — une responsabilité par fichier — et les membres qu'elle
// expose deviennent `internal` par la seule mécanique de l'extension.

/// **Ce que la galerie DEMANDE au solveur de cadrage.**
///
/// Le solveur (`MediaStageFraming`, SDK core) porte la loi : les couloirs
/// d'abord, le cadre ensuite, le plancher qui ne mord que sur un cadre court.
/// Il ne connaît ni la pellicule, ni la barre du haut, ni ce qu'un média sans
/// dimensions doit devenir — ce sont des questions d'HÔTE, et elles vivent ici.
///
/// ## Pourquoi le rail n'est pas un nombre
///
/// La maquette avait posé 84 pt à l'estime ; la pellicule en réserve 80, et
/// cette valeur est déjà une constante MESURÉE (`FilmstripMetrics.reservedHeight`
/// = `itemSide 54 + 2 × verticalPadding 10 + bottomPadding 6`). Recopier le
/// nombre marcherait aujourd'hui et désaccorderait le cadre et le rail le jour
/// où une vignette change de taille — en silence, puisque les deux resteraient
/// individuellement justes. Le couloir bas EST donc ce que la pellicule réserve.
///
/// ## Pourquoi le plancher n'est pas un nombre non plus
///
/// 330 pt se DÉRIVE : trois fois la hauteur de l'overlay posé sur le cadre, pour
/// qu'il n'en couvre jamais plus du tiers. Si l'overlay grandit, le plancher
/// suit ; il n'y a pas deux constantes à tenir d'accord.
///
/// Son jumeau sur l'autre axe (#6692) se dérive de la même façon : la colonne
/// d'actions et ses deux gouttières tiennent dans le tiers latéral du cadre.
/// Voir `minimumFrameWidth`.
enum MediaGalleryStage {

    /// Couloir haut : la porte de sortie et le menu, cible 44 pt plus la marge
    /// qui les décolle de la zone sûre.
    static let topCorridorHeight: CGFloat = 56

    /// Marge latérale de chaque côté du cadre, ET jeu vertical entre le cadre et
    /// le rail. Une seule valeur : c'est ce qui fait lire le cadre comme une
    /// carte posée sur le plateau plutôt que comme un rectangle centré par
    /// hasard.
    static let gutter: CGFloat = 12

    static let cornerRadius: CGFloat = 22

    /// Hauteur de ce qui se pose sur le cadre — transport, légende, auteur,
    /// actions. C'est la mesure dont le plancher descend.
    static let overlayHeight: CGFloat = 110

    /// Le cadre ne descend jamais sous trois fois son overlay.
    static var minimumFrameHeight: CGFloat { overlayHeight * 3 }

    /// **Ni sous la LARGEUR que sa colonne d'actions exige** (#6692) — le
    /// jumeau du plancher de hauteur, sur l'autre axe.
    ///
    /// Ce qui se pose sur le cadre a une largeur autant qu'une hauteur. Sans ce
    /// plancher, une image très haute (900 × 3 600) ne gardait que la largeur de
    /// son média ajusté, environ 128 pt à la recette : le nom, la date et la
    /// ligne de format passaient chacun sur deux lignes, la dernière débordait
    /// sous le coin arrondi, et la colonne réagir · répondre · composer se
    /// posait au MILIEU de l'image.
    ///
    /// La valeur se DÉRIVE de la colonne : sa cible, décollée du bord par une
    /// gouttière et du milieu par une autre, tient dans le TIERS latéral du
    /// cadre — les tiers que la loi du double tap découpe déjà sur ce même cadre
    /// (`MediaStageSeek.lateralFraction`), si bien que la colonne ne franchit
    /// jamais le tiers central. `(12 + 44 + 12) × 3 = 204` pt : la
    /// colonne reste au bord, et le bloc auteur garde de quoi poser son nom, sa
    /// date et sa ligne de format sur une ligne chacun. Si la cible, la
    /// gouttière ou le tiers changent, le plancher suit.
    ///
    /// Il reste sous le cadre le plus étroit d'un ratio courant — la 9:16 d'un
    /// lot qui réserve à la fois le rail et la progression, environ 312 pt —
    /// donc aucun cadre existant ne bouge. Seul un média bien plus étroit
    /// qu'une scène le rencontre, et c'est alors le MÉDIA qui flotte dans le
    /// cadre sur son hors-champ habillé : le cadre ne s'étire pas, le média
    /// n'est ni rogné ni agrandi.
    static var minimumFrameWidth: CGFloat {
        (gutter + MediaStageActionColumn.width + gutter) / MediaStageSeek.lateralFraction
    }

    /// **La bande de progression, elle non plus, n'est pas un nombre** (#6162).
    ///
    /// Elle vaut ce que la barre du SDK occupe réellement
    /// (`TransportLayout.barHeight`). Recopier 48 marcherait aujourd'hui et
    /// désaccorderait le cadre et la bande le jour où la barre change de
    /// gabarit — en silence, puisque les deux resteraient individuellement
    /// justes. C'est la leçon du rail, une bande plus haut.
    static var transportBandHeight: CGFloat { TransportLayout.barHeight }

    /// **Y a-t-il un TEMPS à montrer dans ce lot ?**
    ///
    /// La question se pose au LOT, jamais à la page ouverte — c'est tout le
    /// piège de l'issue. Une réserve conditionnée au média courant ferait
    /// changer le cadre de taille en glissant d'une vidéo vers une image, et un
    /// cadre qui saute sous le doigt coûte plus cher que quarante-huit points
    /// perdus sur les pages sans durée.
    ///
    /// Une durée NULLE n'est pas une durée : un attachement dont le serveur n'a
    /// pas encore calculé la durée ne fait pas naître une bande vide.
    static func carriesDuration(_ attachments: [MessageAttachment]) -> Bool {
        attachments.contains { ($0.duration ?? 0) > 0 }
    }

    /// **Un média seul ne réserve aucun couloir bas.** Il n'y a rien à
    /// parcourir, donc rien à montrer — et la hauteur que le rail ne prend pas
    /// revient au cadre, qui est la seule chose qu'on est venu regarder.
    ///
    /// La bande de progression ne suit PAS cette règle, et c'est voulu : un rail
    /// sert à parcourir une SÉRIE, une progression à parcourir UN média. Un
    /// vocal ou une vidéo seuls gardent donc leur bande.
    ///
    /// Le lot entier entre ici plutôt qu'un compte et un drapeau : deux
    /// décisions posées côte à côte au site d'appel finissent par diverger, et
    /// c'est celle du milieu — « ce lot porte-t-il une durée ? » — qu'on oublie.
    static func corridors(safeTop: CGFloat,
                          safeBottom: CGFloat,
                          attachments: [MessageAttachment]) -> MediaStageFraming.Corridors {
        MediaStageFraming.Corridors(
            safeTop: safeTop,
            top: topCorridorHeight,
            rail: attachments.count > 1 ? FilmstripMetrics.reservedHeight : 0,
            transport: carriesDuration(attachments) ? transportBandHeight : 0,
            safeBottom: safeBottom,
            gutter: gutter
        )
    }

    /// **Ce que le plateau prend EN HAUT — et ce qu'il rend en plein cadre**
    /// (#6142).
    ///
    /// Les deux retraits tombent à zéro dès que l'état bascule, et c'est ce qui
    /// fait du plein cadre autre chose qu'un fondu de chrome : tant que le pager
    /// garde les bandes du plateau, le média reste exactement là où il était et
    /// « plein cadre » ne nomme rien. Les fonctions sont statiques pour que la
    /// reprise de place s'éprouve sans monter la vue.
    static func topInset(presentation: StagePresentation,
                         corridors: MediaStageFraming.Corridors) -> CGFloat {
        presentation.showsPlateau ? corridors.safeTop + corridors.top : 0
    }

    /// Et EN BAS — le rail, la bande de progression (#6162), la zone sûre, plus
    /// la gouttière qui décolle le cadre de ce qui le suit.
    static func bottomInset(presentation: StagePresentation,
                            corridors: MediaStageFraming.Corridors) -> CGFloat {
        presentation.showsPlateau
            ? corridors.rail + corridors.transport + corridors.safeBottom + corridors.gutter
            : 0
    }

    /// Les proportions du média, ou `nil` quand la pièce jointe ne les porte
    /// pas — ce qui est le cas nominal d'un média reçu avant que le serveur ne
    /// les ait calculées.
    static func ratio(of attachment: MessageAttachment) -> CGFloat? {
        guard let width = attachment.width, let height = attachment.height,
              width > 0, height > 0 else { return nil }
        return CGFloat(width) / CGFloat(height)
    }

    /// **Le rapport que le solveur reçoit pour une PAGE** (#6709).
    ///
    /// Une page scène est une pièce SYNTHÉTIQUE, sans dimensions : lui demander
    /// `ratio(of:)` rendrait `nil`, et le cadre prendrait toute la zone libre au
    /// lieu du rapport de la scène. Le rapport d'une scène vient donc de sa
    /// valeur (`GallerySceneItem.aspect`, dont `PostGalleryLot.sceneAspect` est
    /// le site unique) ; celui d'une image ou d'une vidéo, de ses dimensions.
    /// **Le rapport d'une page — TOUJOURS celui du canvas, cardée ou en plein
    /// cadre** (#6806, superseded #6896/lot #6904).
    ///
    /// Avant #6896, une scène qui n'était qu'une image se présentait au
    /// rapport de son IMAGE sur une CARTE (`SceneFraming.presentationAspect`,
    /// désormais sans appelant hors tests) et à celui de son CANVAS en plein
    /// cadre — deux réponses selon la surface. La décision porteur du
    /// 2026-09-17 retire l'exception : la scène est TOUJOURS 9:16
    /// (`SceneShape.aspect`, `PostGalleryLot.sceneAspect`, `surface(inFullFrame:)`
    /// ignore désormais son paramètre) — mesurée une fois pour de bon par
    /// `GallerySceneBackdropUnicityTests.test_cardeeEtPleinCadre_rendentExactementLaMemeSurface`.
    ///
    /// Une pièce jointe ordinaire ne connaît pas cette question : son rapport
    /// est celui de ses pixels, sur toutes les surfaces.
    static func mediaRatio(of attachment: MessageAttachment,
                           scenes: [String: GallerySceneItem],
                           presentation: StagePresentation) -> CGFloat? {
        guard let scène = scenes[attachment.id] else { return ratio(of: attachment) }
        return scène.surface(inFullFrame: presentation.isFull).aspect
    }

    /// **Un ratio inconnu prend toute la zone libre — il ne se devine pas.**
    ///
    /// Deviner (4:3, 16:9, peu importe) ferait SAUTER le cadre à l'instant où
    /// les vraies dimensions arrivent, pendant que l'utilisateur regarde. Un
    /// cadre qui remplit la zone libre, lui, ne bouge que vers la bonne taille
    /// et le média s'y ajuste comme partout ailleurs.
    static func resolve(viewport: CGSize,
                        mediaRatio: CGFloat?,
                        presentation: MediaStageFraming.Presentation,
                        corridors: MediaStageFraming.Corridors) -> MediaStageFraming.Result {
        MediaStageFraming.resolve(
            MediaStageFraming.Input(
                viewport: viewport,
                mediaRatio: mediaRatio ?? freeRegionRatio(viewport: viewport,
                                                          presentation: presentation,
                                                          corridors: corridors),
                corridors: corridors,
                presentation: presentation,
                cardedCornerRadius: cornerRadius,
                minimumFrameHeight: minimumFrameHeight,
                minimumFrameWidth: minimumFrameWidth
            )
        )
    }

    /// **Ce qui se peint DERRIÈRE le média, dans son cadre** (#6143, spec § 2.1).
    ///
    /// Le hors-champ est habillé, jamais noir par défaut : le ThumbHash du média
    /// quand il en porte un, le noir sinon. Le noir n'est pas un repli honteux —
    /// c'est la réponse JUSTE quand il n'y a aucune matière à étirer (première
    /// image non décodée, média sans hachage). Inventer une couleur moyenne
    /// serait peindre ce que personne n'a mesuré.
    ///
    /// ## Le piège, et pourquoi la question se pose sur le RÉSULTAT
    ///
    /// `letterboxes` est une propriété du résultat de l'état COURANT, et c'est
    /// tout l'intérêt de la lui demander : le plein cadre fabrique son propre
    /// hors-champ. Une 4:5 remplit sa carte (366 × 457,5) et flotte une fois
    /// l'écran pris (390 × 487,5 dans 390 × 844) ; **aucune nature ne remplit
    /// l'écran**, pas même une scène 9:16, l'écran d'un iPhone 16 Pro étant plus
    /// étroit qu'elle. Conditionner l'habillage au letterbox du seul état cadré
    /// garantirait donc du noir exactement là où on voulait l'éviter.
    ///
    /// La cascade des sources, elle, n'est pas réécrite ici : elle vit dans
    /// `StoryLetterboxFill`, qui l'a portée pour le canvas de story. Deux tables
    /// pour une même question divergeraient le jour où l'une changerait.
    static func backdrop(stage: MediaStageFraming.Result,
                         thumbHash: String?) -> StoryLetterboxFill.Source {
        guard stage.letterboxes else { return .none }
        return StoryLetterboxFill.source(thumbHash: thumbHash)
    }

    /// **Le nom de l'espace du PLATEAU** — la région qui porte le cadre et le chrome
    /// (#6760), où la colonne d'actions mesure sa place (#6709).
    static let cadreSpace = "media.stage.cadre"

    /// **Ce que la colonne d'actions a SOUS elle** (#6709, recette du 2026-09-16).
    ///
    /// Depuis #6760, le chrome s'aligne sur le PLATEAU, et non plus sur le cadre : la
    /// colonne se pose au bas de la région. Sous un cadre plus court que la région — un
    /// panorama —, elle tombe HORS du cadre, sur le sol noir de la galerie. Sa teinte
    /// (#6693) doit suivre ce qui y est peint, jamais un média qu'elle ne couvre pas. Sur
    /// la page panorama 4:1 d'un post, teintée d'après la vignette claire du panorama,
    /// son glyphe sombre se lisait à 1,16:1 sur le noir (cadre arrêté à y ≈ 598, colonne
    /// à y 649).
    ///
    /// La règle lit trois zones sur la région mesurée. Le cadre et son média y sont posés
    /// au milieu, par la loi du plateau (`StageChromeAlignment.mediaOrigin`) :
    /// - **sur le média** : le média ;
    /// - **dans la bande du cadre** : l'empreinte seule, ou `nil` quand la bande est nue.
    ///   C'est l'empreinte que la bande peint (`backdrop(stage:thumbHash:)`), jamais la
    ///   vignette nette ;
    /// - **hors du cadre** : `nil`. Le sol de la galerie est noir (`Color.black`), et
    ///   aucune page n'y peint son empreinte.
    ///
    /// `nil` rend le schéma sombre de la loi : un glyphe clair sur le noir.
    ///
    /// Avant la première mesure — de la colonne ou de sa région —, rien ne dit où est la
    /// colonne. Elle garde alors le fond du média, plutôt que de basculer le temps d'une
    /// passe.
    static func columnBackdrop(for attachment: MessageAttachment,
                               stage: MediaStageFraming.Result,
                               region: CGSize,
                               columnFrame: CGRect) -> MediaChromeBackdrop? {
        guard !columnFrame.isEmpty, region.width > 0, region.height > 0 else {
            return .attachment(attachment)
        }
        let plateau = CGRect(origin: .zero, size: region)
        let centre = CGPoint(x: columnFrame.midX, y: columnFrame.midY)
        let media = CGRect(origin: StageChromeAlignment.mediaOrigin(stage: plateau, mediaSize: stage.media),
                           size: stage.media)
        guard !media.contains(centre) else { return .attachment(attachment) }
        let cadre = CGRect(origin: StageChromeAlignment.mediaOrigin(stage: plateau, mediaSize: stage.frame),
                           size: stage.frame)
        guard cadre.contains(centre),
              case .thumbHash(let empreinte) = backdrop(stage: stage, thumbHash: attachment.thumbHash) else {
            return nil
        }
        return MediaChromeBackdrop(key: attachment.id, thumbHash: empreinte, bitmapURL: nil)
    }

    private static func freeRegionRatio(viewport: CGSize,
                                        presentation: MediaStageFraming.Presentation,
                                        corridors: MediaStageFraming.Corridors) -> CGFloat {
        let region = presentation == .full
            ? viewport
            : CGSize(width: viewport.width - 2 * gutter,
                     height: viewport.height - corridors.reservedHeight)
        guard region.width > 0, region.height > 0 else { return 0 }
        return region.width / region.height
    }
}

// MARK: - Le hors-champ, habillé

/// **La couche qui habille le hors-champ d'un média** (#6143).
///
/// Elle se pose SOUS le média, à l'intérieur du cadre : ce qui déborde est
/// clippé par le cadre arrondi de la page. Le noir d'abord — c'est le fond du
/// cadre, et il reste seul quand le média n'a aucun hachage à étirer — puis le
/// ThumbHash par-dessus, à l'opacité que le SDK a fixée pour les bandes d'une
/// story. Une seule opacité pour les deux surfaces : deux valeurs voisines
/// feraient deux produits.
///
/// **Le flou ne coûte aucun filtre.** Un ThumbHash décodé fait trente-deux
/// pixels de côté ; c'est le rééchantillonnage qui le lisse. Pas de `CIFilter`,
/// pas de rendu hors écran, pas une image de plus à charger — la bande coûte ce
/// que coûte une couche.
struct MediaStageBackdrop: View {
    let source: StoryLetterboxFill.Source

    var body: some View {
        ZStack {
            Color.black

            if let fill {
                // `.scaledToFill` : la bande doit être PLEINE. Un `.fit` y
                // laisserait ses propres bandes — un letterbox dans un letterbox.
                Image(uiImage: fill)
                    .resizable()
                    .interpolation(.low)
                    .scaledToFill()
                    .opacity(Double(StoryLetterboxFill.fillOpacity))
                    .accessibilityHidden(true)
            }
        }
    }

    /// Le décodage (~1 ms) n'a lieu qu'au changement de source : les deux pages
    /// qui montent cette couche sont `Equatable` et ne reconstruisent leur corps
    /// que lorsque leur média ou leur cadre bouge.
    ///
    /// `.stampedBitmap` ne peut pas arriver ici — c'est la source de l'ATELIER,
    /// où le canvas tient déjà le bitmap de fond en mémoire. La galerie n'a que
    /// le hachage, et `StoryLetterboxFill.source(thumbHash:)` ne rend jamais
    /// autre chose.
    private var fill: UIImage? {
        guard case .thumbHash(let hash) = source else { return nil }
        return UIImage.fromThumbHash(hash)
    }
}

// MARK: - Le plateau, côté vue

extension ConversationMediaGalleryView {

    /// Les réserves du plateau, mesurées sur la FENÊTRE et non sur l'affichage :
    /// sous Split View l'app n'a qu'une fraction de l'écran, et un couloir
    /// dimensionné contre le second poserait le rail hors cadre.
    var stageCorridors: MediaStageFraming.Corridors {
        MediaGalleryStage.corridors(
            safeTop: DeviceLayout.safeAreaTop,
            safeBottom: DeviceLayout.safeAreaBottom,
            attachments: allAttachments
        )
    }

    /// **L'état que le SOLVEUR reçoit — site unique** (#6789).
    ///
    /// Le voile d'une ouverture efface le CHROME sans libérer sa place :
    /// `MediaStageVeil.geometryPresentation` prend les ouvertures et ne les lit
    /// pas, et c'est toute la règle. Elle passe par une fonction plutôt que par
    /// un appel qu'on s'abstient d'écrire, parce qu'une règle qu'on respecte en
    /// NE FAISANT RIEN ne se teste pas — et se perd au premier lot qui ajoute un
    /// site.
    ///
    /// **Les DEUX ouvertures y entrent** (#6817) : une barre de réponse qui
    /// libérerait la place du plateau ferait changer le média de taille à chaque
    /// montée du clavier, pendant qu'on écrit à son sujet.
    var stageGeometryPresentation: StagePresentation {
        MediaStageVeil.geometryPresentation(stagePresentation, overlays: stageOverlays)
    }

    /// Le pager s'en sert pour se poser exactement dans la zone libre que le
    /// solveur a mesurée ; sans ce partage, le cadre dessiné et le cadre calculé
    /// diffèreraient d'une bande. En plein cadre, les deux valent zéro et le
    /// pager reprend l'écran entier.
    var plateauTopInset: CGFloat {
        MediaGalleryStage.topInset(presentation: stageGeometryPresentation, corridors: stageCorridors)
    }

    var plateauBottomInset: CGFloat {
        MediaGalleryStage.bottomInset(presentation: stageGeometryPresentation, corridors: stageCorridors)
    }

    /// Le cadre de CE média. Chaque page a le sien : une vidéo 16:9 et une scène
    /// 9:16 gardent les mêmes couloirs, seul le cadre change entre elles.
    ///
    /// **L'état d'immersion entre ici** (#6142) : `framing` le projette sur le
    /// solveur, donc franchir une porte change des COTES. Un état qui n'aurait
    /// commandé que du chrome aurait laissé la loi de cadrage sans interrupteur.
    ///
    /// **Une page scène reçoit le rapport de SA scène** (#6709) : sa pièce est
    /// synthétique, sans dimensions — `mediaRatio(of:scenes:)` le sait.
    func stage(for attachment: MessageAttachment) -> MediaStageFraming.Result {
        MediaGalleryStage.resolve(
            viewport: DeviceLayout.windowSize,
            mediaRatio: MediaGalleryStage.mediaRatio(of: attachment,
                                                     scenes: sceneContext?.scenes ?? [:],
                                                     presentation: stageGeometryPresentation),
            presentation: stageGeometryPresentation.framing,
            corridors: stageCorridors
        )
    }

    /// **Le cadre d'une page SCÈNE — la loi de forme, pas le solveur** (#6904).
    ///
    /// Une scène ne se cadre pas comme une pièce jointe : `GallerySceneStage`
    /// projette `SceneShape.layout(in:)`, qui tient les DEUX viewports d'UNE
    /// même carte — cadrée, elle tient entière dans la zone libre du plateau ;
    /// immersive, la MÊME carte occupe le viewport entier, sans couloir ni
    /// chrome (elle grandit, elle ne se remplit pas — #6896, directive du
    /// 2026-09-17). `stage(for:)` reste la réponse des pages image et vidéo, et
    /// celle du CHROME du plateau, qui se pose sur la même zone.
    ///
    /// **Le fond n'est PLUS élu ici** (directive porteur du 2026-09-17, lot
    /// #6904). La galerie choisissait le hachage étiré quand la scène en
    /// portait un ; le lecteur de stories choisissait la couleur dominante. La
    /// même carte avait donc deux fonds selon la surface qui l'ouvrait, et
    /// aucun témoin ne pouvait rougir — chacun était juste chez lui. La loi le
    /// nomme désormais (`SceneShape.cardedBackdrop`), et le sol noir d'une
    /// scène sans empreinte vit dans `SceneBackdropView`, où il vaut pour les
    /// trois fonds à la fois.
    ///
    /// **Sans paramètre** (revue du tour 3) : la phrase qui en justifiait un
    /// ici — « c'est la scène qui porte l'empreinte avec laquelle ce fond se
    /// calcule » — décrivait `SceneCard(thumbHash: item.thumbHash)`, monté à
    /// côté par l'appelant, jamais lu PAR cette fonction. Le cadre d'une scène
    /// ne dépend que du plateau (viewport, présentation, couloirs) : deux
    /// scènes ouvertes dans le même état reçoivent le même cadre.
    func sceneStage() -> GallerySceneStage.Frame {
        GallerySceneStage.frame(
            viewport: DeviceLayout.windowSize,
            presentation: stageGeometryPresentation,
            corridors: stageCorridors
        )
    }

    /// Le cadre de la page OUVERTE — celui que l'overlay habille.
    var currentStage: MediaStageFraming.Result {
        guard currentIndex < allAttachments.count else {
            return MediaGalleryStage.resolve(viewport: DeviceLayout.windowSize,
                                             mediaRatio: nil,
                                             presentation: stageGeometryPresentation.framing,
                                             corridors: stageCorridors)
        }
        return stage(for: allAttachments[currentIndex])
    }

    /// **Le cadre dit à la légende combien de place il a** (#6141).
    ///
    /// Dépliée, elle est CLIPPÉE par le cadre arrondi. Le plafond de 420 pt du
    /// composant partagé a été écrit pour un hôte plein écran ; sur un cadre à
    /// son plancher (330), il coupait une phrase au milieu — une troncature
    /// SILENCIEUSE, exactement ce que `MediaCaptionOverlay` existe pour éviter.
    var cadreCaptionMaxHeight: CGFloat {
        min(420, max(120, currentStage.frame.height - MediaGalleryStage.overlayHeight))
    }

    /// **La zone libre, avec le cadre centré dedans.**
    ///
    /// Rien n'y est peint : le média vit dans le pager, une couche plus bas, et
    /// cette couche-ci ne porte QUE ce qui se pose sur le cadre. Les deux sont
    /// dimensionnées par le même `currentStage`, donc alignées par construction.
    ///
    /// Un `Spacer` et non un `Color.clear` pour pousser l'overlay en bas : une
    /// couleur, même transparente, teste les touches et volerait au pager tous
    /// les gestes du cadre.
    ///
    /// **La colonne d'actions est le second occupant du cadre** (#6161). Elle
    /// est déclarée ICI, donc à l'INTÉRIEUR du `.frame` et du `.clipShape` qui
    /// suivent : elle est dimensionnée par `currentStage.frame` comme tout le
    /// reste du cadre, et les coins arrondis la rognent comme ils rognent la
    /// légende. Ancrée au-dessus du bloc d'informations, elle MONTE avec lui
    /// quand la légende se déplie — la pile ancrée en bas fait le travail, il
    /// n'y a aucune cote à tenir d'accord.
    ///
    /// **Le play/pause est le troisième occupant, et le seul qui soit CENTRÉ**
    /// (#6162). Il ne rejoint pas la pile ancrée en bas : c'est l'affordance
    /// première d'un lecteur, elle se pose au milieu de l'image — là où l'œil
    /// est déjà, et là où aucun joueur au monde ne met autre chose. Le cadre
    /// centre son média, donc le centre du cadre EST le centre du média : la
    /// couche n'a aucune cote à tenir d'accord avec le solveur.
    /// **#6760 — le chrome s'aligne sur le PLATEAU, jamais sur le média.**
    ///
    /// Directive porteur (2026-09-15) : « les details de l'auteur et les actions
    /// doivent être aligné sur le plateau ! […] le plateau est la scene ! »
    ///
    /// Les deux blocs étaient jusqu'ici DANS le `.frame(currentStage.frame)`,
    /// c'est-à-dire bornés par le cadre du MÉDIA — donc déplacés par la forme du
    /// fichier. Mesuré sur la capture du porteur, une pièce 900 × 3 600 : la
    /// colonne d'actions se posait à x ≈ 615, le bord du média, quand le plateau
    /// s'arrête à 690. Une pièce large les aurait repoussées : le repère que
    /// l'utilisateur apprend bougeait d'un média à l'autre.
    ///
    /// Le média garde son cadre et son arrondi ; le chrome prend le plateau. La
    /// loi qui le dit — et le témoin d'INVARIANCE qui la prouve — vit dans
    /// `StageChromeAlignment`.
    var cadreRegion: some View {
        ZStack {
            cadreCenterPlayPause
                .frame(width: currentStage.frame.width, height: currentStage.frame.height)
                .clipShape(RoundedRectangle(cornerRadius: currentStage.cornerRadius, style: .continuous))

            VStack(spacing: 0) {
                Spacer(minLength: 0)
                cadreReactionBadge
                cadreActionColumn
                cadreOverlay
            }
            .frame(width: stageChromeWidth)
        }
        // L'espace où la colonne mesure sa place (#6709) : la région du plateau, qui
        // porte à la fois le cadre et le chrome. Sa taille suffit à dire où le cadre
        // et son média sont peints — tous deux posés au milieu — et
        // `MediaGalleryStage.columnBackdrop` y lit ce qui est sous la colonne.
        .onGeometryChange(for: CGSize.self) { proxy in
            proxy.size
        } action: { taille in
            cadreRegionSize = taille
        }
        .coordinateSpace(name: MediaGalleryStage.cadreSpace)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// **CE QUE LA PIÈCE A RÉCOLTÉ, VISIBLE SANS REFERMER** (#6789, directive
    /// porteur 2026-09-16 : « lorsqu'on choisi la réaction, ce doit s'afficher
    /// sur l'attachement en plein ecran et dans la conversation »).
    ///
    /// Le résumé arrivait déjà jusqu'ici — `reactionSummary` et
    /// `currentUserReactions` sont des champs de la MÊME pièce que la bulle rend
    /// —, et aucun site du visualiseur ne les lisait. On réagissait, l'écran ne
    /// changeait pas, et il fallait refermer pour voir que le geste avait
    /// marché : un contrôle dont l'effet n'atteint aucun pixel (loi 4, lue à
    /// l'envers).
    ///
    /// **Alignée sur le PLATEAU, pas sur le média** (#6760) : elle rejoint la
    /// pile qui porte déjà la colonne d'actions et le bloc auteur, dans la
    /// largeur `stageChromeWidth`. Posée sur le cadre du média, elle aurait
    /// changé de place d'une pièce à l'autre — et se serait cognée au bloc
    /// auteur dès qu'une pièce haute remplit la région.
    ///
    /// **C'est du CHROME**, donc elle part avec lui : la rangée d'émojis
    /// ouverte l'efface comme elle efface le reste, et le choix de l'émoji la
    /// ramène — ce qui est exactement l'enchaînement que la directive décrit.
    @ViewBuilder
    var cadreReactionBadge: some View {
        if currentIndex < allAttachments.count,
           let modèle = AttachmentReactionBadgeModel.make(
                summary: allAttachments[currentIndex].reactionSummary,
                currentUserReactions: allAttachments[currentIndex].currentUserReactions) {
            AttachmentReactionBadge(model: modèle, accent: Color(hex: accentColor))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, MediaGalleryStage.gutter)
                .padding(.bottom, MediaStageActionColumn.spacing)
                .transition(.scale(scale: 0.6).combined(with: .opacity))
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: modèle)
        }
    }

    /// La largeur du PLATEAU — celle que le chrome prend, quelle que soit la
    /// forme du média. `StageChromeAlignment` porte la règle ; ceci n'est que sa
    /// projection sur la géométrie de cet hôte.
    var stageChromeWidth: CGFloat {
        StageChromeAlignment.chromeBounds(
            stage: CGRect(origin: .zero, size: plateauSize),
            // `currentStage.frame` est une TAILLE, pas un rectangle posé :
            // le cadre du média n'a pas d'origine propre, il est centré.
            media: CGRect(origin: .zero, size: currentStage.frame)
        ).width
    }

    /// Le plateau : la région libre entre les couloirs, gouttière comprise.
    /// C'est la surface que le ThumbHash habille déjà (`MediaStageBackdrop`) —
    /// le chrome s'y aligne désormais aussi.
    var plateauSize: CGSize {
        CGSize(width: max(0, DeviceLayout.windowSize.width - 2 * MediaGalleryStage.gutter),
               height: max(0, currentStage.frame.height))
    }

    /// **Ce qui se pose sur le cadre part avec lui** (spec § 2.2) : la légende,
    /// l'auteur et sa date, la ligne format / dimensions / poids. Les actions
    /// réagir · répondre · composer restent sur le cadre elles aussi, mais dans
    /// leur propre couche — `cadreActionColumn`, montée au-dessus de ce bloc
    /// (#6161) : elles sont une COLONNE, et les mettre dans ce `VStack` les
    /// remettrait en ligne.
    ///
    /// **La progression, elle, est descendue au couloir** (#6162) : elle
    /// commande le TEMPS, pas le cadrage, et posée ici elle couvrait l'image
    /// qu'on est venu regarder. Ce qui reste au cadre est ce qui DÉCRIT le
    /// média ; ce qui le PARCOURT est au plateau, avec le rail.
    ///
    /// Le voile reste ici plutôt que sur le bloc bas lui-même : il n'a plus qu'un
    /// étage à détacher depuis que le transport est parti, mais le poser un cran
    /// plus bas ferait migrer la lisière chaque fois que le contenu du bloc
    /// change — un dégradé se pose sur la COUCHE, pas sur ce qui l'occupe.
    ///
    /// **Et il ne prend AUCUNE touche.** Un `LinearGradient` est une vue rendue,
    /// donc testée aux touches au même titre qu'un `Color.clear` — c'est
    /// exactement l'argument que `cadreRegion` écrit dix lignes plus haut pour
    /// refuser une couleur transparente à la place de son `Spacer`. Posé en fond
    /// d'un bloc monté dans une couche hit-testable AU-DESSUS du pager, il
    /// faisait des ~110 pt du bas du cadre une zone morte : ni la porte du tap
    /// (#6142) ni le glissement horizontal qui feuillette n'y atteignaient plus
    /// le pager. Le composant de légende partagé refuse ce comportement pour
    /// lui-même (« le canvas garde ses gestes de navigation sous la légende ») ;
    /// l'hôte le réintroduisait une couche plus haut, hors de portée de sa garde.
    @ViewBuilder
    var cadreOverlay: some View {
        if currentIndex < allAttachments.count {
            bottomOverlay
                .background(
                    LinearGradient(colors: [.clear, .black.opacity(0.75)],
                                   startPoint: .top,
                                   endPoint: .bottom)
                        .allowsHitTesting(false)
                )
        }
    }

    /// **Le couloir bas : la pellicule, et rien d'autre.**
    ///
    /// Elle a quitté le bloc du média (#6141). Elle y partageait la colonne avec
    /// la légende et l'auteur, si bien qu'une légende dépliée pouvait la
    /// comprimer — or c'est le seul contrôle du bas qui sert à NAVIGUER. Au
    /// plateau, sa hauteur est réservée avant que le cadre ne prenne le reste :
    /// plus rien ne peut la lui reprendre.
    @ViewBuilder
    var railCorridor: some View {
        if allAttachments.count > 1 {
            ConversationMediaFilmstrip(
                attachments: allAttachments,
                currentPageID: $currentPageID,
                accentColor: accentColor
            )
        }
    }
}
