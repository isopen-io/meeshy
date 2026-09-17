import XCTest
import CoreGraphics
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le fond d'une scène se peint UNE fois — et depuis #6904, il ne se peint
/// PLUS QUE par la galerie, jamais par le canvas** (#6791, #6896, lot #6904).
///
/// ## Ce que #6791 avait fermé, à moitié
///
/// Le correctif de 2026-09-16 faisait dépendre `paintsLetterbox` du rapport
/// PRÉSENTÉ (`imageAspect`) : une scène qui n'était qu'une image se présentait
/// au rapport de son image, ses bandes 9:16 sortaient alors du cadre, et le
/// canvas ne les peignait plus — la galerie peignait déjà son ThumbHash sous
/// un cadre à l'identique. Une scène qui portait un objet HORS de l'image
/// gardait, elle, son gabarit 9:16 ET ses bandes peintes par le canvas.
///
/// ## Ce que #6896 ferme pour de bon
///
/// La décision porteur du 2026-09-17 retire l'exception : **la scène est
/// TOUJOURS 9:16**, cardée ou en plein cadre, qu'elle ne montre qu'une image
/// ou qu'un objet déborde. Le cadre PRÉSENTÉ et le cadre du CANVAS sont donc
/// désormais TOUJOURS identiques (`SceneShape.aspect`) — ce qui était la
/// condition de #6791 (« le cadre présenté correspond au cadre que la
/// galerie habille déjà ») est maintenant vraie EN PERMANENCE. Le canvas ne
/// peint donc plus JAMAIS ses propres bandes : `SceneShape.layout(...)` dit
/// que c'est le PLATEAU qui peint le hors-champ, un seul acteur, toujours le
/// même.
@MainActor
final class GallerySceneBackdropUnicityTests: XCTestCase {

    // MARK: - Fabriques

    private static let paysage = 16.0 / 9.0

    private func fond(aspect: Double = paysage) -> ObjectV3 {
        ObjectV3(id: "fond", kind: .media,
                 anchor: .free(x: 0.5, y: 0.5),
                 plane: .content, z: 0,
                 transform: TransformV3(),
                 payload: ["isBackground": .bool(true),
                           "postMediaId": .string("m1"),
                           "aspectRatio": .number(aspect)])
    }

    /// Un texte posé BAS, donc dans la bande que l'image laisse.
    private func texteSurLaBande() -> ObjectV3 {
        ObjectV3(id: "texte", kind: .text,
                 anchor: .free(x: 0.5, y: 0.95),
                 plane: .content, z: 1,
                 transform: TransformV3(),
                 payload: ["text": .string("Paris")])
    }

    private func item(_ objets: [ObjectV3], carrierAspect: Double? = nil) -> GallerySceneItem {
        let scene = SceneV3(id: "s1", objects: objets, carrierAspect: carrierAspect)
        let document = CanvasV3(scenes: [scene])
        return GallerySceneItem(
            id: "p1#0",
            postId: "p1",
            document: document,
            sceneIndex: 0,
            carrier: StoryItem(id: "p1", createdAt: Date(timeIntervalSince1970: 0)),
            mediaId: "m1",
            aspect: PostGalleryLot.sceneAspect(document, sceneIndex: 0),
            canvasAspect: SceneShape.aspect,
            moves: false,
            thumbHash: "hachage",
            thumbnailURL: nil
        )
    }

    // MARK: - Le fond, une seule fois — TOUJOURS, depuis #6904

    /// Une scène qui n'est qu'une image ne se présente plus au rapport de son
    /// image : elle garde le gabarit 9:16, comme toutes les autres.
    func test_uneSceneQuiNestQuUneImage_gardeLeGabarit9sur16() {
        let page = item([fond()])
        XCTAssertEqual(page.aspect, SceneShape.aspect, accuracy: 0.0001)
        XCTAssertFalse(page.servesLetterboxFill,
                       "le canvas ne peint plus ses bandes : c'est le plateau qui peint le hors-champ")
    }

    /// Un objet posé sur la bande ne change plus rien : le gabarit était déjà
    /// 9:16, et le canvas ne peint toujours pas.
    func test_unObjetPoseSurLaBande_neChangeRien() {
        let page = item([fond(), texteSurLaBande()])
        XCTAssertEqual(page.aspect, SceneShape.aspect, accuracy: 0.0001)
        XCTAssertFalse(page.servesLetterboxFill)
    }

    /// **`carrierAspect` ne décide plus d'aucune forme** (décision porteur du
    /// 2026-09-17 sur #6896, lot #6904) : une scène qui porte son propre cadre
    /// se présente comme toutes les autres, au gabarit 9:16.
    func test_uneSceneQuiPorteSonCadre_sePresenteCommeLesAutres() {
        let page = item([fond()], carrierAspect: Self.paysage)
        XCTAssertEqual(page.aspect, SceneShape.aspect, accuracy: 0.0001,
                       "la forme vient de la loi, jamais du porteur")
        XCTAssertFalse(page.servesLetterboxFill)
    }

    /// Une scène sans fond image — du texte sur une couleur — n'a jamais rien
    /// eu de spécial : le canvas ne peint pas non plus.
    func test_uneSceneSansImage_neFaitPasPeindreLeCanvasNonPlus() {
        XCTAssertFalse(item([texteSurLaBande()]).servesLetterboxFill)
    }

