import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// **L'identité du porteur ne doit pas être aveugle au fond `plane: bg`
/// référencé, ni inverser l'ordre des deux orthographes** (revue tour 1,
/// #6893/#6894).
///
/// `MeeshyScenePlayer.carrierMediaIdentity` et `.sceneDiscriminant` relisaient
/// `payload["postMediaId"]` en direct au lieu d'appeler `ObjectV3.mediaReference`
/// (le site unique) : sur un document tel que la passerelle le sert — un fond
/// `plane: bg` à `payload.mediaId`, jamais de `postMediaId` —, les deux
/// rendaient `nil`. L'identité de scène retombait alors sur `thumbHash`
/// (absent) puis sur l'id de scène littéral, que `identityRoot` désigne
/// lui-même comme inutilisable (« toute story legacy le porte »).
final class ScenePlayerMediaIdentityTests: XCTestCase {

    /// Une scène dont l'UNIQUE média est un fond référencé par `mediaId` —
    /// la forme RECETTE C, jamais écrite par le composer iOS.
    private func documentAvecFondMediaId(_ mediaId: String = "m-recette-c") -> CanvasV3 {
        let fond = ObjectV3(id: "bg1", kind: .media, anchor: .free(x: 0.5, y: 0.5),
                            plane: .bg, z: 0, transform: TransformV3(),
                            payload: ["mediaId": .string(mediaId)])
        return CanvasV3(scenes: [SceneV3(id: "s1", objects: [fond])])
    }

    func test_carrierMediaIdentity_liteLeFondDePlanBg_referenceParMediaId() {
        let document = documentAvecFondMediaId("m-recette-c")
        XCTAssertEqual(MeeshyScenePlayer.carrierMediaIdentity(in: document, sceneIndex: 0),
                       "m-recette-c",
                       "un fond plane:bg référencé par mediaId doit porter l'identité de continuité")
    }

    func test_sceneDiscriminant_liteLeFondDePlanBg_referenceParMediaId() {
        let document = documentAvecFondMediaId("m-recette-c")
        XCTAssertEqual(MeeshyScenePlayer.sceneDiscriminant(in: document, sceneIndex: 0),
                       "m-recette-c",
                       "sans discriminant, l'identité retombe sur le littéral \"s1\" partagé par toute story legacy")
    }

    /// Un objet qui porte les DEUX orthographes doit résoudre sur `postMediaId`
    /// — la forme de référence, celle que le contrat partagé documente.
    func test_carrierMediaIdentity_preferePostMediaId_quandLesDeuxClesCoexistent() {
        let objet = ObjectV3(id: "c1", kind: .media, anchor: .free(x: 0.5, y: 0.5),
                             plane: .content, z: 0, transform: TransformV3(),
                             payload: ["mediaId": .string("perime"), "postMediaId": .string("servi")])
        let document = CanvasV3(scenes: [SceneV3(id: "s1", objects: [objet])])
        XCTAssertEqual(MeeshyScenePlayer.carrierMediaIdentity(in: document, sceneIndex: 0), "servi",
                       "postMediaId est la forme de référence — CanvasMediaAdoption ne pose que lui")
    }
}
