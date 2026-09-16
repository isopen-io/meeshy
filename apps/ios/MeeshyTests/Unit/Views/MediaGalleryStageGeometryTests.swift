import XCTest
import CoreGraphics
import MeeshySDK
@testable import Meeshy

/// **La galerie média demande ses cotes au solveur — elle n'en calcule aucune.**
///
/// Le solveur (`MediaStageFraming`, SDK core) est déjà éprouvé par ses propres
/// témoins : les couloirs d'abord, le cadre ensuite, le plancher qui ne mord que
/// sur un cadre court. Ce que CE fichier tient est l'autre moitié, celle qu'un
/// témoin de solveur ne peut pas voir — **ce que la galerie lui DEMANDE**.
///
/// C'est là que la loi se perd en silence : un solveur juste, nourri d'un rail
/// recopié à 84 au lieu des 80 que la pellicule réserve vraiment, rend des cotes
/// justes pour un plateau qui n'existe pas. Les deux témoins de rail ci-dessous
/// mesurent donc une IDENTITÉ (`FilmstripMetrics.reservedHeight`), jamais un
/// nombre — un nombre passerait au vert le jour où la vignette change de taille,
/// c'est-à-dire exactement le jour où le cadre et le rail se désaccordent.
///
/// Cotes de référence : iPhone 16 Pro, 390 × 844 pt, safe area 59 / 34.
/// Source : `docs/superpowers/specs/2026-09-12-lecture-media-plateau-design.md` § 2.1.
@MainActor
final class MediaGalleryStageGeometryTests: XCTestCase {

    // MARK: - Fabriques

    private static let viewport = CGSize(width: 390, height: 844)

    private func corridors(mediaCount: Int = 6) -> MediaStageFraming.Corridors {
        MediaGalleryStage.corridors(safeTop: 59, safeBottom: 34, attachments: MediaGalleryLot.imagesOnly(mediaCount))
    }

    private func resolve(
        ratio: CGFloat?,
        presentation: MediaStageFraming.Presentation = .carded,
        mediaCount: Int = 6
    ) -> MediaStageFraming.Result {
        MediaGalleryStage.resolve(
            viewport: Self.viewport,
            mediaRatio: ratio,
            presentation: presentation,
            corridors: corridors(mediaCount: mediaCount)
        )
    }

    // MARK: - Les trois ratios, en cadré

    /// Zone libre : 366 × 603 — soit 844 moins les cinq réserves du plateau.
    /// Une 4:5 y est contrainte par la LARGEUR et remplit son cadre.
    func test_carded_portraitImage_isBoundedByTheFreeWidth() {
        let resolved = resolve(ratio: 0.8)

        XCTAssertEqual(resolved.frame.width, 366, accuracy: 0.5,
                       "390 − 2 × 12 : la gouttière est la seule réserve latérale")
        XCTAssertEqual(resolved.frame.height, 457.5, accuracy: 0.5,
                       "366 / 0,8 — ajustée au ratio, jamais étirée")
        XCTAssertEqual(resolved.media, resolved.frame,
                       "sans plancher actif, le média EST son cadre")
        XCTAssertFalse(resolved.letterboxes)
    }

    /// **Le seul ratio où le plancher mord.** Sur une 4:5 ou une 9:16, la règle
    /// juste et la règle absente rendent le même verdict — un témoin de plancher
    /// écrit là serait vert des deux côtés du diff.
    func test_carded_wideVideo_stopsAtTheFloor_andLetterboxes() {
        let resolved = resolve(ratio: 16.0 / 9.0)

        XCTAssertEqual(resolved.media.height, 205.875, accuracy: 0.5,
                       "le MÉDIA garde son ratio : 366 × 9/16")
        XCTAssertEqual(resolved.frame.height, 330, accuracy: 0.5,
                       "le CADRE s'arrête au plancher — trois fois la hauteur de son overlay")
        XCTAssertTrue(resolved.letterboxes,
                      "un cadre plus haut que son média laisse deux bandes à habiller")
    }

