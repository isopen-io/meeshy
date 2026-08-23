import XCTest
@testable import Meeshy

/// C5 / règle **O12 — LA SURFACE DÉCIDE**, étendue par la directive produit du
/// 2026-08-23 : *« on doit pouvoir coller des images, des documents dont les
/// stickers, et ça doit être pris en compte et propagé — sous iOS ET iPadOS. »*
///
/// ## Ce que cette suite corrige dans le plan d'origine
///
/// Le plan C5 ne nommait que des IMAGES (`PasteButton` + « Mes stickers »). Or
/// le composer accepte quatre formats, dont le post, qui porte des documents.
/// Un collage limité aux images aurait avalé en silence tout ce qui n'est pas
/// une image — le pire des comportements, puisque le presse-papier ne dit pas
/// pourquoi rien ne s'est passé.
///
/// ## Le pipeline n'est PAS neuf, et c'est le point
///
/// `ComposerDropResolver` / `ComposerIngestRouter` résolvent déjà tout cela pour
/// la barre de conversation : image avec ou sans fichier sous-jacent, document,
/// vidéo, audio, refus des dossiers, autorisation sandbox, toast nommant le
/// fichier qui échoue. Le composer les RÉUTILISE. En écrire un second serait se
/// condamner à corriger deux fois chaque cas limite du presse-papier iOS — et
/// l'histoire de ce fichier montre qu'il y en a beaucoup.
///
/// ## La règle, en deux axes indépendants
///
/// La SURFACE décide du budget et de la mémorisation ; le TYPE COLLÉ décide du
/// produit. Les croiser en une seule table aurait fabriqué huit cas dont six
/// faux.
///
/// | surface     | budget image | écrit dans « Mes stickers » |
/// |-------------|--------------|-----------------------------|
/// | `.scene`    | 2048 px      | **non**                     |
/// | `.stickers` | 512 px       | **oui**                     |
///
/// | type collé          | produit                    |
/// |---------------------|----------------------------|
/// | image               | objet média / sticker      |
/// | vidéo · audio       | objet média                |
/// | document            | **pièce jointe**           |
final class PasteDestinationTests: XCTestCase {

    // MARK: - Axe 1 — la surface décide du budget et de la mémorisation

    /// 2048 et non 512 : un média collé dans la scène est du CONTENU, il doit
    /// survivre au zoom et à l'export. Le rétrécir au format sticker le
    /// dégraderait irréversiblement.
    func test_scene_keepsTheFullResolutionBudget() {
        XCTAssertEqual(PasteDestination.resolve(surface: .scene, ingest: .image).maxSide, 2048)
    }

    /// 512 px côté long — le budget d'un sticker. Le downsample se fait AVANT de
    /// matérialiser l'image en mémoire (ImageIO) : décoder une photo de 12 Mpx
    /// pour la réduire ensuite ferait un pic mémoire pour rien.
    func test_stickers_clampsToTheStickerBudget() {
        XCTAssertEqual(PasteDestination.resolve(surface: .stickers, ingest: .image).maxSide, 512)
    }

    /// L'assertion la plus importante du fichier. Un collage dans la scène qui
    /// écrirait dans « Mes stickers » ferait grossir une bibliothèque que
    /// l'auteur n'a jamais alimentée volontairement. La promotion média →
    /// sticker existe, mais c'est une action EXPLICITE d'inspecteur.
    func test_scene_neverWritesToTheLibrary() {
        XCTAssertFalse(PasteDestination.resolve(surface: .scene, ingest: .image).libraryWrite)
    }

    func test_stickers_keepsWhatWasPasted() {
        XCTAssertTrue(PasteDestination.resolve(surface: .stickers, ingest: .image).libraryWrite)
    }

    // MARK: - Axe 2 — le type collé décide du produit

    func test_image_pastedIntoTheScene_becomesAMediaObject() {
        XCTAssertEqual(PasteDestination.resolve(surface: .scene, ingest: .image).product, .mediaObject)
    }

    func test_image_pastedIntoTheStickerPanel_becomesASticker() {
        XCTAssertEqual(PasteDestination.resolve(surface: .stickers, ingest: .image).product, .sticker)
    }

    /// Vidéo et audio sont du contenu de scène comme l'image — ils ont un
    /// rendu dans le canevas. Ce n'est pas le cas d'un document.
    func test_videoAndAudio_becomeMediaObjects() {
        XCTAssertEqual(PasteDestination.resolve(surface: .scene, ingest: .video).product, .mediaObject)
        XCTAssertEqual(PasteDestination.resolve(surface: .scene, ingest: .audio).product, .mediaObject)
    }

    /// **Le cas que le plan d'origine avait oublié.** Un PDF collé dans le
    /// composer n'a pas de rendu dans le canevas : il devient une pièce jointe
    /// du document, comme dans la barre de conversation. L'avaler en silence
    /// parce qu'il n'est pas une image serait le pire comportement — le
    /// presse-papier ne dit jamais pourquoi rien ne s'est passé.
    func test_document_becomesAnAttachment_neverSilentlyDropped() {
        XCTAssertEqual(PasteDestination.resolve(surface: .scene, ingest: .file).product, .attachment)
    }

    /// Un document collé dans le panneau Stickers n'est pas un sticker : la
    /// surface ne peut pas transformer la NATURE de ce qui est collé, seulement
    /// son budget et sa mémorisation. Il reste une pièce jointe.
    func test_document_pastedIntoTheStickerPanel_isStillAnAttachment() {
        let resolved = PasteDestination.resolve(surface: .stickers, ingest: .file)
        XCTAssertEqual(resolved.product, .attachment)
        XCTAssertFalse(resolved.libraryWrite, "Un document n'entre pas dans « Mes stickers »")
    }

    // MARK: - Les deux axes restent indépendants

    /// Si les deux surfaces convergeaient un jour, la règle O12 aurait disparu
    /// sans que les assertions ci-dessus le disent forcément — elles
    /// passeraient toutes en vérifiant une seule et même valeur. Ce test
    /// verrouille la DIFFÉRENCE elle-même.
    func test_theTwoSurfacesNeverConverge_forImages() {
        let scene = PasteDestination.resolve(surface: .scene, ingest: .image)
        let stickers = PasteDestination.resolve(surface: .stickers, ingest: .image)
        XCTAssertNotEqual(scene.product, stickers.product)
        XCTAssertNotEqual(scene.maxSide, stickers.maxSide)
        XCTAssertNotEqual(scene.libraryWrite, stickers.libraryWrite)
    }

    /// Le produit d'un document ne dépend PAS de la surface — c'est ce qui
    /// prouve que les deux axes sont bien indépendants et non une table croisée
    /// déguisée.
    func test_theProductOfADocument_doesNotDependOnTheSurface() {
        XCTAssertEqual(
            PasteDestination.resolve(surface: .scene, ingest: .file).product,
            PasteDestination.resolve(surface: .stickers, ingest: .file).product
        )
    }
}
