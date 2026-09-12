import XCTest
import CoreGraphics
import MeeshySDK
@testable import Meeshy

/// **Le hors-champ d'un média est habillé par son ThumbHash — dans les DEUX
/// états** (#6143, spec `2026-09-12-lecture-media-plateau-design.md` § 2.1).
///
/// Un média qui ne remplit pas son cadre laisse des bandes. Elles portent le
/// hachage FLOUTÉ du média quand il en a un, le noir sinon : jamais une couleur
/// inventée, jamais un fond par défaut. C'est la loi 11 — personne ne lit du
/// vide — appliquée à une bande.
///
/// ## Pourquoi ces témoins s'écrivent sur l'état PLEIN
///
/// Parce que c'est le seul endroit où la règle juste et la règle FAUSSE rendent
/// des verdicts différents. Une image 4:5 REMPLIT son cadre (366 × 457,5) et ne
/// flotte qu'une fois l'écran pris (390 × 487,5 dans 390 × 844) ; conditionner
/// le fond au letterbox du seul état CADRÉ passerait tous les témoins écrits
/// là — et garantirait du noir exactement dans l'état où l'on voulait l'éviter.
///
/// Et le piège ne se limite pas aux images courtes : **aucune nature ne remplit
/// l'écran en plein cadre.** Même une scène 9:16 y flotte, l'écran d'un
/// iPhone 16 Pro étant en 0,462 — plus étroit qu'elle.
@MainActor
final class MediaGalleryLetterboxDressingTests: XCTestCase {

    // MARK: - Fabriques

    private static let viewport = CGSize(width: 390, height: 844)

    private func stage(
        ratio: CGFloat,
        _ presentation: MediaStageFraming.Presentation
    ) -> MediaStageFraming.Result {
        MediaGalleryStage.resolve(
            viewport: Self.viewport,
            mediaRatio: ratio,
            presentation: presentation,
            corridors: MediaGalleryStage.corridors(safeTop: 59, safeBottom: 34, mediaCount: 6)
        )
    }

    // MARK: - L'état PLEIN — là où le défaut vivait

    /// **LE témoin de l'issue.** Une 4:5 remplit sa carte et ne remplit plus
    /// l'écran : si le fond était conditionné au letterbox du cadré, elle
    /// perdrait son habillage au moment précis où elle en a besoin.
    func test_full_portraitImage_isDressedByItsThumbHash_thoughItFilledItsCard() {
        let carded = stage(ratio: 0.8, .carded)
        let full = stage(ratio: 0.8, .full)

        XCTAssertFalse(carded.letterboxes, "elle remplissait sa carte…")
        XCTAssertTrue(full.letterboxes, "…et elle ne remplit plus l'écran")

        XCTAssertEqual(
            MediaGalleryStage.backdrop(stage: full, thumbHash: "hachage"),
            .thumbHash("hachage"),
            "le plein cadre FABRIQUE son propre hors-champ : il s'habille comme l'autre"
        )
    }

    /// **Aucune nature ne remplit l'écran en plein cadre** — pas même une scène
    /// 9:16, qui s'y arrête à 693 pt de haut. Le témoin balaie les trois natures
    /// de la galerie pour que « le plein écran est le cas particulier d'une
    /// vidéo courte » ne puisse plus s'écrire.
    func test_full_everyNature_letterboxes_andEveryNatureIsDressed() {
        for ratio in [0.8, 16.0 / 9.0, 0.5625] {
            let full = stage(ratio: ratio, .full)

            XCTAssertTrue(full.letterboxes,
                          "un média en \(ratio) laisse du hors-champ une fois l'écran pris")
            XCTAssertEqual(MediaGalleryStage.backdrop(stage: full, thumbHash: "hachage"),
                           .thumbHash("hachage"),
                           "…et ce hors-champ s'habille")
        }
    }

    // MARK: - L'état CADRÉ — l'autre moitié des « deux états »