    /// Une scène 9:16 est contrainte par la HAUTEUR : elle perd de la largeur
    /// pour que le rail survive, et c'est exactement ce que « les couloirs
    /// d'abord » veut dire.
    func test_carded_tallScene_isBoundedByTheFreeHeight() {
        let resolved = resolve(ratio: 0.5625)

        XCTAssertEqual(resolved.frame.height, 603, accuracy: 0.5,
                       "844 − 59 − 56 − 80 − 34 − 12")
        XCTAssertEqual(resolved.frame.width, 339.19, accuracy: 0.5, "603 × 0,5625")
        XCTAssertEqual(resolved.media, resolved.frame)
    }

    // MARK: - Le rail est MESURÉ, jamais recopié

    /// La maquette avait posé 84 à l'estime ; la pellicule en réserve 80, et
    /// cette valeur est déjà une constante nommée. Le témoin porte donc sur
    /// l'IDENTITÉ : recopier le nombre resterait vert le jour où une vignette
    /// change de taille, c'est-à-dire le jour où le cadre déborderait le rail.
    func test_theRail_isTheFilmstripMeasuredHeight_neverACopy() {
        XCTAssertEqual(corridors().rail, FilmstripMetrics.reservedHeight,
                       "le couloir bas EST ce que la pellicule réserve, pas un nombre voisin")
        XCTAssertEqual(corridors().top, MediaGalleryStage.topCorridorHeight)
        XCTAssertEqual(corridors().gutter, MediaGalleryStage.gutter)
    }

    /// **Un média seul n'a pas de pellicule à parcourir**, donc pas de couloir
    /// bas à réserver — et le cadre récupère EXACTEMENT cette hauteur. Écrit sur
    /// un ratio plus étroit que la zone libre (0,4) : c'est le seul cas où le
    /// cadre est contraint par la hauteur dans les deux configurations, donc le
    /// seul où la différence mesure vraiment le rail.
    func test_aSingleMedium_reservesNoRail_andTheCadreGrowsByExactlyItsHeight() {
        let avecRail = resolve(ratio: 0.4, mediaCount: 6)
        let sansRail = resolve(ratio: 0.4, mediaCount: 1)

        XCTAssertEqual(corridors(mediaCount: 1).rail, 0,
                       "rien à parcourir ⇒ aucun couloir bas")
        XCTAssertEqual(sansRail.frame.height - avecRail.frame.height,
                       FilmstripMetrics.reservedHeight,
                       accuracy: 0.5,
                       "la hauteur rendue au cadre est celle que le rail ne prend plus")
    }

    // MARK: - Le plancher se DÉRIVE

    /// 330 n'est pas un choix : c'est trois fois la hauteur de l'overlay, pour
    /// qu'il ne couvre jamais plus du tiers du cadre. Si l'overlay change de
    /// hauteur, le plancher suit — il n'y a pas deux constantes à tenir
    /// d'accord.
    func test_theFloor_isThreeTimesTheOverlay_neverAChosenNumber() {
        XCTAssertEqual(MediaGalleryStage.minimumFrameHeight,
                       MediaGalleryStage.overlayHeight * 3,
                       accuracy: 0.001)
        XCTAssertEqual(resolve(ratio: 16.0 / 9.0).frame.height,
                       MediaGalleryStage.minimumFrameHeight,
                       accuracy: 0.5)
    }

    // MARK: - Le plancher de LARGEUR se dérive aussi (#6692)

    /// **Le jumeau du plancher de hauteur n'est pas un nombre non plus.** Ce qui
    /// se pose sur le cadre a une LARGEUR : la colonne réagir · répondre ·
    /// composer, décollée du bord par une gouttière et du milieu par une autre,
    /// tient dans le TIERS latéral du cadre — les tiers que la loi du double tap
    /// découpe déjà (`MediaStageSeek.lateralFraction`). Le témoin porte sur les
    /// IDENTITÉS : si la cible, la gouttière ou le tiers changent, le plancher
    /// suit sans qu'on y touche.
    func test_theWidthFloor_isTheActionColumnBandInTheLateralThird_neverAChosenNumber() {
        XCTAssertEqual(
            MediaGalleryStage.minimumFrameWidth,
            (MediaGalleryStage.gutter + MediaStageActionColumn.width + MediaGalleryStage.gutter)
                / MediaStageSeek.lateralFraction,
            accuracy: 0.001
        )
    }

