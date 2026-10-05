import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Une image éditée dans la scène retrouve ses réglages et sa comparaison**
/// (#9175). Depuis #9170, une image de composition s'édite en place
/// (`MediaEditTool`) et non plus dans l'éditeur plein écran ; ces témoins
/// tiennent ce que la scène sert à sa place.
final class ComposerMediaAdjustTests: XCTestCase {

    // MARK: - Le sous-outil est servi à l'image POSÉE, et à elle seule

    func test_reglages_sontServisALImagePosee_justeApresLeFiltre() {
        let sections = ComposerInlineEditing.sections(for: .image, hasTrimmableSource: false)
        let filtre = sections.firstIndex(of: .media(.filter))
        XCTAssertEqual(sections.firstIndex(of: .media(.adjust)), filtre.map { $0 + 1 },
                       "On choisit un rendu, puis on le règle.")
    }

    func test_reglages_nonServisAUneVideo_niAuFond() {
        let familles: [ComposerInlineFamily] = [.video, .background(isVideo: false), .background(isVideo: true),
                                                .text, .audio, .sticker, .place]
        for famille in familles {
            XCTAssertFalse(ComposerInlineEditing.sections(for: famille, hasTrimmableSource: true)
                .contains(.media(.adjust)), "\(famille) offrirait un curseur que rien ne peint")
        }
    }

    func test_leRailDeLEditeurDObjet_retireLesReglagesQuandLObjetNeLesPeintPas() {
        XCTAssertFalse(ComposerObjectEditorRail.entries(for: .media, offersAdjust: false).contains(.media(.adjust)))
        XCTAssertTrue(ComposerObjectEditorRail.entries(for: .media).contains(.media(.adjust)))
    }

    func test_lOutil_porteSonMotEtSonGlyphe() {
        XCTAssertTrue(MediaEditTool.served.contains(.adjust))
        XCTAssertFalse(ComposerObjectEditorCopy.media(.adjust).isEmpty)
        XCTAssertFalse(ComposerObjectEditorRail.symbolName(.media(.adjust)).isEmpty)
        for kind in AdjustmentKind.allCases {
            XCTAssertFalse(ComposerAdjustCopy.label(kind).isEmpty, "\(kind) sans intitulé")
        }
    }

    // MARK: - La valeur lue : un écart à l'original, de −100 à +100

    func test_laValeurLue_vautZeroAuNeutre_etCentAuxBornes() {
        for kind in AdjustmentKind.allCases {
            XCTAssertEqual(ComposerAdjustCopy.displayValue(kind, kind.neutralValue), 0, "\(kind)")
            XCTAssertEqual(ComposerAdjustCopy.displayValue(kind, kind.range.upperBound), 100, "\(kind)")
        }
        XCTAssertEqual(ComposerAdjustCopy.displayValue(.exposure, -2), -100)
        XCTAssertEqual(ComposerAdjustCopy.displayValue(.contrast, 1.25), 50,
                       "Un contraste de 1,25 se lit +50, jamais « 1.25 ».")
    }

    // MARK: - Comparer : la scène montre l'ORIGINAL, le modèle ne bouge pas

    private func slide() -> StorySlide {
        var regle = StoryMediaObject(id: "regle", kind: .image, aspectRatio: 1)
        regle.filter = StoryFilter.warm.rawValue
        regle.adjustments = ImageAdjustments(exposure: 0.8)
        var voisin = StoryMediaObject(id: "voisin", kind: .image, aspectRatio: 1)
        voisin.adjustments = ImageAdjustments(contrast: 1.3)
        var effets = StoryEffects()
        effets.mediaObjects = [regle, voisin]
        var slide = StorySlide()
        slide.effects = effets
        return slide
    }

    private func media(_ slide: StorySlide, _ id: String) -> StoryMediaObject? {
        slide.effects.mediaObjects?.first { $0.id == id }
    }

    func test_comparer_montreLOriginalDeLImageComparee_seule() {
        let montree = ComposerLookComparison.shown(slide(), comparing: "regle")
        XCTAssertNil(media(montree, "regle")?.filter)
        XCTAssertNil(media(montree, "regle")?.adjustments)
        XCTAssertEqual(media(montree, "voisin")?.adjustments, ImageAdjustments(contrast: 1.3),
                       "Le voisin garde son rendu : on compare UNE image.")
    }

    func test_sansComparaison_laSceneMontreLeModele() {
        let modele = slide()
        let montree = ComposerLookComparison.shown(modele, comparing: nil)
        XCTAssertEqual(media(montree, "regle")?.adjustments, media(modele, "regle")?.adjustments)
        XCTAssertEqual(media(montree, "regle")?.filter, "warm")
    }

    func test_uneEcriturePendantLaComparaison_nEffacePasLeRenduCompare() {
        let modele = slide()
        var ecrite = ComposerLookComparison.shown(modele, comparing: "regle")
        ecrite.effects.mediaObjects?[0].x = 0.3
        let rendue = ComposerLookComparison.written(ecrite, over: modele, comparing: "regle")
        XCTAssertEqual(media(rendue, "regle")?.x, 0.3, "Le geste fait pendant la comparaison est gardé…")
        XCTAssertEqual(media(rendue, "regle")?.filter, "warm", "…et le rendu comparé revient au modèle.")
        XCTAssertEqual(media(rendue, "regle")?.adjustments, ImageAdjustments(exposure: 0.8))
    }
}
