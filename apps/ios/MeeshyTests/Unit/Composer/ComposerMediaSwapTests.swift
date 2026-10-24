import XCTest
import MeeshySDK
@testable import Meeshy

/// #12590 — **la règle pure du remplacement d'une source** : les huit porteurs suivent le média
/// retouché, à sa place. Le miroir de `ComposerMediaRetractionTests`.
final class ComposerMediaSwapTests: XCTestCase {

    private func url(_ nom: String) -> URL { URL(fileURLWithPath: "/tmp/swap-\(nom)") }

    private func media(_ nom: String, mime: String = "image/jpeg") -> ComposerDocumentMedia {
        ComposerDocumentMedia(url: url(nom), mimeType: mime, durationMs: nil)
    }

    /// Un Post à trois médias, chacun fondateur de sa page.
    private func post() -> ComposerMediaPorters {
        let (a, b, c) = (url("a.jpg"), url("b.jpg"), url("c.jpg"))
        return ComposerMediaPorters(
            localMedia: [media("a.jpg"), media("b.jpg"), media("c.jpg")],
            roleByURL: [a: .background, b: .background, c: .background],
            slideIdByMediaURL: [a: "s1", b: "s2", c: "s3"],
            objectIdBySource: [a: "oa", b: "ob", c: "oc"],
            captions: [a: "légende a", b: "légende b", c: "légende c"],
            altsByObjectId: ["oa": "alt a", "ob": "alt b", "oc": "alt c"],
            transcriptions: [b: MobileTranscriptionPayload(text: "texte", language: "fr")],
            railPosedURLs: [b])
    }

    private func census(_ objets: [(String, String, URL?)]) -> ComposerCanvasCensus {
        ComposerCanvasCensus(objects: objets.map { ComposerCanvasObject(id: $0.0, slideId: $0.1, fileURL: $0.2) })
    }

    func test_theSecondMediaOfAPost_staysSecond() {
        let rendu = ComposerMediaSwap.swapping(post(), oldURL: url("b.jpg"), newMedia: media("b2.jpg"),
                                               oldObjectId: "ob", newObjectId: "ob2",
                                               census: census([("oa", "s1", url("a.jpg")), ("ob", "s2", url("b.jpg")), ("oc", "s3", url("c.jpg"))]))
        XCTAssertEqual(rendu.porteurs.localMedia.map(\.url), [url("a.jpg"), url("b2.jpg"), url("c.jpg")], "l'ordre des médias EST l'ordre des pages")
        XCTAssertEqual(rendu.porteurs.slideIdByMediaURL[url("b2.jpg")], "s2", "la fondation suit")
        XCTAssertEqual(rendu.porteurs.roleByURL[url("b2.jpg")], .background)
    }

    func test_theOldURL_isAbsentFromEveryIndex() {
        let rendu = ComposerMediaSwap.swapping(post(), oldURL: url("b.jpg"), newMedia: media("b2.jpg"),
                                               oldObjectId: "ob", newObjectId: "ob2",
                                               census: census([("ob", "s2", url("b.jpg"))]))
        let p = rendu.porteurs, ancienne = url("b.jpg")
        XCTAssertFalse(p.localMedia.contains { $0.url == ancienne })
        XCTAssertNil(p.roleByURL[ancienne])
        XCTAssertNil(p.slideIdByMediaURL[ancienne])
        XCTAssertNil(p.objectIdBySource[ancienne])
        XCTAssertNil(p.captions[ancienne])
        XCTAssertFalse(p.railPosedURLs.contains(ancienne))
        XCTAssertNil(p.transcriptions[ancienne], "le son a pu être coupé : la transcription de l'ancien fichier s'en va")
        XCTAssertEqual(rendu.forgottenURLs, [ancienne], "la pré-montée oublie l'ancien fichier")
    }

    func test_aRailPosedStory_keepsItsIdempotenceGuard() {
        let rendu = ComposerMediaSwap.swapping(post(), oldURL: url("b.jpg"), newMedia: media("b2.jpg"),
                                               oldObjectId: "ob", newObjectId: "ob2", census: .empty)
        XCTAssertTrue(rendu.porteurs.railPosedURLs.contains(url("b2.jpg")))
        XCTAssertNotNil(rendu.porteurs.roleByURL[url("b2.jpg")],
                        "sans rôle, le tour de dérivation suivant re-poserait le fichier")
    }

    func test_captionAndAlternative_followTheNewMedia() {
        let rendu = ComposerMediaSwap.swapping(post(), oldURL: url("b.jpg"), newMedia: media("b2.jpg"),
                                               oldObjectId: "ob", newObjectId: "ob2", census: .empty)
        XCTAssertEqual(rendu.porteurs.captions[url("b2.jpg")], "légende b")
        XCTAssertEqual(rendu.porteurs.altsByObjectId["ob2"], "alt b")
        XCTAssertNil(rendu.porteurs.altsByObjectId["ob"])
        XCTAssertEqual(rendu.porteurs.objectIdBySource[url("b2.jpg")], "ob2")
        XCTAssertEqual(rendu.porteurs.altsBySourceURL[url("b2.jpg")], "alt b", "la charge porte l'alternative sous le fichier neuf")
    }

    func test_whenADuplicateStillPaintsTheOldFile_itStays_andTheNewOneIsAdded() {
        let rendu = ComposerMediaSwap.swapping(post(), oldURL: url("b.jpg"), newMedia: media("b2.jpg"),
                                               oldObjectId: "ob", newObjectId: "ob2",
                                               census: census([("ob", "s2", url("b.jpg")), ("clone", "s2", url("b.jpg"))]))
        XCTAssertTrue(rendu.porteurs.localMedia.contains { $0.url == url("b.jpg") }, "le clone peint encore l'original")
        XCTAssertTrue(rendu.porteurs.localMedia.contains { $0.url == url("b2.jpg") })
        XCTAssertEqual(rendu.porteurs.objectIdBySource[url("b.jpg")], "clone", "l'original change de peintre")
        XCTAssertEqual(rendu.porteurs.altsByObjectId["clone"], "alt b", "et son alternative le suit")
        XCTAssertTrue(rendu.forgottenURLs.isEmpty, "la pré-montée ne perd pas un fichier encore peint")
    }

    func test_anObjectWithoutADocumentEntry_leavesThePortersAsTheyAre() {
        let avant = post()
        let rendu = ComposerMediaSwap.swapping(avant, oldURL: nil, newMedia: media("x.jpg"),
                                               oldObjectId: "inconnu", newObjectId: "neuf", census: .empty)
        XCTAssertEqual(rendu.porteurs, avant)
    }
}
