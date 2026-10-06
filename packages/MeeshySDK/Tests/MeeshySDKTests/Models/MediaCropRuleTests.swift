import XCTest
@testable import MeeshySDK

/// #5085 — **un recadrage est une BORNE, jamais un ré-encodage.**
final class MediaCropRuleTests: XCTestCase {

    /// L'absence de recadrage s'écrit, et se reconnaît.
    func test_leCadreEntier_estLAbsenceDeRecadrage() {
        XCTAssertTrue(MediaCropRect.full.isFull)
        XCTAssertFalse(MediaCropRect(x: 0.1, y: 0, width: 0.9, height: 1).isFull)
    }

    /// **Une borne qui déborde ne casse rien ICI**, et c'est le piège : le
    /// moteur clippe, donc le rendu paraît juste. Elle voyage pourtant jusqu'aux
    /// deux autres clients et jusqu'à l'export, où une multiplication par la
    /// taille réelle en fait autre chose.
    func test_unRectangleQuiDéborde_estRamenéDansLaSource() {
        let r = MediaCropRule.clamped(MediaCropRect(x: -0.2, y: 0.5, width: 2, height: 2))
        XCTAssertEqual(r.x, 0, accuracy: 0.0001)
        XCTAssertEqual(r.y, 0.5, accuracy: 0.0001)
        XCTAssertEqual(r.x + r.width, 1, accuracy: 0.0001)
        XCTAssertEqual(r.y + r.height, 1, accuracy: 0.0001)
    }

    /// **Une largeur nulle rendrait le média INVISIBLE sans rien signaler.**
    /// Le plancher garde une bande étroite : fausse d'un cheveu, mais visible —
    /// et c'est le seul des deux états où l'auteur comprend ce qui se passe.
    func test_uneDimensionNulle_gardeUneBandeVisible() {
        let r = MediaCropRule.clamped(MediaCropRect(x: 0.5, y: 0.5, width: 0, height: -3))
        XCTAssertGreaterThanOrEqual(r.width, MediaCropRule.minimumSide)
        XCTAssertGreaterThanOrEqual(r.height, MediaCropRule.minimumSide)
    }

    /// **Le plancher tient AUSSI quand l'ORIGINE déborde** — et c'est le cas
    /// que le témoin voisin ne pouvait pas attraper.
    ///
    /// Écrit naïvement, `clamped` borne l'origine à `1` puis la dimension à
    /// `1 - origine` : la seconde borne DÉFAIT la première, et `min(max(0.01,
    /// h), 0)` rend `0` — le média invisible que le plancher existe pour
    /// empêcher. Sur une origine INTERNE (`0,5`), les deux écritures
    /// s'accordent : le témoin ne peut donc pas se poser là, et c'est pour ça
    /// que le défaut a vécu jusqu'au 2026-09-04, trouvé par le portage
    /// TypeScript de la même loi (#5085).
    func test_lePlancher_tientQuandLOrigineDéborde() {
        let r = MediaCropRule.clamped(MediaCropRect(x: 5, y: 5, width: 0.5, height: 0.5))
        XCTAssertGreaterThanOrEqual(r.width, MediaCropRule.minimumSide)
        XCTAssertGreaterThanOrEqual(r.height, MediaCropRule.minimumSide)
        XCTAssertLessThanOrEqual(r.x + r.width, 1.0001)
        XCTAssertLessThanOrEqual(r.y + r.height, 1.0001)
    }

    /// `LIBRE` n'impose aucune forme — c'est la seule des quatre qui laisse
    /// l'auteur décider, donc elle rend le cadre entier.
    func test_libre_neRecadrePas() {
        XCTAssertTrue(MediaCropRule.centered(ratio: .free, sourceRatio: 1.5).isFull)
    }