    /// **L'image de la recette : 900 × 3 600.** Sans plancher de largeur, son
    /// cadre ne gardait que la largeur du média ajusté : l'auteur, la date et la
    /// ligne de format passaient chacun sur deux lignes, la dernière débordait
    /// sous le coin arrondi, et la colonne d'actions se posait au milieu de
    /// l'image. Le cadre s'arrête désormais au plancher ; le média garde sa
    /// taille et flotte dedans, sur son hors-champ habillé.
    func test_carded_veryTallImage_keepsTheWidthFloor_andItsMediaFloats() {
        let resolved = resolve(ratio: 900.0 / 3_600.0)

        XCTAssertEqual(resolved.media.height, 603, accuracy: 0.5,
                       "contrainte par la hauteur libre")
        XCTAssertEqual(resolved.media.width, 150.75, accuracy: 0.5,
                       "603 × 0,25 — le média n'est ni rogné ni étiré")
        XCTAssertEqual(resolved.frame.width, MediaGalleryStage.minimumFrameWidth, accuracy: 0.5,
                       "le CADRE s'arrête au plancher de largeur")
        XCTAssertEqual(resolved.frame.height, resolved.media.height, accuracy: 0.5)
        XCTAssertTrue(resolved.letterboxes,
                      "deux bandes latérales, que le ThumbHash habille (#6143)")
    }

    /// **Aucun ratio courant ne change de cadre**, pas même sur le cadre le plus
    /// ÉTROIT qu'un média courant puisse recevoir : la 9:16 d'un lot qui réserve
    /// à la fois le rail et la bande de progression (555 × 0,5625 ≈ 312 pt sur
    /// 390 × 844, 582 × 0,5625 ≈ 327 pt sur l'iPhone 16 Pro réel de la recette).
    ///
    /// Vert des deux côtés du diff, et c'est dit : ce qu'il attrape est le lot
    /// qui REMONTERAIT le plancher. Recopier les 330 du plancher de hauteur
    /// élargirait déjà cette scène de 18 pt.
    func test_theWidthFloor_changesNoCommonRatio_evenOnTheNarrowestCadre() {
        let video = MessageAttachment(
            id: "fixture-video",
            mimeType: "video/mp4",
            fileSize: 4_204_800,
            fileUrl: "https://cdn.meeshy.me/fixture.mp4",
            width: 1_080,
            height: 1_920,
            duration: 12_000,
            uploadedBy: "u-fixture"
        )
        let lots = [MediaGalleryLot.imagesOnly(6), MediaGalleryLot.imagesOnly(5) + [video]]
        let ecrans: [(viewport: CGSize, safeTop: CGFloat, safeBottom: CGFloat)] = [
            (CGSize(width: 390, height: 844), 59, 34),
            (CGSize(width: 402, height: 874), 62, 34),
        ]

        XCTAssertGreaterThan(MediaGalleryStage.corridors(safeTop: 59, safeBottom: 34, attachments: lots[1]).transport, 0,
                             "le second lot réserve bien la bande : c'est lui qui rend le cadre le plus étroit")

        for ecran in ecrans {
            for lot in lots {
                for ratio in [0.8, 0.5625, 16.0 / 9.0] {
                    let resolved = MediaGalleryStage.resolve(
                        viewport: ecran.viewport,
                        mediaRatio: ratio,
                        presentation: .carded,
                        corridors: MediaGalleryStage.corridors(safeTop: ecran.safeTop,
                                                               safeBottom: ecran.safeBottom,
                                                               attachments: lot)
                    )
                    XCTAssertEqual(resolved.frame.width, resolved.media.width, accuracy: 0.5,
                                   "ratio \(ratio) sur \(ecran.viewport) : le plancher de largeur ne doit pas mordre")
                }
            }
        }
    }

    // MARK: - Un média sans proportions connues

