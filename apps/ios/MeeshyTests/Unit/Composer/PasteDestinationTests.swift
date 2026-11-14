import XCTest
import UIKit
import MeeshySDK
import MeeshyUI
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

    // MARK: - Le bouton « Coller » (décision porteur du 2026-11-11, #13640, #17434)

    private func cible(_ item: StoryPastedItem, _ format: ComposerFormat = .story,
                       visuel: Bool = false, son: Bool = false) -> ComposerPasteTarget {
        ComposerPasteRouting.target(for: item, format: format,
                                    background: ComposerPasteBackground(visual: visuel, sound: son))
    }

    private let image = StoryPastedItem.image(UIImage())
    private let video = StoryPastedItem.video(URL(fileURLWithPath: "/tmp/a.mov"))
    private let audio = StoryPastedItem.audio(URL(fileURLWithPath: "/tmp/a.m4a"))

    func test_target_visualWithoutVisualBackground_becomesTheBackground_evenOverABackgroundSound() {
        XCTAssertEqual(cible(image), .sceneBackground)
        XCTAssertEqual(cible(video), .sceneBackground)
        XCTAssertEqual(cible(image, son: true), .sceneBackground, "un son de fond n'est pas un fond visuel")
        XCTAssertEqual(cible(video, son: true), .sceneBackground)
    }

    func test_target_visualOnAVisualBackground_isPosedOnTheScene() {
        XCTAssertEqual(cible(image, visuel: true), .sceneObject, "le fond déjà posé reste")
        XCTAssertEqual(cible(video, visuel: true, son: true), .sceneObject)
    }

    func test_target_soundWithoutBackgroundSound_becomesTheBackgroundSound_evenOverAVisual() {
        XCTAssertEqual(cible(audio), .sceneBackground)
        XCTAssertEqual(cible(audio, visuel: true), .sceneBackground, "un fond visuel n'est pas un son de fond")
    }

    func test_target_soundOnABackgroundSound_isPosedOnTheScene() {
        XCTAssertEqual(cible(audio, son: true), .sceneObject)
        XCTAssertEqual(cible(audio, visuel: true, son: true), .sceneObject)
    }

    func test_posing_marksOnlyThePastedFamily() {
        let vide = ComposerPasteBackground(visual: false, sound: false)
        XCTAssertEqual(vide.posing(image), ComposerPasteBackground(visual: true, sound: false))
        XCTAssertEqual(vide.posing(audio), ComposerPasteBackground(visual: false, sound: true))
        XCTAssertEqual(vide.posing(.text("x")), vide)
    }

    func test_target_textOnAPost_goesToThePublicationContent() {
        XCTAssertEqual(cible(.text("Bonjour"), .post), .publicationContent)
        XCTAssertEqual(cible(.text("Bonjour"), .post, visuel: true), .publicationContent)
        XCTAssertEqual(cible(.text("Bonjour"), .status), .publicationContent)
    }

    func test_target_textOnAStoryOrAReel_becomesTheSlideLegend() {
        XCTAssertEqual(cible(.text("Bonjour"), .story), .slideLegend)
        XCTAssertEqual(cible(.text("Bonjour"), .reel, visuel: true), .slideLegend)
        XCTAssertEqual(cible(.text(Array(repeating: "mot", count: 40).joined(separator: " ")), .story),
                       .slideLegend, "un texte long comme un texte court : jamais un objet texte de scène")
    }

    func test_background_readsEachFamilyApart() {
        var effets = StoryEffects()
        XCTAssertEqual(ComposerPasteBackground(effects: effets, slideImage: false),
                       ComposerPasteBackground(visual: false, sound: false))
        XCTAssertEqual(ComposerPasteBackground(effects: effets, slideImage: true),
                       ComposerPasteBackground(visual: true, sound: false), "l'image de slide est un fond visuel")
        effets.audioPlayerObjects = [StoryAudioPlayerObject(postMediaId: "s", placement: "overlay", x: 0.5, y: 0.5,
                                                            volume: 1, waveformSamples: [], isBackground: true)]
        XCTAssertEqual(ComposerPasteBackground(effects: effets, slideImage: false),
                       ComposerPasteBackground(visual: false, sound: true), "le son de fond ne compte que pour un son")
    }

    func test_publicationText_emptyContent_takesThePastedText() {
        XCTAssertEqual(ComposerPasteRouting.publicationText(current: "", pasted: "  Bonjour  "), "Bonjour")
    }

    func test_publicationText_existingContent_appendsOnANewLine() {
        XCTAssertEqual(ComposerPasteRouting.publicationText(current: "Déjà écrit", pasted: "Collé"),
                       "Déjà écrit\nCollé", "coller n'efface jamais ce que l'auteur a écrit")
    }

    func test_publicationText_blankPaste_leavesTheContentUntouched() {
        XCTAssertEqual(ComposerPasteRouting.publicationText(current: "Déjà écrit", pasted: " \n "), "Déjà écrit")
    }

    @MainActor
    func test_paste_story_writesTheSlideLegend_andLeavesTheDocumentText() {
        let scene = StoryComposerViewModel()
        var texteDuPost = ""
        ComposerPasteRouting.paste("  Ma légende  ", format: .story, documentText: &texteDuPost, scene: scene)
        XCTAssertEqual(scene.currentSlide.content, "Ma légende", "la story publie ce texte en légende")
        XCTAssertEqual(texteDuPost, "", "le texte du post, qu'une story n'envoie pas, reste vide")
    }

    @MainActor
    func test_paste_reel_writesTheSlideLegend() {
        let scene = StoryComposerViewModel()
        var texteDuPost = ""
        ComposerPasteRouting.paste("Légende du réel", format: .reel, documentText: &texteDuPost, scene: scene)
        XCTAssertEqual(scene.currentSlide.content, "Légende du réel")
        XCTAssertEqual(texteDuPost, "")
    }

    @MainActor
    func test_paste_story_existingLegend_appendsOnANewLine() {
        let scene = StoryComposerViewModel()
        scene.applyContentText("Déjà écrit")
        var texteDuPost = ""
        ComposerPasteRouting.paste("Collé", format: .story, documentText: &texteDuPost, scene: scene)
        XCTAssertEqual(scene.currentSlide.content, "Déjà écrit\nCollé")
    }

    @MainActor
    func test_paste_post_writesTheContent_andLeavesTheSlide() {
        let scene = StoryComposerViewModel()
        var texteDuPost = ""
        ComposerPasteRouting.paste("Bonjour", format: .post, documentText: &texteDuPost, scene: scene)
        XCTAssertEqual(texteDuPost, "Bonjour")
        XCTAssertNil(scene.currentSlide.content)
    }

    func test_host_pastedItems_followThePasteLaw() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        let debut = try XCTUnwrap(source.range(of: "func handlePastedItems("))
        let corps = String(source[debut.upperBound...].prefix(1800))
        XCTAssertTrue(corps.contains("ComposerPasteRouting.target(for: item, format: selectedFormat"),
                      "la destination vient de la loi, avec le format choisi")
        XCTAssertTrue(corps.contains("ComposerPasteBackground(") && corps.contains("effects: viewModel.currentSlide.effects"),
                      "le fond déjà posé compte, par famille")
        XCTAssertTrue(corps.contains("ComposerPasteRouting.paste(contenu, format: selectedFormat"))
        XCTAssertFalse(corps.contains("StoryPastePolicy.placement"), "le texte ne devient plus un objet de scène")
        XCTAssertFalse(corps.contains("backgroundReplacementId"), "coller ne remplace jamais un fond déjà posé")
    }

    func test_pasteEntry_showsTheGlyphOnly_inTheBrandBlue() throws {
        let source = AppSourceGuard.stripComments(try String(contentsOf: Self.appFile("ComposerPasteEntryGate.swift"), encoding: .utf8))
        XCTAssertTrue(source.contains(".labelStyle(.iconOnly)"), "aucun libellé visible")
        XCTAssertTrue(source.contains("MeeshyColors.brandPrimary"), "le glyphe est bleu, couleur de marque")
        XCTAssertTrue(source.contains("ComposerPasteEntry.accessibilityIdentifier"), "la recette l'atteint")
    }

    private static func appFile(_ name: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer/\(name)")
    }
}
