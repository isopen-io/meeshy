import XCTest
@testable import MeeshySDK

/// **UN FOND RÉFÉRENCÉ PAR `mediaId` DOIT SE PEINDRE** (#6894).
///
/// `StoryEffects.init(rendering:sceneIndex:)` — le pont v3 → v1 qu'utilise le
/// LECTEUR (`StoryReaderRepresentable`, via `resolvedBackgroundMedia`) — ne
/// lisait, pour un objet `.media` de plan `bg`, que `payload.background`
/// (couleur) et `payload.transform` (cadrage) : une RÉFÉRENCE média
/// (`payload.mediaId`, la forme que la passerelle sert) n'entrait dans AUCUNE
/// des deux familles v1, et le lecteur n'avait donc rien à peindre — un canvas
/// qui adresse pourtant un enregistrement réel du post s'affichait comme un
/// fond de couleur absent.
final class StoryEffectsBackgroundMediaReferenceTests: XCTestCase {

    private func documentUneScene(payload: String) -> Data {
        Data("""
        {"v": 3, "scenes": [{"id": "s1", "objects": [
          {"id": "bg1", "kind": "media", "anchor": {"t": "free", "x": 0.5, "y": 0.5},
           "plane": "bg", "z": 0, "transform": {"scale": 1, "rotation": 0, "opacity": 1},
           "payload": \(payload)}
        ]}]}
        """.utf8)
    }

    func test_unFondAMediaId_entreDansMediaObjectsEtEstMarqueBackground() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self,
                                           from: documentUneScene(payload: #"{"mediaId": "6aaa972c3fd1f8a72d0e38e6"}"#))
        let effects = StoryEffects(rendering: doc, sceneIndex: 0)

        let fond = try XCTUnwrap(effects.resolvedBackgroundMedia,
                                 "un fond référencé par mediaId doit entrer dans mediaObjects, " +
                                 "marqué isBackground, pour que le lecteur le peigne")
        XCTAssertEqual(fond.postMediaId, "6aaa972c3fd1f8a72d0e38e6",
                       "la référence mediaId doit se normaliser en postMediaId — le champ que " +
                       "le résolveur du lecteur (StoryReaderRepresentable) sait déjà lire")
        XCTAssertTrue(effects.hasVisualBackgroundMedia)
    }

    /// La forme `postMediaId` du composer continue de fonctionner à l'identique
    /// — ce lot ajoute une lecture, il n'en retire aucune.
    func test_unFondAPostMediaId_continueDeSurvivre() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self,
                                           from: documentUneScene(payload: #"{"postMediaId": "6aa7da4c69eecc85c55d2081"}"#))
        let effects = StoryEffects(rendering: doc, sceneIndex: 0)
        XCTAssertEqual(effects.resolvedBackgroundMedia?.postMediaId, "6aa7da4c69eecc85c55d2081")
    }

    /// Un porteur qui ne loge NI couleur NI référence média (juste un
    /// `transform`, cas du composer réel — le vrai fond suit en `plane:
    /// content`) ne doit pas fabriquer de média fantôme.
    func test_unPorteurSansReferenceEtSansCouleur_neFabriqueAucunMedia() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self,
                                           from: documentUneScene(payload: #"{"transform": {"videoFitMode": "fit"}}"#))
        let effects = StoryEffects(rendering: doc, sceneIndex: 0)
        XCTAssertNil(effects.resolvedBackgroundMedia)
        XCTAssertNotNil(effects.backgroundTransform)
    }

    /// Une couleur SEULE (aucune des deux références) ne fabrique pas non plus
    /// de média — c'est exactement le comportement d'avant ce lot.
    func test_uneCouleurSeule_neFabriqueAucunMedia() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self,
                                           from: documentUneScene(payload: "{\"background\": \"#FF0000\"}"))
        let effects = StoryEffects(rendering: doc, sceneIndex: 0)
        XCTAssertNil(effects.resolvedBackgroundMedia)
        XCTAssertEqual(effects.background, "#FF0000")
    }

    /// **L'ORDRE des deux orthographes fait foi** (`canvas-v3.ts` : « c'est
    /// l'ordre de lecture — postMediaId, puis mediaId — qui fait foi »).
    /// `postMediaId` est la forme de RÉFÉRENCE ; un objet qui porte les deux
    /// doit résoudre sur elle, jamais sur `mediaId` (revue tour 1, #6893).
    func test_unObjetAvecLesDeuxCles_resoutSurPostMediaIdEnPremier() throws {
        let doc = try JSONDecoder().decode(CanvasV3.self,
                                           from: documentUneScene(payload: #"{"mediaId": "perime", "postMediaId": "servi"}"#))
        let objet = try XCTUnwrap(doc.scenes.first?.objects.first)
        XCTAssertEqual(objet.mediaReference, "servi",
                       "postMediaId est la forme de référence — mediaId n'est lu qu'en second")
    }
}
