import XCTest
import MeeshySDK

/// **UN OBJET DE SCÈNE QUI NE SE DÉCODE PAS DISPARAÎT SANS UN MOT** (#6846).
///
/// Mesuré au simulateur sur le post « RÉCEPT C — 3 scènes » de staging :
///
///     MESURE6846   scène 0 : 1 objets [text]          ← l'objet média a disparu
///     MESURE6846   scène 1 : 2 objets [media,text]
///     MESURE6846   scène 2 : 2 objets [media,text]
///     MESURE6846 route … scenes=3 visuelsPost=3 objetsMedia=2 couvre=NON
///
/// Le fil porte pourtant TROIS objets média, un par scène, de forme identique.
/// `ObjectV3` est décodé par `decodeLossyArrayIfPresent` : un élément qui lève
/// est jeté en silence. Un objet perdu fait tomber le compte de
/// `coversEveryVisual`, qui refuse la route scène — et le plein écran retombe
/// sur les pages image, où ni le fond peint ni le texte de la scène n'existent.
///
/// Ce témoin rejoue la charge EXACTE des trois objets, telle que la passerelle
/// la sert sous `X-Canvas-Caps: 3`.
final class CanvasV3SceneObjectDecodeTests: XCTestCase {

    /// Les trois objets média du post de recette, copiés du fil sans retouche.
    private func charge() -> Data {
        let json = """
        {
          "v": 3,
          "scenes": [
            { "id": "s1", "objects": [
              {"id":"bg1","kind":"media","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"bg","z":0,
               "transform":{"scale":1,"rotation":0,"opacity":1},
               "payload":{"mediaId":"6aaa972c3fd1f8a72d0e38e6"}} ] },
            { "id": "s2", "objects": [
              {"id":"bg2","kind":"media","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"bg","z":0,
               "transform":{"scale":1,"rotation":0,"opacity":1},
               "payload":{"mediaId":"6aaa972d3fd1f8a72d0e38e7"}} ] },
            { "id": "s3", "objects": [
              {"id":"bg3","kind":"media","anchor":{"t":"free","x":0.5,"y":0.5},"plane":"bg","z":0,
               "transform":{"scale":1,"rotation":0,"opacity":1},
               "payload":{"mediaId":"6aaa972d3fd1f8a72d0e38e8"}} ] }
          ]
        }
        """
        return Data(json.utf8)
    }

    /// **L'ALLER-RETOUR** — decode → encode → decode, ce que fait le CACHE.
    ///
    /// `StoryEffects.init(from:)` projette la scène 0 dans les champs v1
    /// (`StoryEffects(rendering: document, sceneIndex: 0)`) tout en gardant le
    /// document. `encode(to:)` le RECONSTRUIT par
    /// `CanvasV3(migrating: self, keeping: canvasV3)` : la scène 0 est rebâtie
    /// depuis le runtime v1, les suivantes viennent du document gardé.
    ///
    /// **CORRIGÉ par #6894** (auparavant #6846, ROUGE-DOCUMENTÉ ici). Un objet
    /// média posé sur le plan de FOND et référençant un enregistrement
    /// (`payload.mediaId` / `payload.postMediaId`) entre désormais dans
    /// `mediaObjects` dès `StoryEffects.init(rendering:)` — `migratedScene`
    /// (boucle `.media` ordinaire) le réémet donc lui-même, à IDENTITÉ égale,
    /// sans qu'aucun merge par identité ne soit plus nécessaire pour ce cas.
    func test_lAllerRetourParLeCache_nePerdAucunObjetMedia() throws {
        let effets = try JSONDecoder().decode(StoryEffects.self, from: charge())
        XCTAssertEqual(effets.canvasV3?.scenes.count, 3, "les trois scènes au premier décodage")

        let regrave = try JSONEncoder().encode(effets)
        let relu = try JSONDecoder().decode(StoryEffects.self, from: regrave)

        let medias = (relu.canvasV3?.scenes ?? []).flatMap(\.objects).filter { $0.kind == .media }
        XCTAssertEqual(medias.map(\.id), ["bg1", "bg2", "bg3"],
                       "un aller-retour par le cache ne doit perdre aucun fond de scène")
    }

    func test_lesTroisObjetsMedia_surviventAuDecodage() throws {
        let canvas = try JSONDecoder().decode(CanvasV3.self, from: charge())

        XCTAssertEqual(canvas.scenes.count, 3, "les trois scènes")

        let medias = canvas.scenes.flatMap(\.objects).filter { $0.kind == .media }
        XCTAssertEqual(medias.map(\.id), ["bg1", "bg2", "bg3"],
                       "un objet média perdu au décodage fait refuser la route scène par coversEveryVisual")

        for (index, scene) in canvas.scenes.enumerated() {
            XCTAssertEqual(scene.objects.filter { $0.kind == .media }.count, 1,
                           "la scène \(index) porte son fond")
        }
    }
}
