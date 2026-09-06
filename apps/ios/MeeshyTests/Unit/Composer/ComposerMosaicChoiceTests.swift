import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **L'auteur peut demander ce que le lecteur sait rendre** — l'écart composer
/// ↔ reader mesuré le 2026-09-06.
///
/// Le fil honore cinq dispositions ; le composer n'en choisissait aucune, donc
/// toute publication partait dans le repli. Quatre dispositions écrites,
/// testées et peintes étaient **inatteignables depuis l'app**.
///
/// > Le témoin qui attrape ce genre d'écart n'interroge aucune vue : il demande
/// > si ce que l'auteur choisit ARRIVE dans ce qui part.
final class ComposerMosaicChoiceTests: XCTestCase {

    private func slide(_ texte: String) -> StorySlide {
        var s = StorySlide()
        s.effects.textObjects = [StoryTextObject(id: "t-\(texte)", text: texte, x: 0.5, y: 0.5)]
        return s
    }

    // MARK: - Le choix VOYAGE

    /// **LE témoin du lot.** Sans lui, le contrôle serait un décor : l'auteur
    /// choisirait « en vague » et la publication partirait en carrousel.
    func test_laDispositionChoisie_partAvecLaPublication() throws {
        for mode in MosaicLayoutMode.allCases {
            let porte = try XCTUnwrap(ComposerStoryCanvas.publishedSlide(
                format: .post, sceneIsPresent: true,
                slides: [slide("un"), slide("deux")], layout: mode))
            XCTAssertEqual(porte.canvasV3?.layout, mode, "\(mode)")
        }
    }

    /// **Ne rien choisir laisse le modèle décider.** Le composer n'écrit pas le
    /// repli en dur : `nil` signifie « je n'impose rien », et c'est
    /// `resolvedLayout` qui tranche. Écrire `.carousel` ici figerait dans
    /// chaque publication une valeur que le jour où le repli change, personne
    /// ne penserait à relire.
    func test_aucunChoix_nEcritAucuneDisposition() throws {
        let porte = try XCTUnwrap(ComposerStoryCanvas.publishedSlide(
            format: .post, sceneIsPresent: true,
            slides: [slide("un"), slide("deux")], layout: nil))
        XCTAssertNil(porte.canvasV3?.layout)
        XCTAssertEqual(porte.canvasV3?.resolvedLayout, MosaicLayoutMode.fallback,
                       "le modèle garde le dernier mot sur ce qui s'affiche")
    }

    // MARK: - Le contrôle EXISTE là où il a un EFFET (loi 4)

    /// **L'invariant central, et il lie les deux moitiés du lot.** Le contrôle
    /// est offert exactement quand la disposition VOYAGE. Une seule des deux
    /// règles qui bougerait donnerait soit un contrôle inerte — l'auteur
    /// choisit, rien ne change —, soit une capacité muette : la publication
    /// transporte une disposition que rien n'a permis de choisir.
    ///
    /// Les formats sont énumérés à la main : `ComposerFormat` n'est pas
    /// `CaseIterable`, et le lui rendre pour la commodité d'un témoin
    /// modifierait un type de production. Un format NEUF ne serait donc pas
    /// couvert ici — mais il casserait le `switch` exhaustif de
    /// `ComposerPublishChannel.channel(for:)`, qui est le vrai site où
    /// l'oubli rougit.
    func test_leControleEstOffert_exactementQuandLaDispositionVoyage() throws {
        for format in [ComposerFormat.story, .post, .reel, .status] {
            for compte in [1, 2, 4] {
                let slides = (0..<compte).map { slide("s\($0)") }
                let porte = ComposerStoryCanvas.publishedSlide(
                    format: format, sceneIsPresent: true,
                    slides: slides, layout: .wave)
                let voyage = porte?.canvasV3?.layout == .wave
                XCTAssertEqual(
                    ComposerMosaicChoice.isServed(slideCount: compte, format: format),
                    voyage,
                    "\(format) / \(compte) slides : le contrôle et le transport doivent " +
                    "s'accorder — sinon l'un des deux ment")
            }
        }
    }

    /// Une slide SEULE n'a rien à disposer. Offrir le contrôle y proposerait un
    /// choix entre cinq façons d'arranger un élément.
    func test_uneSeuleSlide_nOffrePasLeControle() {
        XCTAssertFalse(ComposerMosaicChoice.isServed(slideCount: 1, format: .post))
        XCTAssertFalse(ComposerMosaicChoice.isServed(slideCount: 0, format: .post))
    }

    /// Une STORY publie par le canal de la SCÈNE : son canvas ne voyage pas
    /// comme document, donc la disposition n'y a aucun effet.
    func test_uneStory_nOffrePasLeControle() {
        XCTAssertFalse(ComposerMosaicChoice.isServed(slideCount: 3, format: .story))
    }

    // MARK: - L'éventail

    /// **Aucune disposition n'est orpheline.** Le jour où un sixième mode
    /// naîtra, ce témoin tombera — ce qui est exactement le service attendu :
    /// un mode que le lecteur rend et que l'éventail n'offre pas est
    /// inatteignable, et rien d'autre ne le dirait.
    func test_lEventail_offreTOUTESLesDispositions() {
        XCTAssertEqual(Set(ComposerMosaicChoice.ordered),
                       Set(MosaicLayoutMode.allCases))
        XCTAssertEqual(ComposerMosaicChoice.ordered.count,
                       MosaicLayoutMode.allCases.count,
                       "aucun doublon dans l'ordre servi")
    }

    /// Le premier de la liste est ce qu'on obtient sans rien choisir — sinon
    /// l'éventail présenterait comme tête de liste une disposition que
    /// personne n'a demandée.
    func test_lePremierDeLEventail_estLeRepli() {
        XCTAssertEqual(ComposerMosaicChoice.ordered.first, MosaicLayoutMode.fallback)
    }

    /// Un libellé vide, ou deux modes qui portent le même, rendraient le choix
    /// impossible à faire à l'écran.
    func test_chaqueDisposition_aUnLibelleEtUnGlypheDistincts() {
        let libelles = MosaicLayoutMode.allCases.map(ComposerMosaicChoice.label)
        let glyphes = MosaicLayoutMode.allCases.map(ComposerMosaicChoice.symbol)
        XCTAssertFalse(libelles.contains(where: \.isEmpty))
        XCTAssertEqual(Set(libelles).count, libelles.count, "deux libellés identiques")
        XCTAssertEqual(Set(glyphes).count, glyphes.count, "deux glyphes identiques")
    }
}
