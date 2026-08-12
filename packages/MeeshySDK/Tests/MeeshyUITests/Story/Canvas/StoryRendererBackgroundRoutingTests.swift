import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Choix de la clé de routage du fond de story.
///
/// Constat production (2026-08-01) : deux stories publiées le soir même ne
/// montraient aucun fond, alors que leur objet de slide portait un
/// `postMediaId` ET une `mediaURL` distante parfaitement valide.
///
/// La chaîne : `renderBackground` préférait `postMediaId` dès qu'il était non
/// vide, puis `StoryBackgroundLayer.configure` tentait `directURLIfAny(clé)` —
/// un ObjectId n'est pas une URL, donc nil — puis `resolver(postMediaId)`, qui
/// va chercher dans le tableau `media[]` du post. Ce tableau revenait VIDE (le
/// rattachement du média au post avait échoué à la publication), y compris sur
/// la route unitaire `GET /posts/:id`. Résultat : `resolvedURL == nil`, le layer
/// reste transparent, fond noir — pendant qu'une URL utilisable dormait dans
/// l'objet, jamais essayée.
///
/// Le correctif ne masque pas le défaut de publication : il rend le lecteur
/// robuste à un `media[]` vide, ce qu'il n'avait aucune raison d'exiger puisque
/// l'URL lui est fournie.
@MainActor
final class StoryRendererBackgroundRoutingTests: XCTestCase {

    private func makeSlide(kind: String,
                           postMediaId: String,
                           mediaURL: String?) -> StorySlide {
        let object = StoryMediaObject(
            id: "obj-1",
            postMediaId: postMediaId,
            mediaURL: mediaURL,
            mediaType: kind,
            aspectRatio: 1.0,
            isBackground: true
        )
        var effects = StoryEffects()
        effects.mediaObjects = [object]
        return StorySlide(id: "s1", effects: effects)
    }

    private func routingKey(_ kind: StoryBackgroundLayer.Kind) -> String? {
        switch kind {
        case .image(let id, _):       return id
        case .video(let id, _, _, _): return id
        default:                      return nil
        }
    }

    // MARK: - Le défaut observé

    /// Une URL distante utilisable doit primer sur un identifiant qui exige une
    /// résolution — celle-ci peut échouer, l'URL non.
    func test_remoteURL_isPreferredOverThePostMediaId() {
        let slide = makeSlide(kind: "image",
                              postMediaId: "6a6d2c2aade54b319f6dc22e",
                              mediaURL: "https://gate.meeshy.me/api/v1/attachments/file/2026/07/x.jpg")
        XCTAssertEqual(
            routingKey(StoryRenderer.renderBackground(slide: slide, languages: ["fr"])),
            "https://gate.meeshy.me/api/v1/attachments/file/2026/07/x.jpg",
            "Le postMediaId doit être résolu via le `media[]` du post ; quand celui-ci "
            + "est vide, la story n'a plus AUCUN fond alors que l'URL était fournie."
        )
    }

    func test_remoteURL_isPreferredForVideoBackgroundsToo() {
        let slide = makeSlide(kind: "video",
                              postMediaId: "abc123",
                              mediaURL: "https://gate.meeshy.me/api/v1/attachments/file/2026/07/y.mp4")
        XCTAssertEqual(
            routingKey(StoryRenderer.renderBackground(slide: slide, languages: ["fr"])),
            "https://gate.meeshy.me/api/v1/attachments/file/2026/07/y.mp4"
        )
    }

    // MARK: - Ce qui ne doit PAS changer

    /// Le cas que la préférence historique protégeait : les stories publiées
    /// avant `sanitizedForServerPublish()` portent une `mediaURL` en `file://`
    /// qui pointe vers la sandbox de l'AUTEUR — inaccessible à tout autre
    /// lecteur. L'identifiant reste alors la seule voie.
    func test_authorSandboxFileURL_neverWinsOverThePostMediaId() {
        let slide = makeSlide(kind: "image",
                              postMediaId: "6a6d2c2aade54b319f6dc22e",
                              mediaURL: "file:///var/mobile/Containers/Data/.../IMG_0042.jpg")
        XCTAssertEqual(
            routingKey(StoryRenderer.renderBackground(slide: slide, languages: ["fr"])),
            "6a6d2c2aade54b319f6dc22e",
            "Une URL de sandbox auteur est inutilisable côté lecteur — l'identifiant "
            + "reste la seule voie."
        )
    }

    /// Composer, média pas encore téléversé : pas d'identifiant serveur, la
    /// `file://` locale EST la bonne source — c'est la sandbox de celui qui
    /// regarde.
    func test_localFileURL_isUsedWhenNoPostMediaIdExistsYet() {
        let slide = makeSlide(kind: "image",
                              postMediaId: "",
                              mediaURL: "file:///tmp/pick.jpg")
        XCTAssertEqual(
            routingKey(StoryRenderer.renderBackground(slide: slide, languages: ["fr"])),
            "file:///tmp/pick.jpg"
        )
    }

    func test_noMediaURL_fallsBackToThePostMediaId() {
        let slide = makeSlide(kind: "image", postMediaId: "onlyId", mediaURL: nil)
        XCTAssertEqual(
            routingKey(StoryRenderer.renderBackground(slide: slide, languages: ["fr"])),
            "onlyId"
        )
    }
}
