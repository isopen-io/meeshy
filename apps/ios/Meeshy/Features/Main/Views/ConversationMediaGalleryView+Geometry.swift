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

    /// **Un média seul ne réserve aucun couloir bas.** Il n'y a rien à
    /// parcourir, donc rien à montrer — et la hauteur que le rail ne prend pas
    /// revient au cadre, qui est la seule chose qu'on est venu regarder.
    static func corridors(safeTop: CGFloat,
                          safeBottom: CGFloat,
                          mediaCount: Int) -> MediaStageFraming.Corridors {
        MediaStageFraming.Corridors(
            safeTop: safeTop,
            top: topCorridorHeight,
            rail: mediaCount > 1 ? FilmstripMetrics.reservedHeight : 0,
            safeBottom: safeBottom,
            gutter: gutter
        )
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

// MARK: - Le plateau, côté vue

extension ConversationMediaGalleryView {

    /// Les réserves du plateau, mesurées sur la FENÊTRE et non sur l'affichage :
    /// sous Split View l'app n'a qu'une fraction de l'écran, et un couloir
    /// dimensionné contre le second poserait le rail hors cadre.
    var stageCorridors: MediaStageFraming.Corridors {
        MediaGalleryStage.corridors(
            safeTop: DeviceLayout.safeAreaTop,
            safeBottom: DeviceLayout.safeAreaBottom,
            mediaCount: allAttachments.count
        )
    }

    /// Ce que le plateau prend EN HAUT — la zone sûre puis le couloir des
    /// contrôles. Le pager s'en sert pour se poser exactement dans la zone libre
    /// que le solveur a mesurée ; sans ce partage, le cadre dessiné et le cadre
    /// calculé diffèreraient d'une bande.
    var plateauTopInset: CGFloat {
        stageCorridors.safeTop + stageCorridors.top
    }

    /// Et EN BAS — le rail, la zone sûre, plus la gouttière qui décolle le cadre
    /// de la pellicule.
    var plateauBottomInset: CGFloat {
        stageCorridors.rail + stageCorridors.safeBottom + stageCorridors.gutter
    }

    /// Le cadre de CE média. Chaque page a le sien : une vidéo 16:9 et une scène
    /// 9:16 gardent les mêmes couloirs, seul le cadre change entre elles.
    func stage(for attachment: MessageAttachment) -> MediaStageFraming.Result {
        MediaGalleryStage.resolve(
            viewport: DeviceLayout.windowSize,
            mediaRatio: MediaGalleryStage.ratio(of: attachment),
            // Les trois portes du plein cadre — tap, appui long, glissement —
            // sont #6142. La géométrie sait déjà rendre `.full` ; c'est
            // l'orchestration qui manque, et elle reste app-side.
            presentation: .carded,
            corridors: stageCorridors
        )
    }

    /// Le cadre de la page OUVERTE — celui que l'overlay habille.
    var currentStage: MediaStageFraming.Result {
        guard currentIndex < allAttachments.count else {
            return MediaGalleryStage.resolve(viewport: DeviceLayout.windowSize,
                                             mediaRatio: nil,
                                             presentation: .carded,
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
    var cadreRegion: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 0)
            cadreOverlay
        }
        .frame(width: currentStage.frame.width, height: currentStage.frame.height)
        .clipShape(RoundedRectangle(cornerRadius: currentStage.cornerRadius, style: .continuous))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// **Ce qui se pose sur le cadre part avec lui** (spec § 2.2) : le transport
    /// vidéo, la légende, l'auteur et sa date, la ligne format / dimensions /
    /// poids, les actions réagir · répondre · composer.
    ///
    /// Le voile est ici et non sur le bloc bas : il doit détacher le transport
    /// autant que la légende, et un dégradé par étage ferait deux lisières.
    @ViewBuilder
    var cadreOverlay: some View {
        if currentIndex < allAttachments.count {
            VStack(alignment: .leading, spacing: 0) {
                videoTransportLayer
                bottomOverlay
            }
            .background(
                LinearGradient(colors: [.clear, .black.opacity(0.75)],
                               startPoint: .top,
                               endPoint: .bottom)
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
