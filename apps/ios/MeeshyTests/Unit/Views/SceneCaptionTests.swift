import XCTest
import MeeshySDK
@testable import Meeshy

/// **La légende adossée SUIT la scène qu'on regarde** (directive porteur
/// 2026-09-03 : « à l'affichage en plein écran ou sur le carrousel, afficher la
/// légende qui aura été adossée »).
///
/// ## La panne que ces témoins gardent
///
/// Le carrousel — mode PAR DÉFAUT depuis la directive du 2026-09-06 — pagine
/// les scènes d'un post, et sa page courante vit dans `PostSceneMosaic`. La
/// légende, elle, était peinte par `FeedPostCard` en `overlay` AUTOUR de cette
/// vue, et résolue par `post.media.first`. Le doigt faisait donc défiler les
/// scènes sous une légende FIGÉE sur la première : à la page 2, la publication
/// affirmait de la scène 2 ce qui n'était vrai que de la scène 1.
///
/// > **Une légende fausse est pire qu'une légende absente** : elle affirme.
/// > C'est exactement le défaut que le plein écran avait corrigé la veille en
/// > demandant l'identité du média à la SCÈNE (`carrierMediaIdentity`) — et le
/// > fil, qui pagine depuis le lendemain, ne l'avait pas reçu. Une leçon écrite
/// > sur une surface ne traverse pas d'elle-même jusqu'à sa jumelle.
///
/// ## Pourquoi une règle, et non deux vues qui savent
///
/// Le plein écran et la carte répondaient chacun à la même question dans un
/// `private var`. Deux écritures de la même règle divergent — celle du fil
/// n'avait jamais reçu la correction de sa jumelle. La règle est donc ici,
/// éprouvée sans écran, et les deux surfaces l'appellent.
final class SceneCaptionTests: XCTestCase {

    // MARK: - Fabriques

    private func media(_ id: String, caption: String?) -> FeedMedia {
        FeedMedia(id: id, type: .image, caption: caption)
    }

    private func post(media: [FeedMedia], content: String = "") -> FeedPost {
        var post = FeedPost(id: "p1", author: "alice", authorId: "a1",
                            content: content, timestamp: Date())
        post.media = media
        return post
    }

    /// Une scène qui ADRESSE un média du post — c'est `payload["postMediaId"]`
    /// que `carrierMediaIdentity` lit, jamais l'ordre des scènes.
    private func scene(_ id: String, porte mediaId: String? = nil) -> SceneV3 {
        let objets: [ObjectV3] = mediaId.map {
            [ObjectV3(id: "o-\($0)", kind: .media,
                      anchor: .free(x: 0.5, y: 0.5),
                      plane: .content, z: 1,
                      transform: TransformV3(),
                      payload: ["postMediaId": .string($0)])]
        } ?? []
        return SceneV3(id: id, objects: objets)
    }

    // MARK: - Le défaut : la légende figée sur la première scène

    /// **Le témoin discriminant.** À la page 2, la légende doit être celle du
    /// média que la scène 2 montre. L'ancienne écriture (`post.media.first`)
    /// rendait « la plage » ici — vrai de la scène 1, faux de celle qu'on lit.
    func test_surLaSecondeScene_laLegendeEstCelleDeSonPropreMedia() {
        let publication = post(media: [media("m1", caption: "la plage"),
                                       media("m2", caption: "la montagne")])
        let document = CanvasV3(scenes: [scene("s1", porte: "m1"),
                                         scene("s2", porte: "m2")])

        XCTAssertEqual(
            SceneCaption.resolve(sceneIndex: 1, in: document, post: publication,
                                 carrierFallback: false),
            "la montagne",
            "la légende doit suivre la scène affichée, pas rester sur la première")
    }

    func test_surLaPremiereScene_laLegendeEstLaSienne() {
        let publication = post(media: [media("m1", caption: "la plage"),
                                       media("m2", caption: "la montagne")])
        let document = CanvasV3(scenes: [scene("s1", porte: "m1"),
                                         scene("s2", porte: "m2")])

        XCTAssertEqual(
            SceneCaption.resolve(sceneIndex: 0, in: document, post: publication,
                                 carrierFallback: false),
            "la plage")
    }

    // MARK: - Le repli sur le texte du porteur : permis, et seulement où il ne redouble pas

