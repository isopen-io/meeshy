import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Modifier un post enregistre aussi ce qui change sur sa scène** (#15630).
///
/// La porte d'édition refusait un média neuf et toute scène remaniée ; elle les
/// enregistre désormais : le canevas ENTIER repart quand la scène a changé, les
/// médias neufs se téléversent puis se rattachent par `mediaIds`, et les
/// références déclarées partent dès que l'ensemble servi a été relu.
@MainActor
final class PostEditSceneSaveTests: XCTestCase {

    // MARK: - Médias neufs

    func test_outcome_newLocalMedia_uploadsBeforeSaving() {
        let piece = ComposerDocumentMedia(url: URL(fileURLWithPath: "/tmp/neuf.jpg"), mimeType: "image/jpeg", durationMs: nil)
        let outcome = outcome(draft(text: "x", localMedia: [piece], effects: canvas(objectId: "obj-neuf")),
                              post(content: "x"))

        guard case .upload(let edit, let medias) = outcome else { return XCTFail("attendu : téléversement, obtenu \(outcome)") }
        XCTAssertEqual(medias.urls, [piece.url])
        XCTAssertEqual(medias.mimeTypes, ["image/jpeg"])
        XCTAssertEqual(medias.objectIds, ["obj-neuf"])
        XCTAssertTrue(edit.known.contains(.storyEffects), "une scène qui reçoit un média renvoie son canevas")
        XCTAssertNotNil(edit.storyEffects)
    }

    func test_attaching_sendsTheUploadedIds_andTheCanvasAdoptsThem() {
        let piece = ComposerDocumentMedia(url: URL(fileURLWithPath: "/tmp/neuf.jpg"), mimeType: "image/jpeg", durationMs: nil)
        guard case .upload(let edit, let medias) = outcome(
            draft(text: "x", localMedia: [piece], effects: canvas(objectId: "obj-neuf"),
                  alts: [piece.url: "Un chat"]),
            post(content: "x")) else { return XCTFail("attendu : téléversement") }
        var montes = PublicationMediaUploads()
        montes.ids = ["m-serveur"]
        montes.urls = ["https://cdn/m.jpg"]
        montes.sourceIndexes = [0]
        montes.localPaths = [piece.url.path]

        let rattache = PostEditMediaUpload.attaching(montes, pending: medias, to: edit)

        XCTAssertEqual(rattache.additions.mediaIds, ["m-serveur"])
        XCTAssertTrue(rattache.known.isSuperset(of: [.mediaIds, .mediaAlt, .mediaCaption, .storyEffects]))
        XCTAssertEqual(rattache.storyEffects?.mediaObjects?.first?.postMediaId, "m-serveur")
        XCTAssertEqual(rattache.storyEffects?.mediaObjects?.first?.mediaURL, "https://cdn/m.jpg")
        XCTAssertEqual(rattache.additions.mediaAlt, ["m-serveur": "Un chat"])
        let corps = PostEditPayload.build(known: rattache.known, draft: rattache.payload)
        XCTAssertEqual(corps.mediaIds, ["m-serveur"])
    }

    // MARK: - Scène remaniée

    func test_outcome_textObjectAdded_sendsTheWholeCanvas() throws {
        let publication = post(content: "x", media: [media("i1")], effects: effects(objects: ["i1"]))
        let ouverte = slides(of: publication)
        var apres = ouverte
        apres[0].effects.textObjects.append(texte("t-neuf", x: 0.5))

        let edit = try saved(draft(text: "x", effects: apres[0].effects), publication, opened: ouverte, now: apres)

        XCTAssertTrue(edit.known.contains(.storyEffects))
        XCTAssertEqual(edit.storyEffects?.textObjects.map(\.id), ["t-neuf"])
    }

    func test_outcome_objectMoved_sendsTheCanvas() throws {
        var effets = effects(objects: ["i1"])
        effets.textObjects = [texte("t1", x: 0.2)]
        let publication = post(content: "x", media: [media("i1")], effects: effets)
        let ouverte = slides(of: publication)
        var apres = ouverte
        apres[0].effects.textObjects[0].x = 0.8

        let edit = try saved(draft(text: "x", effects: apres[0].effects), publication, opened: ouverte, now: apres)

        XCTAssertTrue(edit.known.contains(.storyEffects), "déplacer un objet est un remaniement")
        XCTAssertEqual(edit.storyEffects?.textObjects.first?.x ?? 0, 0.8, accuracy: 0.0001)
    }

    func test_outcome_aRoundingDrift_isNotAReshape() throws {
        var effets = effects(objects: ["i1"])
        effets.textObjects = [texte("t1", x: 0.2)]
        let publication = post(content: "x", media: [media("i1")], effects: effets)
        let ouverte = slides(of: publication)
        var apres = ouverte
        apres[0].effects.textObjects[0].x = 0.2001

        let edit = try saved(draft(text: "y", effects: apres[0].effects), publication, opened: ouverte, now: apres)

        XCTAssertFalse(edit.known.contains(.storyEffects), "un arrondi n'est pas un geste : seul le texte part")
        XCTAssertNil(edit.storyEffects)
    }

    // MARK: - Références déclarées

    func test_outcome_declaredReferencesRead_sendsThem_evenEmpty() throws {
        let edit = try saved(draft(text: "x"), post(content: "x"), knowsReferences: true)
        XCTAssertTrue(edit.known.contains(.mentions))
        XCTAssertEqual(edit.additions.mentions, [], "l'ensemble relu et vidé s'écrit [] : plus aucune référence déclarée")
    }

    func test_outcome_declaredReferencesNotRead_neverWritesThem() throws {
        let edit = try saved(draft(text: "x"), post(content: "x"), knowsReferences: false)
        XCTAssertFalse(edit.known.contains(.mentions), "renvoyer la liste amputée du fil révoquerait les silencieuses")
    }

    // MARK: - Le bouton dit « Enregistrer »

    func test_editingOrigin_namesTheButtonSave() {
        let choix = ComposerPublishChoice(format: .post, layout: nil)
        XCTAssertEqual(ComposerPublishMenuCopy.publishTitle(for: choix, origin: .edit(postId: "p", documentFormat: .post)),
                       String(localized: "composer.edit.save", defaultValue: "Enregistrer", bundle: .main))
        XCTAssertEqual(ComposerPublishMenuCopy.publishTitle(for: choix, origin: .feedComposer),
                       ComposerPublishMenuCopy.publishTitle(for: choix))
    }

    // MARK: - Fabriques

    private struct Refused: Error {}

    private func outcome(_ draft: ComposerDocumentDraft, _ post: FeedPost, opened: [StorySlide]? = nil,
                         now: [StorySlide]? = nil, knowsReferences: Bool = false) -> PostEditComposerOutcome {
        let ouverte = opened ?? slides(of: post)
        return PostEditComposerSave.outcome(draft: draft, baseline: PostEditBaseline(post: post, defaultLanguage: "fr"),
                                            openedSlides: ouverte, slides: now ?? ouverte,
                                            knowsDeclaredReferences: knowsReferences)
    }

    private func saved(_ draft: ComposerDocumentDraft, _ post: FeedPost, opened: [StorySlide]? = nil,
                       now: [StorySlide]? = nil, knowsReferences: Bool = false) throws -> EditPostDraft {
        let resultat = outcome(draft, post, opened: opened, now: now, knowsReferences: knowsReferences)
        guard case .save(let edit) = resultat else {
            XCTFail("attendu : enregistrement, obtenu \(resultat)")
            throw Refused()
        }
        return edit
    }

    private func slides(of post: FeedPost) -> [StorySlide] {
        StoryComposerViewModel(editing: StoryItem(id: post.id, content: nil, media: post.media,
                                                  storyEffects: post.storyEffects)).slides
    }

    private func post(content: String, media: [FeedMedia] = [], effects: StoryEffects? = nil) -> FeedPost {
        var p = FeedPost(id: "post-1", author: "moi", type: "POST", content: content, media: media, originalLanguage: "fr")
        p.storyEffects = effects
        return p
    }

    private func media(_ id: String) -> FeedMedia {
        FeedMedia(id: id, type: .image, url: "/api/v1/attachments/file/\(id)")
    }

    private func effects(objects: [String]) -> StoryEffects {
        var e = StoryEffects()
        e.mediaObjects = objects.map { StoryMediaObject(id: "obj-\($0)", postMediaId: $0, kind: .image, aspectRatio: 1) }
        return e
    }

    private func canvas(objectId: String) -> StoryEffects {
        var e = StoryEffects()
        var objet = StoryMediaObject(id: objectId, postMediaId: "", kind: .image, aspectRatio: 1)
        objet.mediaURL = "file:///tmp/neuf.jpg"
        e.mediaObjects = [objet]
        return e
    }

    private func texte(_ id: String, x: Double) -> StoryTextObject {
        StoryTextObject(id: id, text: "Salut", x: x, y: 0.5, scale: 1, rotation: 0, fontSize: 20, textStyle: "bold",
                        textColor: "FFFFFF", textAlign: "center", textBg: nil)
    }

    private func draft(text: String, localMedia: [ComposerDocumentMedia] = [], effects: StoryEffects? = nil,
                       alts: ComposerMediaCaptions = [:]) -> ComposerDocumentDraft {
        let ponts = Dictionary(uniqueKeysWithValues: localMedia.compactMap { piece in
            effects?.mediaObjects?.first.map { (piece.url, $0.id) }
        })
        return ComposerDocumentDraft.document(
            format: .post, forcePlainPost: true, text: text, visibility: .public,
            visibilityUserIds: [], repostOfId: nil, localMedia: localMedia, location: nil,
            discoverabilityPrecision: nil, originalLanguage: "fr", mobileTranscription: nil, references: [],
            storyEffects: effects, mediaCaptions: [:], mediaAlts: alts, mediaObjectIds: ponts, allowSoundExtraction: nil
        )
    }
}
