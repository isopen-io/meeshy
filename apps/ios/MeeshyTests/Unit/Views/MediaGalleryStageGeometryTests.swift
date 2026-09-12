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

    // MARK: - Fabrique

    private func makeAttachment(width: Int?, height: Int?) -> MessageAttachment {
        MessageAttachment(
            id: "a-\(width ?? -1)x\(height ?? -1)",
            mimeType: "image/jpeg",
            fileSize: 204_800,
            fileUrl: "https://cdn.meeshy.me/a.jpg",
            width: width,
            height: height,
            uploadedBy: "u-1"
        )
    }
}
