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

    // MARK: - Précédence entre plans (revue tour 2)

    /// **Depuis que le filtre de plan a disparu, le plus bas Z gagne — QUEL
    /// QUE SOIT son plan.** Un fond `bg` à z 0 doit ravir l'identité de
    /// continuité à un média `content` de z supérieur : c'est le comportement
    /// documenté du 722635a, jamais fixé par un témoin jusqu'ici.
    func test_carrierMediaIdentity_leFondBgDeZPlusBas_lEmporteSurLeContenu() {
        let fond = ObjectV3(id: "bg1", kind: .media, anchor: .free(x: 0.5, y: 0.5),
                            plane: .bg, z: 0, transform: TransformV3(),
                            payload: ["mediaId": .string("fond")])
        let contenu = ObjectV3(id: "c1", kind: .media, anchor: .free(x: 0.5, y: 0.5),
                               plane: .content, z: 1, transform: TransformV3(),
                               payload: ["postMediaId": .string("contenu")])
        let document = CanvasV3(scenes: [SceneV3(id: "s1", objects: [fond, contenu])])
        XCTAssertEqual(MeeshyScenePlayer.carrierMediaIdentity(in: document, sceneIndex: 0), "fond")
    }

    /// **Un plus bas Z SANS référence ne bloque plus l'élection** — il est
    /// écarté par `compactMap`, et le candidat suivant (Z supérieur, mais
    /// référencé) porte l'identité. L'ancien code rendait `nil` dans ce cas.
    func test_carrierMediaIdentity_sauteLePlusBasZSansReference() {
        let sansReference = ObjectV3(id: "d1", kind: .media, anchor: .free(x: 0.5, y: 0.5),
                                     plane: .content, z: 0, transform: TransformV3(),
                                     payload: [:])
        let reference = ObjectV3(id: "c1", kind: .media, anchor: .free(x: 0.5, y: 0.5),
                                 plane: .content, z: 1, transform: TransformV3(),
                                 payload: ["postMediaId": .string("servi")])
        let document = CanvasV3(scenes: [SceneV3(id: "s1", objects: [sansReference, reference])])
        XCTAssertEqual(MeeshyScenePlayer.carrierMediaIdentity(in: document, sceneIndex: 0), "servi")
    }
}