    /// **Dans le FIL, aucun repli** : le texte de la publication est déjà rendu
    /// AU-DESSUS de la carte. L'ajouter par-dessus la scène l'afficherait deux
    /// fois sur le même écran — ce qui n'est pas « afficher la légende », c'est
    /// répéter le post.
    func test_dansLeFil_uneSceneSansMedia_nAffichePasLeTexteDuPost() {
        let publication = post(media: [], content: "mon voyage")
        let document = CanvasV3(scenes: [scene("s1")])

        XCTAssertNil(
            SceneCaption.resolve(sceneIndex: 0, in: document, post: publication,
                                 carrierFallback: false),
            "le texte du post est déjà affiché au-dessus de la carte : le redoubler n'est pas une légende")
    }

    /// **En PLEIN ÉCRAN, le repli est obligatoire** (directive porteur
    /// 2026-09-06 : « en plein écran obligatoirement »). Rien d'autre n'y rend
    /// le texte de la publication ; sans ce repli, le format qu'on ouvre POUR
    /// mieux lire est celui qui en montre le moins.
    func test_enPleinEcran_uneSceneSansMedia_serTLeTexteDuPost() {
        let publication = post(media: [], content: "mon voyage")
        let document = CanvasV3(scenes: [scene("s1")])

        XCTAssertEqual(
            SceneCaption.resolve(sceneIndex: 0, in: document, post: publication,
                                 carrierFallback: true),
            "mon voyage")
    }

    /// La légende PROPRE d'un média l'emporte toujours sur le texte du porteur —
    /// sinon la publication écraserait ce que l'auteur a adossé à l'image.
    func test_laLegendePropre_lEmporteSurLeTexteDuPost() {
        let publication = post(media: [media("m1", caption: "la plage"),
                                       media("m2", caption: "la montagne")],
                               content: "mon voyage")
        let document = CanvasV3(scenes: [scene("s1", porte: "m1"),
                                         scene("s2", porte: "m2")])

        XCTAssertEqual(
            SceneCaption.resolve(sceneIndex: 1, in: document, post: publication,
                                 carrierFallback: true),
            "la montagne")
    }

    // MARK: - Le repli sur le PREMIER visuel : par DOCUMENT, jamais par scène

    /// **Une story migrée n'adresse aucun média** : ses scènes ne portent pas de
    /// `postMediaId`, et son unique visuel est celui du post. Le repli sur le
    /// premier visuel sert exactement ce cas.
    func test_unDocumentQuiNAdressseAucunMedia_retombeSurLePremierVisuel() {
        let publication = post(media: [media("m1", caption: "la plage")])
        let document = CanvasV3(scenes: [scene("s1")])

        XCTAssertEqual(
            SceneCaption.resolve(sceneIndex: 0, in: document, post: publication,
                                 carrierFallback: false),
            "la plage")
    }

    /// **Le témoin qui distingue les deux replis.** Un document dont CERTAINES
    /// scènes adressent un média et d'autres non : le repli sur le premier
    /// visuel ne doit PAS s'armer sur les secondes, sinon elles héritent de la
    /// légende de la scène 1 — le défaut d'origine, revenu par la porte du
    /// repli.
    func test_uneSceneSansMedia_dansUnDocumentQuiEnAdresse_nHeritePasDuPremier() {
        let publication = post(media: [media("m1", caption: "la plage")])
        let document = CanvasV3(scenes: [scene("s1", porte: "m1"),
                                         scene("s2")])

        XCTAssertNil(
            SceneCaption.resolve(sceneIndex: 1, in: document, post: publication,
                                 carrierFallback: false),
            "une scène qui n'adresse rien, dans un document qui adresse, n'emprunte pas la légende d'une autre")
    }

    // MARK: - Bornes

    func test_unIndexHorsBornes_neRendRien() {
        let publication = post(media: [media("m1", caption: "la plage")])
        let document = CanvasV3(scenes: [scene("s1", porte: "m1")])

        XCTAssertNil(
            SceneCaption.resolve(sceneIndex: 7, in: document, post: publication,
                                 carrierFallback: false),
            "aucune scène à cet index : il n'y a rien à légender")
    }

    /// Une légende faite d'espaces n'est pas une légende — `SocialMediaCaption`
    /// porte déjà cette règle, et l'appeler plutôt que de la refaire est ce qui
    /// garantit qu'elle ne diverge pas.
    func test_uneLegendeBlanche_estTraiteeCommeAbsente() {
        let publication = post(media: [media("m1", caption: "   ")], content: "mon voyage")
        let document = CanvasV3(scenes: [scene("s1", porte: "m1")])

        XCTAssertEqual(
            SceneCaption.resolve(sceneIndex: 0, in: document, post: publication,
                                 carrierFallback: true),
            "mon voyage",
            "une légende vide laisse la place au repli plutôt que de peindre un bandeau blanc")
    }
}