    /// **Le fusible qui remplace `test_unObjetPoseSurLaBande_gardeLeRemplissageDuCanvas`**
    /// (l'ancien témoin POSITIF, sans objet depuis que `paintsLetterbox` est
    /// une constante — voir la revue de #6904 : les quatre témoins ci-dessus
    /// comparent tous `page.aspect`/`servesLetterboxFill` à des valeurs que
    /// `PostGalleryLot.sceneAspect`/`surface(inFullFrame:)` rendent EN DUR,
    /// sans lire leurs paramètres — la loi comparée à elle-même).
    ///
    /// Ce que #6896 décide littéralement (« la scène est TOUJOURS 9:16,
    /// **cardée ou en plein cadre** ») est une ÉGALITÉ entre deux appels, pas
    /// une valeur isolée : `surface(inFullFrame: true)` et `surface(inFullFrame:
    /// false)` doivent rendre EXACTEMENT la même surface. C'est l'invariant
    /// que la comparaison à soi-même ne peut pas trahir — une implémentation
    /// qui recommencerait à varier par présentation (le comportement
    /// PRÉ-#6904, voir l'historique de `PostGalleryLot.swift`) ferait rougir
    /// CE témoin sans qu'aucun changement à `PostGalleryLot.sceneAspect` ne
    /// soit nécessaire pour le tromper.
    func test_cardeeEtPleinCadre_rendentExactementLaMemeSurface() {
        let page = item([fond(aspect: Self.paysage), texteSurLaBande()], carrierAspect: Self.paysage)
        XCTAssertEqual(page.surface(inFullFrame: true), page.surface(inFullFrame: false),
                      "carte et plein cadre doivent rendre EXACTEMENT la même surface depuis #6896 " +
                      "— toute divergence recréerait la dette (#6806) que le lot #6904 ferme")
    }

    // MARK: - La décision atteint le player

    /// **Une règle qui n'est pas TRANSMISE n'a corrigé personne — et une règle
    /// transmise avec N'IMPORTE QUELLE valeur n'en est pas la preuve.**
    ///
    /// L'ancienne version n'assertionnait que `suite.contains("servesLetterboxFill:")`
    /// — vert quelle que soit la valeur transmise, y compris `true`, une
    /// variable, ou l'ancien `item.surface(inFullFrame:).paintsLetterbox`.
    /// Elle exige désormais la valeur LITTÉRALE : `servesLetterboxFill` est
    /// une CONSTANTE depuis #6896 (`false`, le plateau peint seul le
    /// hors-champ), pas une décision par scène — un site qui la recalcule,
    /// même correctement pour le cas nominal, réintroduirait la question que
    /// ce lot a fermée.
    func test_laPageScene_transmetLaDecisionAuPlayer() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationMediaGalleryView+ScenePage.swift"))
        let page = try XCTUnwrap(code.range(of: "struct GalleryScenePage"))
        let suite = String(code[page.lowerBound...])

        XCTAssertTrue(suite.contains("servesLetterboxFill: stage.paintsOwnLetterbox"),
                      "la page scène tient sa décision de peinture de la LOI " +
                      "(offscreenPainter), jamais d'un calcul par scène")
        XCTAssertFalse(suite.contains("item.surface(inFullFrame"),
                       "le peintre ne se recalcule pas scène par scène : #6896 a fermé cette question")
    }

    /// **Et le fond ne se peint QUE si la loi dit qu'il reste quelque chose à
    /// peindre** (#6904, tour 3).
    ///
    /// Le plateau peignait son fond INCONDITIONNELLEMENT, sous les deux états :
    /// en plein cadre, la scène ne couvrait pas le viewport (le solveur des
    /// pièces jointes l'y AJUSTAIT) et le fond habillait les deux bandes de
    /// 79,7 pt qui restaient. La décision du 2026-09-17 supprime les bandes
    /// plutôt que de les habiller — `SceneShape.layout(.immersive, in:)` rend
    /// `backdrop: nil`, et la couche n'est alors pas montée du tout.
    func test_laPageScene_neMontrLeFondQueQuandLaLoiEnDonneUn() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationMediaGalleryView+ScenePage.swift"))
        let page = try XCTUnwrap(code.range(of: "struct GalleryScenePage"))
        let suite = String(code[page.lowerBound...])

        // **La condition a DÉMÉNAGÉ avec le fond** (#6904, tour 3 bis) : elle
        // vit dans `SceneCard`, le composant unique que cette page et le
        // lecteur de stories montent tous deux. La page ne PEUT donc plus
        // peindre d'office — elle ne peint plus du tout.
        XCTAssertTrue(suite.contains("SceneCard(layout: stage.layout"),
                      "la page monte LA carte de scène, qui conditionne le fond au backdrop de la loi")
        XCTAssertFalse(suite.contains("SceneBackdropView("),
                       "la page ne peint plus son fond elle-même : deux assemblages avaient divergé")
        XCTAssertFalse(suite.contains("MediaGalleryStage.backdrop("),
                       "le fond d'une scène ne se décide plus par le letterbox du solveur de pièces jointes")
    }

    /// **La page consulte la LOI de forme, jamais le solveur des pièces
    /// jointes** (#6904, tour 3) — c'est la moitié GÉOMÉTRIE de la même
    /// décision : `MediaStageFraming` ajuste (donc laisse des bandes), la loi
    /// COUVRE en immersif et tient entière en cardé.
    func test_laPageScene_seCadreParLaLoi() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ConversationMediaGalleryView+ScenePage.swift"))
        let page = try XCTUnwrap(code.range(of: "struct GalleryScenePage"))
        let suite = String(code[page.lowerBound...])

        XCTAssertTrue(suite.contains("GallerySceneStage.Frame"),
                      "la page scène reçoit le cadre de GallerySceneStage (projection de SceneShape.layout)")
        XCTAssertFalse(suite.contains("MediaStageFraming.Result"),
                       "une page scène ne se cadre plus par le solveur des pièces jointes")
    }
}