    /// Le 16:9 est le seul ratio où le plancher mord : le cadre s'arrête à
    /// 330 pt, le média n'en fait que 206, et les deux bandes qui restent sont
    /// DANS la carte.
    func test_carded_wideVideo_isDressedToo_thatIsWhatTwoStatesMeans() {
        let carded = stage(ratio: 16.0 / 9.0, .carded)

        XCTAssertTrue(carded.letterboxes,
                      "un cadre plus haut que son média laisse deux bandes")
        XCTAssertEqual(MediaGalleryStage.backdrop(stage: carded, thumbHash: "hachage"),
                       .thumbHash("hachage"))
    }

    /// **Un média qui remplit son cadre ne fait peindre AUCUNE couche.** C'est
    /// la règle que `StoryLetterboxFill` porte depuis la story : peindre sous un
    /// média qui couvre tout serait un layer de plus, jamais un pixel de plus.
    func test_aMediumThatFillsItsCard_paintsNothingUnderneath() {
        XCTAssertEqual(MediaGalleryStage.backdrop(stage: stage(ratio: 0.8, .carded),
                                                  thumbHash: "hachage"),
                       .none)
    }

    // MARK: - Le noir, réponse JUSTE et non repli

    /// Un média sans hachage n'a aucune matière à étirer. Le noir est alors la
    /// réponse honnête — inventer une couleur moyenne serait peindre ce que
    /// personne n'a mesuré.
    func test_withoutAThumbHash_theOffFieldStaysBlack() {
        let full = stage(ratio: 0.8, .full)

        XCTAssertEqual(MediaGalleryStage.backdrop(stage: full, thumbHash: nil), .none)
        XCTAssertEqual(MediaGalleryStage.backdrop(stage: full, thumbHash: ""), .none)
    }

    /// **La galerie ne tient pas sa propre table de règles.** La cascade des
    /// sources vit dans `StoryLetterboxFill` ; la recopier ici ferait diverger
    /// les deux surfaces le jour où l'une changerait, sans que rien ne rougisse.
    func test_theRule_delegatesToTheSDKTable_neverACopy() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.gallery))

        XCTAssertTrue(code.contains("StoryLetterboxFill.source(thumbHash:"),
                      "la règle d'app DÉLÈGUE la cascade au SDK")
        XCTAssertEqual(
            code.components(separatedBy: "MediaGalleryStage.backdrop(").count - 1, 2,
            "une page image, une page vidéo — et aucun troisième site pour en décider autrement"
        )
    }

    // MARK: - Ce que les pages PEIGNENT

    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"

    /// **Un témoin de règle ne dit pas qui la peint.** Les deux pages posaient
    /// un `Color.black` nu sous leur média ; la règle la plus juste du monde ne
    /// change rien tant qu'aucune couche ne la rend.
    func test_bothPages_mountTheDressedBackdrop_underTheirMedium() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.gallery))
        guard let image = code.range(of: "struct GalleryImagePage"),
              let video = code.range(of: "struct GalleryVideoPage") else {
            return XCTFail("les deux pages de la galerie sont introuvables")
        }

        let pageImage = String(code[image.lowerBound..<video.lowerBound])
        let pageVideo = String(code[video.lowerBound...])

        XCTAssertTrue(pageImage.contains("MediaStageBackdrop("),
                      "la page image doit poser le fond habillé sous son média")
        XCTAssertTrue(pageVideo.contains("MediaStageBackdrop("),
                      "la page vidéo aussi — la loi ne connaît pas la nature du média")
    }

    /// La couche d'habillage lit l'opacité du SDK, jamais une valeur voisine :
    /// deux surfaces qui habillent du hors-champ avec deux opacités feraient
    /// deux produits.
    func test_theBackdrop_borrowsTheSDKOpacity_neverItsOwn() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.gallery))

        XCTAssertTrue(code.contains("StoryLetterboxFill.fillOpacity"),
                      "l'opacité de la bande est celle du SDK")
    }
}
