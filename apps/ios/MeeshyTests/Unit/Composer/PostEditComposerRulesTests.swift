import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **« Modifier » un post ou un réel ouvre le compositeur unifié** (#9333) —
/// et l'enregistrement rend la même requête de modification que `EditPostSheet`.
@MainActor
final class PostEditComposerRulesTests: XCTestCase {

    // MARK: - Qui s'ouvre dans le compositeur

    func test_opensInComposer_textOnlyPost_true() {
        XCTAssertTrue(PostEditComposerEligibility.opensInComposer(post(type: "POST")))
    }

    func test_opensInComposer_reelWhoseVideoIsASceneObject_true() {
        let reel = post(type: "REEL", media: [media("v1", .video)], effects: effects(objects: ["v1"]))
        XCTAssertTrue(PostEditComposerEligibility.opensInComposer(reel))
    }

    func test_opensInComposer_singleFreeImage_trueAsBackground() {
        XCTAssertTrue(PostEditComposerEligibility.opensInComposer(post(type: "POST", media: [media("i1", .image)])))
    }

    func test_opensInComposer_secondImageWithoutCanvas_trueAsItsOwnSlide() {
        let classique = post(type: "POST", media: [media("i1", .image), media("i2", .image)])
        XCTAssertTrue(PostEditComposerEligibility.opensInComposer(classique),
                      "La seconde image devient une diapo : l'auteur la voit et peut la retirer")
    }

    func test_opensInComposer_story_false_repost_true() {
        XCTAssertFalse(PostEditComposerEligibility.opensInComposer(post(type: "STORY")))
        var repost = post(type: "POST")
        repost.repost = RepostContent(id: "src", author: "a", content: "c")
        XCTAssertTrue(PostEditComposerEligibility.opensInComposer(repost))
    }

    func test_opensInComposer_severalCanvasScenes_true() {
        var plusieurs = effects(objects: [])
        plusieurs.canvasV3 = CanvasV3(scenes: [SceneV3(id: "s1", objects: []), SceneV3(id: "s2", objects: [])])
        XCTAssertTrue(PostEditComposerEligibility.opensInComposer(post(type: "POST", effects: plusieurs)))
    }

    // MARK: - Ce que l'enregistrement envoie

    func test_outcome_unchangedPost_sendsContentOnly_likeTheSheet() throws {
        let publication = post(type: "POST", content: "Bonjour", language: "fr", visibility: "FRIENDS")
        let edit = try saved(draft(text: "Bonjour", visibility: .friends, language: "fr"), publication)

        XCTAssertEqual(edit.content, "Bonjour")
        XCTAssertNil(edit.language)
        XCTAssertNil(edit.type)
        XCTAssertNil(edit.visibility)
        XCTAssertNil(edit.visibilityUserIds)
        XCTAssertNil(edit.location)
        XCTAssertTrue(edit.removeMediaIds.isEmpty)
        XCTAssertNil(edit.storyEffects, "Le canevas ne part pas : la requête reste celle de la feuille")
        XCTAssertEqual(edit.known, EditPostDraft.documentFields.subtracting([.removeMediaIds]))
    }

    func test_outcome_textAudienceFormatLanguage_changed_allTravel() throws {
        let reel = post(type: "REEL", content: "Avant", language: "fr", visibility: "PUBLIC",
                        media: [media("v1", .video)], effects: effects(objects: ["v1"]))
        let edit = try saved(draft(format: .post, text: "  Après  ", visibility: .only, ids: ["u1"], language: "en"), reel)

        XCTAssertEqual(edit.content, "Après")
        XCTAssertEqual(edit.type, "POST")
        XCTAssertEqual(edit.language, "en")
        XCTAssertEqual(edit.visibility, "ONLY")
        XCTAssertEqual(edit.visibilityUserIds, ["u1"])
        XCTAssertEqual(edit.known, EditPostDraft.documentFields)
    }

    func test_outcome_postWithoutDeclaredLanguage_keepsDefault_noRetranslation() throws {
        let edit = try saved(draft(text: "x", language: "fr"), post(type: "POST", content: "x", language: nil),
                             defaultLanguage: "fr")
        XCTAssertNil(edit.language)
    }

    func test_outcome_locationRemoved_sendsRemove_andSet_sendsSet() throws {
        let lieu = SharedPlace(latitude: 1, longitude: 2)
        let ailleurs = SharedPlace(latitude: 3, longitude: 4)
        let publication = post(type: "POST", content: "x", location: lieu)

        XCTAssertEqual(try saved(draft(text: "x", location: nil), publication).location, .remove)
        XCTAssertEqual(try saved(draft(text: "x", location: ailleurs), publication).location, .set(ailleurs))
        XCTAssertNil(try saved(draft(text: "x", location: lieu), publication).location)
    }

    func test_outcome_mediaObjectDeletedFromScene_sendsItsId() throws {
        let publication = post(type: "POST", content: "x", media: [media("i1", .image), media("i2", .image)],
                               effects: effects(objects: ["i1", "i2"]))
        let ouverte = slides(of: publication)
        var apres = ouverte
        apres[0].effects.mediaObjects = apres[0].effects.mediaObjects?.filter { $0.postMediaId != "i2" }

        let edit = try saved(draft(text: "x"), publication, opened: ouverte, now: apres)

        XCTAssertEqual(edit.removeMediaIds, ["i2"])
    }

    func test_outcome_backgroundRemoved_sendsItsId() throws {
        let publication = post(type: "POST", content: "x", media: [media("i1", .image)])
        let ouverte = slides(of: publication)
        var apres = ouverte
        apres[0].mediaURL = nil

        XCTAssertEqual(try saved(draft(text: "x"), publication, opened: ouverte, now: apres).removeMediaIds, ["i1"])
    }

    func test_outcome_newLocalMedia_isUploadedRatherThanRefused() {
        let piece = ComposerDocumentMedia(url: URL(fileURLWithPath: "/tmp/a.jpg"), mimeType: "image/jpeg", durationMs: nil)
        let outcome = PostEditComposerSave.outcome(draft: draft(text: "x", localMedia: [piece]),
                                                   baseline: PostEditBaseline(post: post(type: "POST", content: "x"),
                                                                              defaultLanguage: "fr"),
                                                   openedSlides: [], slides: [])
        guard case .upload(_, let medias) = outcome else { return XCTFail("attendu : téléversement, obtenu \(outcome)") }
        XCTAssertEqual(medias.urls, [piece.url])
    }

    func test_outcome_emptyTextWithoutMedia_refusesEmpty() {
        XCTAssertEqual(refusal(draft(text: "   "), post(type: "POST", content: "x")), .empty)
    }

    func test_outcome_onlyWithoutRecipients_refusesIncompleteAudience() {
        XCTAssertEqual(refusal(draft(text: "x", visibility: .only, ids: []), post(type: "POST", content: "x")),
                       .incompleteAudience)
    }

    func test_outcome_storyFormat_refused() {
        XCTAssertEqual(refusal(draft(format: .story, text: "x"), post(type: "POST", content: "x")), .notADocumentFormat)
    }

    // MARK: - Fabriques

    private struct Refused: Error {}

    private func saved(_ draft: ComposerDocumentDraft, _ post: FeedPost, defaultLanguage: String = "fr",
                       opened: [StorySlide]? = nil, now: [StorySlide]? = nil) throws -> EditPostDraft {
        let ouverte = opened ?? slides(of: post)
        let outcome = PostEditComposerSave.outcome(draft: draft,
                                                   baseline: PostEditBaseline(post: post, defaultLanguage: defaultLanguage),
                                                   openedSlides: ouverte, slides: now ?? ouverte)
        guard case .save(let edit) = outcome else {
            XCTFail("refusé alors qu'un enregistrement était attendu : \(outcome)")
            throw Refused()
        }
        return edit
    }

    private func refusal(_ draft: ComposerDocumentDraft, _ post: FeedPost,
                         opened: [StorySlide]? = nil, now: [StorySlide]? = nil) -> PostEditComposerRefusal? {
        let ouverte = opened ?? slides(of: post)
        let outcome = PostEditComposerSave.outcome(draft: draft, baseline: PostEditBaseline(post: post, defaultLanguage: "fr"),
                                                   openedSlides: ouverte, slides: now ?? ouverte)
        guard case .refuse(let raison) = outcome else { return nil }
        return raison
    }

    private func slides(of post: FeedPost) -> [StorySlide] {
        StoryComposerViewModel(editing: StoryItem(id: post.id, content: nil, media: post.media,
                                                  storyEffects: post.storyEffects)).slides
    }

    private func post(type: String, content: String = "", language: String? = nil, visibility: String? = nil,
                      media: [FeedMedia] = [], effects: StoryEffects? = nil, location: SharedPlace? = nil) -> FeedPost {
        var p = FeedPost(id: "post-1", author: "moi", type: type, content: content, media: media, originalLanguage: language)
        p.visibility = visibility
        p.storyEffects = effects
        p.location = location
        return p
    }

    private func media(_ id: String, _ type: FeedMediaType) -> FeedMedia {
        FeedMedia(id: id, type: type, url: "/api/v1/attachments/file/\(id)")
    }

    private func effects(objects: [String]) -> StoryEffects {
        var e = StoryEffects()
        e.mediaObjects = objects.map { StoryMediaObject(id: "obj-\($0)", postMediaId: $0, kind: .image, aspectRatio: 1) }
        return e
    }

    private func draft(format: ComposerFormat = .post, text: String, visibility: PostVisibility = .public,
                       ids: [String] = [], language: String? = "fr", location: SharedPlace? = nil,
                       localMedia: [ComposerDocumentMedia] = []) -> ComposerDocumentDraft {
        ComposerDocumentDraft.document(
            format: format, forcePlainPost: format == .post, text: text, visibility: visibility,
            visibilityUserIds: ids, repostOfId: nil, localMedia: localMedia, location: location,
            discoverabilityPrecision: nil, originalLanguage: language, mobileTranscription: nil, references: [],
            storyEffects: nil, mediaCaptions: [:], mediaAlts: [:], mediaObjectIds: [:], allowSoundExtraction: nil
        )
    }
}
