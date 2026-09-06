import XCTest
import MeeshySDK
@testable import Meeshy

/// **Un post qui porte une SCÈNE ouvre la scène, jamais ses ingrédients**
/// (directive porteur 2026-09-05).
///
/// La panne que ces témoins gardent a été mesurée au simulateur : une
/// publication composée d'une photo + un texte posé dessus s'affichait
/// correctement dans la carte du fil, et le doigt l'ouvrait sur la photo SOURCE
/// — paysage, 4032 × 3024, sans le texte. Le canvas voyageait bien, le rendu
/// était bon des deux côtés ; c'est le ROUTAGE qui servait la matière première
/// à la place du document.
///
/// > **Un défaut de routage ne ressemble pas à un bug.** Les deux destinations
/// > fonctionnent, aucune n'échoue, rien ne rougit. Il ne se voit qu'en
/// > comparant ce que DEUX surfaces montrent du même contenu — et c'est
/// > exactement ce qu'aucun test de rendu isolé ne fait.
final class SocialFullscreenRouteTests: XCTestCase {

    private func post(canvas: CanvasV3?) -> FeedPost {
        var effets: StoryEffects?
        if let canvas {
            var e = StoryEffects()
            e.canvasV3 = canvas
            effets = e
        }
        var post = FeedPost(id: "p1", author: "alice", authorId: "a1",
                            content: "", timestamp: Date())
        post.storyEffects = effets
        return post
    }

    private func scene(_ id: String = "s1") -> SceneV3 {
        SceneV3(id: id, objects: [])
    }

    private func mediaObject(_ id: String) -> ObjectV3 {
        ObjectV3(id: id, kind: .media,
                 anchor: .free(x: 0.5, y: 0.5),
                 plane: .content, z: 1,
                 transform: TransformV3(), payload: [:])
    }

    func test_unPostAvecCanvas_ouvreLaSCENE() {
        let document = CanvasV3(scenes: [scene()])
        XCTAssertEqual(SocialFullscreenRoute.scene(of: post(canvas: document))?.scenes.count, 1,
                       "un post qui porte un canvas doit ouvrir le player, pas la galerie")
    }

    func test_unPostSansCanvas_ouvreLaGALERIE() {
        XCTAssertNil(SocialFullscreenRoute.scene(of: post(canvas: nil)),
                     "sans canvas, il n'y a rien à rejouer — les médias se feuillettent")
    }

    /// **Une enveloppe VIDE n'est pas une scène.** Le composer stampe un canvas
    /// dès qu'il touche une publication ; sans slide, il ne décrit rien et le
    /// player n'aurait aucun pixel à peindre. Router là-dessus donnerait un
    /// plein écran NOIR — strictement pire que la galerie, qui a toujours les
    /// médias du post.
    func test_unCanvasSansScene_retombeSurLaGALERIE() {
        XCTAssertNil(SocialFullscreenRoute.scene(of: post(canvas: CanvasV3(scenes: []))),
                     "une enveloppe sans slide ne peint rien : mieux vaut la galerie qu'un écran noir")
    }

    /// **Le carrousel est le player lui-même.** Plusieurs slides doivent
    /// arriver ENTIÈRES au plein écran : c'est lui qui les feuillette, et le
    /// tronquer ici perdrait tout ce qui suit la première.
    /// **Un canvas qui laisse un média dehors rend la main à la GALERIE**
    /// (régression mesurée le 2026-09-06).
    ///
    /// Un post de deux photos part avec ses deux médias — et un canvas d'une
    /// seule scène portant un seul média en fond, le composer ne publiant que
    /// sa slide courante. Router vers la scène montrait alors UNE photo sur
    /// deux, sans pellicule ni moyen d'atteindre l'autre.
    ///
    /// > **Un correctif qui améliore le cas visé peut dégrader son voisin.**
    /// > La première écriture de cette règle demandait « y a-t-il une scène ? » ;
    /// > il fallait aussi demander « montre-t-elle tout ? ».
    func test_unCanvasQuiOublieUnMedia_retombeSurLaGalerie() {
        let document = CanvasV3(scenes: [SceneV3(id: "s1", objects: [mediaObject("m1")])])
        var post = self.post(canvas: document)
        post.media = [.image(), .image()]
        XCTAssertNil(SocialFullscreenRoute.scene(of: post),
                     "Deux photos publiées, une seule dans le canvas : la galerie les montre " +
                     "toutes, le player n'en montrerait qu'une.")
    }

    /// …et un canvas COMPLET garde la main : c'est le cas nominal, celui où le
    /// canvas EST la publication.
    func test_unCanvasQuiCouvreTousLesMedias_ouvreLaSCENE() {
        let document = CanvasV3(scenes: [
            SceneV3(id: "s1", objects: [mediaObject("m1"), mediaObject("m2")])
        ])
        var post = self.post(canvas: document)
        post.media = [.image(), .image()]
        XCTAssertNotNil(SocialFullscreenRoute.scene(of: post),
                        "Le canvas montre les deux visuels : il est la publication.")
    }

    /// **Un canvas SANS média reste maître chez lui** — texte, dessin,
    /// stickers, fond de couleur. Le post ne porte aucun visuel, il n'y a donc
    /// rien à laisser dehors, et la galerie n'aurait rien à feuilleter.
    func test_unCanvasSansMediaEtUnPostSansVisuel_ouvreLaSCENE() {
        let document = CanvasV3(scenes: [SceneV3(id: "s1", objects: [])])
        XCTAssertNotNil(SocialFullscreenRoute.scene(of: post(canvas: document)),
                        "Sans visuel au post, la scène ne laisse rien dehors.")
    }

    func test_plusieursScenes_voyagentTOUTES() {
        let document = CanvasV3(scenes: [scene("a"), scene("b"), scene("c"), scene("d")])
        XCTAssertEqual(SocialFullscreenRoute.scene(of: post(canvas: document))?.scenes.map(\.id),
                       ["a", "b", "c", "d"],
                       "le plein écran feuillette les slides — aucune ne se perd en route")
    }
}
