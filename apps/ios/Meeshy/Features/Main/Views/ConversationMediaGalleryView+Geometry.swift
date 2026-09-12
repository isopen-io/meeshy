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
                minimumFrameHeight: minimumFrameHeight
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

    /// Le pager s'en sert pour se poser exactement dans la zone libre que le
    /// solveur a mesurée ; sans ce partage, le cadre dessiné et le cadre calculé
    /// diffèreraient d'une bande. En plein cadre, les deux valent zéro et le
    /// pager reprend l'écran entier.
    var plateauTopInset: CGFloat {
        MediaGalleryStage.topInset(presentation: stagePresentation, corridors: stageCorridors)
    }

    var plateauBottomInset: CGFloat {
        MediaGalleryStage.bottomInset(presentation: stagePresentation, corridors: stageCorridors)
    }

    /// Le cadre de CE média. Chaque page a le sien : une vidéo 16:9 et une scène
    /// 9:16 gardent les mêmes couloirs, seul le cadre change entre elles.
    ///
    /// **L'état d'immersion entre ici** (#6142) : `framing` le projette sur le
    /// solveur, donc franchir une porte change des COTES. Un état qui n'aurait
    /// commandé que du chrome aurait laissé la loi de cadrage sans interrupteur.
    func stage(for attachment: MessageAttachment) -> MediaStageFraming.Result {
        MediaGalleryStage.resolve(
            viewport: DeviceLayout.windowSize,
            mediaRatio: MediaGalleryStage.ratio(of: attachment),
            presentation: stagePresentation.framing,
            corridors: stageCorridors
        )
    }

    /// Le cadre de la page OUVERTE — celui que l'overlay habille.
    var currentStage: MediaStageFraming.Result {
        guard currentIndex < allAttachments.count else {
            return MediaGalleryStage.resolve(viewport: DeviceLayout.windowSize,
                                             mediaRatio: nil,
                                             presentation: stagePresentation.framing,
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
    var cadreRegion: some View {
        ZStack {
            cadreCenterPlayPause

            VStack(spacing: 0) {
                Spacer(minLength: 0)
                cadreActionColumn
                cadreOverlay
            }
        }
        .frame(width: currentStage.frame.width, height: currentStage.frame.height)
        .clipShape(RoundedRectangle(cornerRadius: currentStage.cornerRadius, style: .continuous))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
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
