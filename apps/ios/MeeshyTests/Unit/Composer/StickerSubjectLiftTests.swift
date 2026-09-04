import XCTest
import UIKit
@testable import Meeshy
@testable import MeeshyUI

/// **Détourer un sujet d'une photo en sticker** (#3955).
///
/// Les témoins portent sur ce qui se DÉCIDE — la disponibilité, la borne, le
/// nom de chaque échec, et le fait que l'entrée existe. Le détourage lui-même
/// est un modèle Vision : sa qualité ne se prouve pas par assertion, et un
/// témoin qui l'exigerait serait un test de l'OS, pas du produit.
final class StickerSubjectLiftTests: XCTestCase {

    // MARK: - La borne est LUE, jamais réécrite

    /// Le sticker détouré et le sticker collé entrent dans le MÊME magasin, avec
    /// le MÊME budget. Deux bornes écrites séparément divergeraient au premier
    /// ajustement, et la divergence ne se verrait que sur la moitié rarement
    /// utilisée.
    func test_laBorne_estCelleDeLaSurfaceStickers() {
        XCTAssertEqual(StickerSubjectLift.maxSide,
                       PasteDestination.resolve(surface: .stickers, ingest: .image).maxSide)
        XCTAssertEqual(StickerSubjectLift.maxSide, 512)
    }

    // MARK: - Chaque échec porte son nom

    /// « Ça n'a pas marché » ne dit pas à l'utilisateur s'il doit choisir une
    /// AUTRE photo ou mettre son téléphone à jour. Les trois cas sont distincts
    /// parce que les trois gestes de réparation le sont.
    func test_lesTroisEchecs_sontDistincts() {
        let failures: Set<StickerSubjectLift.Failure> = [.unsupported, .unreadable, .noSubject]

        XCTAssertEqual(failures.count, 3)
    }

    /// Des octets qui ne sont pas une image ne peuvent pas produire « aucun
    /// sujet » : l'utilisateur réessaierait indéfiniment sur un fichier qui
    /// n'est pas une photo.
    @available(iOS 17.0, *)
    func test_desOctetsIllisibles_rendentUnreadable_jamaisNoSubject() {
        XCTAssertThrowsError(try StickerSubjectLift.lift(imageData: Data([0x00, 0x01, 0x02]))) { error in
            XCTAssertEqual(error as? StickerSubjectLift.Failure, .unreadable)
        }
    }

    /// Une image UNIE ne produit JAMAIS de sticker — c'est le refus le plus
    /// fréquent, et le seul que l'utilisateur peut corriger seul.
    ///
    /// Le témoin n'épingle pas QUEL échec : sur un simulateur, le modèle de
    /// segmentation peut refuser la requête au lieu de rendre zéro instance.
    /// Épingler `.noSubject` ferait rougir ce test pour une raison qui n'est pas
    /// la nôtre ; ce qui doit tenir, c'est qu'aucune image ne sort.
    @available(iOS 17.0, *)
    func test_uneImageUnie_neProduitAucunSticker() throws {
        let uni = UIGraphicsImageRenderer(size: CGSize(width: 64, height: 64)).image { context in
            UIColor.gray.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 64, height: 64))
        }
        let data = try XCTUnwrap(uni.pngData())

        XCTAssertThrowsError(try StickerSubjectLift.lift(imageData: data))
    }

    // MARK: - L'entrée EXISTE, et seulement là où elle sert

    /// **Un outil non servi est ABSENT, jamais grisé** (loi 4). Le détourage est
    /// une API iOS 17 et le plancher du projet est 16 : une entrée grisée
    /// promettrait à un utilisateur d'iOS 16 une capacité que son appareil n'a
    /// pas.
    func test_laCapacite_nEstOfferteQueSiLAppareilSaitDetourer() {
        let sansDetourage = StoryStickerLibraryProvider(recents: { [] }, paste: { _ in [] })
        XCTAssertFalse(sansDetourage.canLift)

        let avecDetourage = StoryStickerLibraryProvider(
            recents: { [] }, paste: { _ in [] }, lift: { _ in [] })
        XCTAssertTrue(avecDetourage.canLift)
    }

    /// La surface doit MONTER l'entrée — une capacité injectée que rien
    /// n'appelle est exactement la panne muette du #4925, sur une autre feature.
    func test_laPalette_monteLEntreeDeDetourage() throws {
        let repo = MyStoriesSourceCorpus.appRoot()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let url = repo.appendingPathComponent(
            "packages/MeeshySDK/Sources/MeeshyUI/Story/StickerPickerView+Emoji.swift")
        let source = MyStoriesSourceCorpus.strippingComments(
            try String(contentsOf: url, encoding: .utf8))

        XCTAssertTrue(source.contains("stickerLibrary.canLift"),
                      "l'entrée doit être conditionnée par la capacité RÉELLEMENT injectée.")
        XCTAssertTrue(source.contains("stickerLibrary.lift(imageData:"),
                      "…et taper l'entrée doit atteindre le détourage : sinon c'est une affordance inerte.")
    }

    /// Et l'app doit INJECTER la capacité, faute de quoi l'entrée ci-dessus
    /// n'apparaît jamais — deux moitiés justes qui ne se rencontrent pas.
    func test_lApp_injecteLaCapaciteDeDetourage() throws {
        let source = try MyStoriesSourceCorpus.text(
            of: "Meeshy/Features/Main/Composer/StickerLibraryPaste.swift")

        // **Deux FAITS, jamais une signature.** Ce témoin citait la chaîne
        // `"lift: StickerSubjectLift.isAvailable"` — c'est-à-dire un ternaire
        // écrit tel quel à l'argument. Ce ternaire ne compilait pas : entre une
        // fermeture littérale et `nil`, Swift n'a aucun type à unifier, et le
        // contrat porte de surcroît `@MainActor @Sendable`. La forme qui compile
        // sort la décision dans une variable TYPÉE, puis passe `lift: lift`.
        //
        // Rien de ce que la garde protège n'a bougé — la capacité est toujours
        // injectée, toujours derrière la disponibilité de l'API. Les deux
        // assertions le disent séparément et survivent à la prochaine
        // réécriture : une garde qui cite une signature est un inventaire à
        // tenir à jour, et elle rougit pour des raisons qui ne sont pas les
        // siennes — ici, pour un correctif de COMPILATION.
        XCTAssertTrue(source.contains("StickerSubjectLift.isAvailable"),
                      "l'injection doit rester gardée par la disponibilité de l'API.")
        XCTAssertTrue(source.contains("lift: lift"),
                      "…et la capacité ainsi décidée doit être REMISE au provider : "
                      + "une variable calculée puis non passée aurait l'air d'être injectée.")
        XCTAssertTrue(source.contains("StickerLibraryPaste.save(image:"),
                      "le sujet détouré doit entrer par la MÊME queue d'écriture que le collage.")
    }
}