    /// Beaucoup de pièces jointes arrivent sans `width` ni `height`. Le cadre ne
    /// peut pas s'ajuster à un ratio qu'il ignore : il prend alors TOUTE la zone
    /// libre, et le média s'y ajuste comme partout ailleurs. Deviner un ratio
    /// serait pire que de n'en avoir aucun — le cadre sauterait à l'arrivée des
    /// dimensions réelles.
    func test_anUnknownRatio_fillsTheFreeRegion_ratherThanGuessing() {
        let resolved = resolve(ratio: nil)

        XCTAssertEqual(resolved.frame.width, 366, accuracy: 0.5)
        XCTAssertEqual(resolved.frame.height, 603, accuracy: 0.5)
        XCTAssertEqual(resolved.media, resolved.frame)
    }

    func test_anAttachmentWithoutDimensions_hasNoRatio_andOneWithThemDoes() {
        XCTAssertNil(MediaGalleryStage.ratio(of: makeAttachment(width: nil, height: nil)))
        XCTAssertNil(MediaGalleryStage.ratio(of: makeAttachment(width: 0, height: 900)))
        XCTAssertEqual(MediaGalleryStage.ratio(of: makeAttachment(width: 1600, height: 900)) ?? 0,
                       16.0 / 9.0, accuracy: 0.001)
    }

    // MARK: - Plein cadre

    /// `.full` n'est pas « le cadre en plus grand » : c'est l'écran entier,
    /// coins droits, couloirs ignorés. Les gestes qui y mènent sont #6142 ; la
    /// géométrie, elle, doit déjà savoir le dire.
    func test_full_takesTheWholeViewport_andLosesItsRadius() {
        let resolved = resolve(ratio: 0.8, presentation: .full)

        XCTAssertEqual(resolved.frame, Self.viewport)
        XCTAssertEqual(resolved.cornerRadius, 0, accuracy: 0.001)
        XCTAssertTrue(resolved.letterboxes,
                      "une 4:5 remplissait sa carte et ne remplit plus l'écran")
    }

    // MARK: - Ce que la galerie demande au solveur

    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"