    /// **Le rapport de la SOURCE change le rectangle**, et c'est tout l'intérêt
    /// du paramètre : un 1:1 posé sur un panoramique et sur un portrait doit
    /// rendre deux rectangles DIFFÉRENTS en fractions, pour rendre la même
    /// forme à l'écran.
    func test_laMêmeProportion_surDeuxSources_rendDeuxRectangles() {
        let surPano = MediaCropRule.centered(ratio: .square, sourceRatio: 2)
        let surPortrait = MediaCropRule.centered(ratio: .square, sourceRatio: 0.5)
        XCTAssertNotEqual(surPano, surPortrait)
        // …mais la même forme : ratio source × (w/h) == 1 dans les deux cas.
        XCTAssertEqual(MediaCropRule.effectiveRatio(sourceRatio: 2, crop: surPano),
                       1, accuracy: 0.0001)
        XCTAssertEqual(MediaCropRule.effectiveRatio(sourceRatio: 0.5, crop: surPortrait),
                       1, accuracy: 0.0001)
    }

    /// Le rectangle est CENTRÉ : l'auteur choisit une forme, pas un cadrage.
    func test_leRectangle_estCentré() {
        let r = MediaCropRule.centered(ratio: .square, sourceRatio: 2)
        XCTAssertEqual(r.x + r.width / 2, 0.5, accuracy: 0.0001)
        XCTAssertEqual(r.y + r.height / 2, 0.5, accuracy: 0.0001)
    }

    /// Une source qui a DÉJÀ la proportion visée n'est pas recadrée.
    func test_uneSourceDéjàAuFormat_gardeSonCadreEntier() {
        XCTAssertTrue(MediaCropRule.centered(ratio: .square, sourceRatio: 1).isFull)
    }

    /// **Le rapport EFFECTIF est ce que la carte doit ajuster**, pas
    /// `aspectRatio` : un média recadré n'a plus les proportions de son fichier.
    /// S'en tenir à `aspectRatio` peindrait la source entière dans un cadre
    /// recadré — l'aperçu mentirait sur le rendu, ce que la loi 6 interdit.
    func test_leRapportEffectif_suitLeRecadrage() {
        let moitiéLargeur = MediaCropRect(x: 0.25, y: 0, width: 0.5, height: 1)
        XCTAssertEqual(
            MediaCropRule.effectiveRatio(sourceRatio: 2, crop: moitiéLargeur),
            1, accuracy: 0.0001)
        XCTAssertEqual(
            MediaCropRule.effectiveRatio(sourceRatio: 2, crop: nil),
            2, accuracy: 0.0001)
        XCTAssertEqual(
            MediaCropRule.effectiveRatio(sourceRatio: 2, crop: .full),
            2, accuracy: 0.0001)
    }

    /// **UNE liste de proportions** (#9499) — l'union de l'ancien éditeur
    /// (1:1 · 4:3 · 16:9 · 9:16) et de la retouche du fond (#9136 : 1:1 · 4:5 ·
    /// 9:16), dans l'ordre de `MEDIA_CROP_RATIOS` (`packages/shared/utils/media-crop.ts`) :
    /// deux listes divergeraient au premier ajout.
    func test_lesProportions_sontLaListePartagee_dansSonOrdre() {
        XCTAssertEqual(MediaCropRatio.allCases.map(\.notation),
                       [nil, "1:1", "4:5", "3:4", "9:16", "4:3", "16:9"])
    }

    func test_chaqueNotation_ditSonRapport() {
        for ratio in MediaCropRatio.allCases {
            guard let notation = ratio.notation else {
                XCTAssertNil(ratio.value)
                continue
            }
            let parts = notation.split(separator: ":").compactMap { Double($0) }
            XCTAssertEqual(parts.count, 2)
            XCTAssertEqual(ratio.value ?? 0, parts[0] / parts[1], accuracy: 0.000_001, "\(notation)")
        }
    }

    /// Une proportion PAYSAGE dans un portrait garde toute la largeur, et le
    /// rapport effectif est bien celui visé.
    func test_unPaysage169_dansUnPortrait_gardeToutLaLargeur() {
        let cadre = MediaCropRule.centered(ratio: .landscape169, sourceRatio: 9.0 / 16.0)
        XCTAssertEqual(cadre.width, 1, accuracy: 0.0001)
        XCTAssertEqual(MediaCropRule.effectiveRatio(sourceRatio: 9.0 / 16.0, crop: cadre),
                       16.0 / 9.0, accuracy: 0.0001)
    }
}