    private func unit() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.gallery))
    }

    private func corps(_ ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var resultat = ""
        for caractere in code[debut.lowerBound...] {
            resultat.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return resultat }
            }
        }
        return nil
    }

    /// **UN site construit l'entrée du solveur.** Deux sites, c'est deux
    /// plateaux : celui que la page dessine et celui que l'overlay habille
    /// finiraient par diverger d'une gouttière, et rien ne rougirait.
    /// **CE QUE LE SOLVEUR CALCULE DOIT ÊTRE LU** (retour porteur 2026-09-13 :
    /// « ça zoom trop au point où on ne voit plus tout le contenu »).
    ///
    /// `MediaStageFraming.Result` rend deux tailles. `frame` était consommé ;
    /// `media` — le média ajusté par un `aspectFit` dont le doc-comment promet
    /// « jamais de rognage, jamais d'étirement » — ne l'était par AUCUNE vue :
    /// zéro occurrence dans tout le dépôt. Ce qui tenait lieu de contrainte
    /// était un `.aspectRatio(contentMode: .fit)` posé sur `imageLayer`,
    /// c'est-à-dire sur un `ProgressiveCachedImage` dont le corps est un
    /// `ZStack` à quatre branches (dont un `Color.clear`) : sans ratio
    /// explicite, `.aspectRatio` déduit celui de la vue qu'il enveloppe, et un
    /// `ZStack` n'a pas celui de l'image qu'il montre. En plein cadre — où le
    /// cadre EST l'écran — une image très haute débordait donc en haut et en bas.
    ///
    /// > Une loi qui calcule une valeur que personne ne lit ne protège de rien,
    /// > et elle est PIRE qu'absente : son existence et ses tests donnent
    /// > l'illusion que la question est réglée. Les témoins de cette suite
    /// > éprouvaient `aspectFit` et passaient ; le pixel, lui, était rogné.
    ///
    /// Ce témoin ferme la boucle que les autres laissaient ouverte : ils
    /// mesurent ce que la loi CALCULE, celui-ci mesure qu'on l'ÉCOUTE.
    func test_theSolverMediaSize_isActuallyConsumedByTheView() throws {
        let code = try unit()
        XCTAssertTrue(
            code.contains("stage.media.width") && code.contains("stage.media.height"),
            """
            La vue ne consomme pas `stage.media` : le média n'est plus contraint par le \
            solveur, et rien ne garantit qu'il tient dans son cadre. C'est le rognage du \
            plein cadre — la loi calcule juste et personne ne l'écoute.
            """
        )
    }

    /// Le `.aspectRatio` retiré ne doit pas revenir sur la page image : deux
    /// sources pour une même décision, dont une inopérante sur un `ZStack`.
    func test_theImagePage_doesNotReintroduceAnIntrinsicAspectRatio() throws {
        let code = try unit()
        guard let start = code.range(of: "if hasRenderableSource {") else {
            return XCTFail("La page image a changé de forme — la garde ne mesure plus rien.")
        }
        let window = code[start.upperBound...].prefix(300)
        XCTAssertFalse(
            window.contains(".aspectRatio(contentMode: .fit)"),
            """
            `.aspectRatio(contentMode: .fit)` est de retour sur le média. Il ne mord pas \
            sur un `ProgressiveCachedImage` (ZStack sans ratio intrinsèque) et double la \
            décision que `stage.media` porte déjà.
            """
        )
    }

    func test_theGallery_buildsTheSolverInputInExactlyOnePlace() throws {
        let code = try unit()

        XCTAssertEqual(
            code.components(separatedBy: "MediaStageFraming.Input(").count - 1, 1,
            "l'entrée du solveur se compose dans `MediaGalleryStage`, et nulle part ailleurs."
        )
    }

    /// **Ce qui reste au plateau : le rail.** Il quitte le bloc bas du média —
    /// où il partageait la colonne avec la légende et l'auteur — pour son propre
    /// couloir. C'est la moitié structurelle de la loi : le plateau porte ce qui
    /// n'appartient pas au média.
    func test_theRail_livesInThePlateauCorridor_neverOnTheCadre() throws {
        let code = try unit()
        guard let plateau = corps("private var controlsOverlay: some View {", dans: code),
              let couloir = corps("var railCorridor: some View {", dans: code),
              let blocBas = corps("var bottomOverlay: some View {", dans: code) else {
            return XCTFail("le plateau, son couloir bas ou le bloc du média sont introuvables")
        }

        XCTAssertTrue(couloir.contains("ConversationMediaFilmstrip("),
                      "le couloir bas EST la pellicule")
        XCTAssertFalse(blocBas.contains("ConversationMediaFilmstrip("),
                       "la pellicule ne se pose plus sur le cadre : elle reste au plateau")
        XCTAssertTrue(plateau.contains("railCorridor"),
                      "le plateau doit monter son couloir bas")

        guard let haut = plateau.range(of: "xmark"),
              let cadre = plateau.range(of: "cadreRegion"),
              let rail = plateau.range(of: "railCorridor") else {
            return XCTFail("les trois bandes du plateau ne se lisent pas dans l'ordre")
        }
        XCTAssertLessThan(haut.lowerBound, cadre.lowerBound,
                          "le couloir haut vient avant le cadre")
        XCTAssertLessThan(cadre.lowerBound, rail.lowerBound,
                          "et le rail après lui")
    }

    /// **Ce qui se pose sur le cadre part avec lui.** La légende, l'auteur et
    /// leur ligne de format appartiennent au média : ils vivent dans l'overlay
    /// du cadre, jamais dans un couloir.
    ///
    /// **Ce témoin affirmait aussi le transport vidéo jusqu'au 2026-09-12**, et
    /// il avait raison tant que la progression, la durée et le play/pause
    /// étaient UNE vue posée sur le média. #6162 les sépare sur la directive
    /// porteur — la progression descend au couloir (elle PARCOURT le média,
    /// comme le rail parcourt la série), le play/pause reste au centre (il
    /// COMMANDE). La distinction que le témoin tient devient donc plus fine :
    /// le cadre porte ce qui DÉCRIT, le plateau ce qui PARCOURT.
    func test_theCadre_carriesItsOwnOverlay() throws {
        let code = try unit()
        guard let cadre = corps("var cadreOverlay: some View {", dans: code),
              let blocBas = corps("var bottomOverlay: some View {", dans: code) else {
            return XCTFail("`cadreOverlay` ou `bottomOverlay` introuvable")
        }

        XCTAssertFalse(cadre.contains("transportCorridor"),
                       "la progression a quitté le cadre pour le couloir bas (#6162)")
        XCTAssertTrue(cadre.contains("bottomOverlay"),
                      "le bloc légende / auteur / format, lui, reste sur le cadre")
        for porte in ["bottomMetadataOverlay(", "captionOverlay("] {
            XCTAssertTrue(blocBas.contains(porte),
                          "`\(porte)` doit rester dans le bloc porté par le cadre")
        }
    }

    /// La zone libre du cadre est celle que le solveur a rendue — pas une cote
    /// réécrite à la main dans une vue.
    func test_theCadreRegion_isSizedByTheSolver() throws {
        let code = try unit()
        guard let region = corps("var cadreRegion: some View {", dans: code) else {
            return XCTFail("`cadreRegion` introuvable")
        }

        XCTAssertTrue(region.contains("currentStage.frame.width"))
        XCTAssertTrue(region.contains("currentStage.frame.height"))
        XCTAssertTrue(region.contains("currentStage.cornerRadius"),
                      "le rayon vient du solveur : il tombe à 0 en plein cadre")
    }

    // MARK: - Ce que la colonne d'actions a SOUS elle (#6709)

    /// **La colonne se teinte sur ce qui est PEINT sous elle, pas sur le média de
    /// la page.** Recette du 2026-09-16 (Meeshy-iOS26, PR #6761) : depuis #6760 le
    /// chrome s'aligne sur le PLATEAU, et sur la page panorama 4:1 d'un post la
    /// colonne tombe SOUS le cadre (cadre arrêté à y ≈ 598, colonne à y 649), sur le
    /// sol noir de la galerie ; teintée d'après la luminance CLAIRE du panorama, son
    /// glyphe sombre se lisait à 1,16:1. **Même quand la pièce porte une empreinte** :
    /// aucune page ne la peint hors de son cadre.
    func test_laColonneSousLeCadre_surLeSolDuPlateau_seLitSurLeNoir_memeAvecEmpreinte() {
        let panorama = resolve(ratio: 4)
        let piece = makeAttachment(width: 1_600, height: 400, thumbHash: "empreinte")
        let region = Self.region(autour: panorama)

        XCTAssertNil(
            MediaGalleryStage.columnBackdrop(for: piece, stage: panorama, region: region,
                                             columnFrame: Self.colonne(sousLeCadreDe: panorama, dans: region)),
            "hors du cadre, le sol est noir : ni la vignette ni l'empreinte ne sont sous la colonne"
        )
        XCTAssertEqual(MediaChromeScheme.scheme(for: nil, sample: nil), .dark,
                       "sur le noir, le glyphe reste clair")
    }

    /// Dans la bande NUE du cadre — une pièce sans empreinte —, le fond est noir aussi.
    func test_laColonneDansLaBandeDUnPanorama_sansEmpreinte_seLitSurLeNoir() {
        let panorama = resolve(ratio: 4)
        let piece = makeAttachment(width: 1_600, height: 400)
        let region = Self.region(autour: panorama)

        XCTAssertNil(
            MediaGalleryStage.columnBackdrop(for: piece, stage: panorama, region: region,
                                             columnFrame: Self.colonne(dansLaBandeDe: panorama, dans: region)),
            "la bande est noire : la vignette claire du panorama n'est pas sous la colonne"
        )
    }

    /// La bande HABILLÉE peint l'empreinte floutée (#6143) : c'est elle, et elle
    /// seule, que la colonne doit lire — jamais la vignette nette du média.
    func test_laColonneDansLaBande_avecEmpreinte_suitLEmpreinteSeule() throws {
        let panorama = resolve(ratio: 4)
        let piece = makeAttachment(width: 1_600, height: 400, thumbHash: "empreinte")
        let region = Self.region(autour: panorama)
        let fond = try XCTUnwrap(MediaGalleryStage.columnBackdrop(
            for: piece, stage: panorama, region: region,
            columnFrame: Self.colonne(dansLaBandeDe: panorama, dans: region)))

        XCTAssertEqual(fond.thumbHash, "empreinte")
        XCTAssertNil(fond.bitmapURL, "la bande peint l'empreinte, jamais la vignette nette")
    }

    /// Posée SUR le média, la colonne garde la règle de #6693 : la luminance du média.
    /// Le média se lit là où la région le POSE — au milieu —, jamais à son origine :
    /// une colonne au bas d'un portrait est sur lui.
    func test_laColonnePoseeSurLeMedia_suitLeMedia() {
        let portrait = resolve(ratio: 0.8)
        let piece = makeAttachment(width: 1_600, height: 2_000)
        let region = Self.region(autour: portrait)
        let basDuMedia = (region.height + portrait.media.height) / 2
        let surLeMedia = CGRect(x: (region.width + portrait.media.width) / 2 - 56, y: basDuMedia - 60,
                                width: 44, height: 44)

        XCTAssertEqual(MediaGalleryStage.columnBackdrop(for: piece, stage: portrait, region: region,
                                                        columnFrame: surLeMedia),
                       .attachment(piece))
    }

    /// Avant la première mesure — de la colonne ou de sa région —, rien ne dit où est
    /// la colonne : elle garde le fond du média plutôt que de basculer au noir le
    /// temps d'une passe.
    func test_avantSaMesure_laColonneGardeLeFondDuMedia() {
        let panorama = resolve(ratio: 4)
        let piece = makeAttachment(width: 1_600, height: 400)
        let region = Self.region(autour: panorama)

        XCTAssertEqual(MediaGalleryStage.columnBackdrop(for: piece, stage: panorama, region: region,
                                                        columnFrame: .zero),
                       .attachment(piece))
        XCTAssertEqual(MediaGalleryStage.columnBackdrop(for: piece, stage: panorama, region: .zero,
                                                        columnFrame: Self.colonne(sousLeCadreDe: panorama,
                                                                                  dans: region)),
                       .attachment(piece))
    }

    /// La région du plateau autour d'un cadre plus court qu'elle — celle où #6760 pose
    /// le chrome. Le cadre y est au milieu : 16 pt de chaque côté, 120 pt dessus et dessous.
    private static func region(autour stage: MediaStageFraming.Result) -> CGSize {
        CGSize(width: stage.frame.width + 32, height: stage.frame.height + 240)
    }

    /// Une colonne d'une action au bord droit, 12 pt sous le bas du média : dans la
    /// bande du cadre.
    private static func colonne(dansLaBandeDe stage: MediaStageFraming.Result, dans region: CGSize) -> CGRect {
        let basDuMedia = (region.height + stage.media.height) / 2
        return CGRect(x: region.width - 56, y: basDuMedia + 12, width: 44, height: 44)
    }

    /// Une colonne d'une action 51 pt sous le bas du CADRE — l'écart que la recette a
    /// mesuré sur le panorama (cadre arrêté à y ≈ 598, colonne à y 649).
    private static func colonne(sousLeCadreDe stage: MediaStageFraming.Result, dans region: CGSize) -> CGRect {
        let basDuCadre = (region.height + stage.frame.height) / 2
        return CGRect(x: region.width - 56, y: basDuCadre + 51, width: 44, height: 44)
    }

    // MARK: - Fabrique

    private func makeAttachment(width: Int?, height: Int?, thumbHash: String? = nil) -> MessageAttachment {
        MessageAttachment(
            id: "a-\(width ?? -1)x\(height ?? -1)",
            mimeType: "image/jpeg",
            fileSize: 204_800,
            fileUrl: "https://cdn.meeshy.me/a.jpg",
            width: width,
            height: height,
            thumbHash: thumbHash,
            uploadedBy: "u-1"
        )
    }
}
