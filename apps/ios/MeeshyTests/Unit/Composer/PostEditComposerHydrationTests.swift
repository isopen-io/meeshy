import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Tout post ou réel s'édite dans le compositeur unifié** (#15631) — à
/// plusieurs médias, à plusieurs scènes ou en repost, rouvert FIDÈLEMENT, et
/// enregistré par la même requête de modification qu'aujourd'hui.
@MainActor
final class PostEditComposerHydrationTests: XCTestCase {

    // MARK: - Le réel à deux images, tel que l'API le sert

    func test_opensInComposer_twoImageReelServedByTheAPI_true() throws {
        let reel = try served(Self.twoImageReelJSON)

        XCTAssertEqual(reel.media.count, 2)
        XCTAssertTrue(PostEditComposerEligibility.opensInComposer(reel))
        XCTAssertEqual(PostEditRoute.resolve(for: reel, hasStoryComposer: true), .composer)
    }

    func test_slides_twoImageReelServedByTheAPI_showsBothImages() throws {
        let reel = try served(Self.twoImageReelJSON)
        let montres = PostEditComposerSession(post: reel, defaultLanguage: "fr").openedSlides
            .flatMap { ($0.effects.mediaObjects ?? []).map(\.postMediaId) }

        XCTAssertEqual(Set(montres), ["6aea869d674bc60d1d3ff652", "6aea869d674bc60d1d3ff653"])
    }

    func test_opensInComposer_twoImageReelReloadedWithoutCanvas_true() throws {
        var reel = try served(Self.twoImageReelJSON)
        reel.storyEffects = nil

        XCTAssertTrue(PostEditComposerEligibility.opensInComposer(reel),
                      "Un réel relu sans canevas se reconstruit en scènes depuis ses médias")
    }

    // MARK: - Plusieurs médias sans canevas : une diapo par média visuel

    func test_slides_multiMediaWithoutCanvas_oneSlidePerVisualMedia() {
        let publication = post(media: [media("i1", .image), media("v2", .video), media("i3", .image)])
        let slides = PostEditComposerSession(post: publication, defaultLanguage: "fr").openedSlides

        XCTAssertEqual(slides.map(\.mediaURL), ["/f/i1", "/f/v2", "/f/i3"])
    }

    func test_slides_audioWithoutCanvas_becomesASoundOfTheFirstSlide() {
        let publication = post(media: [media("i1", .image), media("a2", .audio)])
        let slides = PostEditComposerSession(post: publication, defaultLanguage: "fr").openedSlides

        XCTAssertEqual(slides.count, 1)
        XCTAssertEqual(slides[0].effects.audioPlayerObjects?.map(\.postMediaId), ["a2"])
    }

    func test_opensInComposer_documentTheSceneCannotShow_false() {
        let publication = post(media: [media("i1", .image), media("d2", .document)])
        XCTAssertFalse(PostEditComposerEligibility.opensInComposer(publication),
                       "Un document n'a pas de place sur une scène : l'ancien éditeur le garde visible")
    }

    func test_outcome_secondSlideDeleted_sendsItsMediaOnly() throws {
        let publication = post(media: [media("i1", .image), media("i2", .image)])
        let session = PostEditComposerSession(post: publication, defaultLanguage: "fr")
        let apres = Array(session.openedSlides.prefix(1))

        let edit = try saved(draft(), session, now: apres)

        XCTAssertEqual(edit.removeMediaIds, ["i2"])
        XCTAssertNil(edit.storyEffects)
    }

    func test_outcome_secondSlideBackgroundCleared_sendsItsMediaOnly() throws {
        let publication = post(media: [media("i1", .image), media("i2", .image)])
        let session = PostEditComposerSession(post: publication, defaultLanguage: "fr")
        var apres = session.openedSlides
        apres[1].mediaURL = nil

        XCTAssertEqual(try saved(draft(), session, now: apres).removeMediaIds, ["i2"])
    }

    func test_outcome_multiMediaUntouched_removesNothing() throws {
        let publication = post(media: [media("i1", .image), media("i2", .image), media("a3", .audio)])
        let session = PostEditComposerSession(post: publication, defaultLanguage: "fr")

        XCTAssertEqual(try saved(draft(), session).removeMediaIds, [])
    }

    // MARK: - Plusieurs scènes de canevas : une diapo par scène

    func test_slides_severalCanvasScenes_oneSlidePerScene() {
        let publication = post(media: [media("i1", .image), media("i2", .image)], effects: twoScenes())
        let slides = PostEditComposerSession(post: publication, defaultLanguage: "fr").openedSlides

        XCTAssertEqual(slides.map { ($0.effects.mediaObjects ?? []).map(\.postMediaId) }, [["i1"], ["i2"]])
        XCTAssertTrue(PostEditComposerEligibility.opensInComposer(publication))
    }

    func test_outcome_sceneMediaDeleted_sendsItsId() throws {
        let publication = post(media: [media("i1", .image), media("i2", .image)], effects: twoScenes())
        let session = PostEditComposerSession(post: publication, defaultLanguage: "fr")
        var apres = session.openedSlides
        apres[1].effects.mediaObjects = []

        XCTAssertEqual(try saved(draft(), session, now: apres).removeMediaIds, ["i2"])
    }

    /// Un texte ajouté sur la seconde scène s'ENREGISTRE (#15630) : le canevas du
    /// brouillon repart, entier.
    func test_outcome_textAddedOnSecondScene_sendsTheDraftCanvas() throws {
        let publication = post(media: [media("i1", .image), media("i2", .image)], effects: twoScenes())
        let session = PostEditComposerSession(post: publication, defaultLanguage: "fr")
        var apres = session.openedSlides
        apres[1].effects.textObjects.append(StoryTextObject(id: "t", text: "Salut", x: 0.5, y: 0.5, scale: 1,
                                                            rotation: 0, fontSize: 20, textStyle: "bold",
                                                            textColor: "FFFFFF", textAlign: "center", textBg: nil))

        let edit = try saved(draft(effects: twoScenes()), session, now: apres)

        XCTAssertTrue(edit.known.contains(.storyEffects))
        XCTAssertNotNil(edit.storyEffects?.canvasV3)
    }

    // MARK: - Le repost : son texte s'édite, son type et sa citation non

    func test_route_repost_opensTheComposer() {
        XCTAssertEqual(PostEditRoute.resolve(for: repost(type: "REEL"), hasStoryComposer: true), .composer)
    }

    func test_profile_editedRepost_offersOnlyItsOwnFormat() {
        let profil = ComposerProfile.profile(for: .edit(postId: "r", documentFormat: .reel, isRepost: true),
                                             compositionQualifiesAsReel: true)
        XCTAssertEqual(profil.offeredFormats, [.reel])
        XCTAssertEqual(profil.initialFormat, .reel)
    }

    func test_intent_repostSession_carriesTheRepostToTheOrigin() {
        let session = PostEditComposerSession(post: repost(type: "POST"), defaultLanguage: "fr")
        XCTAssertEqual(session.origin, .edit(postId: "r1", documentFormat: .post, isRepost: true))
    }

    func test_outcome_repost_neverDeclaresTheType() throws {
        let session = PostEditComposerSession(post: repost(type: "POST"), defaultLanguage: "fr")
        let edit = try saved(draft(text: "Mon avis, réécrit"), session)

        XCTAssertEqual(edit.content, "Mon avis, réécrit")
        XCTAssertNil(edit.type)
        XCTAssertFalse(edit.known.contains(.type), "Un repost miroite le type de sa source")
    }

    // MARK: - Le repli du réel

    func test_profile_editedReelNoLongerQualifying_fallsBackToPost() {
        let profil = ComposerProfile.profile(for: .edit(postId: "d", documentFormat: .reel),
                                             compositionQualifiesAsReel: false)
        XCTAssertEqual(profil.offeredFormats, [.post])
        XCTAssertEqual(profil.initialFormat, .post)
    }

    func test_reelIsChoosable_reelReopenedUntouched_true() {
        let reel = post(type: "REEL", media: [media("i1", .image), media("i2", .image)])
        let session = PostEditComposerSession(post: reel, defaultLanguage: "fr")
        XCTAssertTrue(session.baseline.reelIsChoosable(slides: session.openedSlides))
    }

    func test_reelIsChoosable_reelLeftWithOneImage_false() {
        let reel = post(type: "REEL", media: [media("i1", .image), media("i2", .image)])
        let session = PostEditComposerSession(post: reel, defaultLanguage: "fr")
        XCTAssertFalse(session.baseline.reelIsChoosable(slides: Array(session.openedSlides.prefix(1))),
                       "Le gateway refuse un réel non qualifiant (422) : le retrait impose le post")
    }

    // MARK: - Fabriques

    private struct Refused: Error {}

    private func saved(_ draft: ComposerDocumentDraft, _ session: PostEditComposerSession,
                       now: [StorySlide]? = nil) throws -> EditPostDraft {
        let outcome = PostEditComposerSave.outcome(draft: draft, baseline: session.baseline,
                                                   openedSlides: session.openedSlides,
                                                   slides: now ?? session.openedSlides)
        guard case .save(let edit) = outcome else {
            XCTFail("refusé alors qu'un enregistrement était attendu : \(outcome)")
            throw Refused()
        }
        return edit
    }

    private func served(_ json: String) throws -> FeedPost {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIPost.self, from: Data(json.utf8)).toFeedPost(preferredLanguages: ["fr"])
    }

    private func post(type: String = "POST", media: [FeedMedia], effects: StoryEffects? = nil) -> FeedPost {
        var p = FeedPost(id: "post-1", author: "moi", type: type, content: "x", media: media, originalLanguage: "fr")
        p.storyEffects = effects
        return p
    }

    private func repost(type: String) -> FeedPost {
        var p = FeedPost(id: "r1", author: "moi", type: type, content: "Mon avis", originalLanguage: "fr")
        p.repost = RepostContent(id: "src", author: "a", content: "La source")
        return p
    }

    private func media(_ id: String, _ type: FeedMediaType) -> FeedMedia {
        FeedMedia(id: id, type: type, url: "/f/\(id)")
    }

    private func twoScenes() -> StoryEffects {
        let scenes: [StoryEffects] = ["i1", "i2"].map { id in
            var e = StoryEffects()
            e.mediaObjects = [StoryMediaObject(id: "obj-\(id)", postMediaId: id, kind: .image, aspectRatio: 1)]
            return e
        }
        var effets = scenes[0]
        effets.canvasV3 = CanvasV3(migrating: scenes)
        return effets
    }

    private func draft(text: String = "x", effects: StoryEffects? = nil) -> ComposerDocumentDraft {
        ComposerDocumentDraft.document(
            format: .post, forcePlainPost: true, text: text, visibility: .public, visibilityUserIds: [],
            repostOfId: nil, localMedia: [], location: nil, discoverabilityPrecision: nil, originalLanguage: "fr",
            mobileTranscription: nil, references: [], storyEffects: effects, mediaCaptions: [:], mediaAlts: [:],
            mediaObjectIds: [:], allowSoundExtraction: nil
        )
    }

    /// Le réel publié depuis le compositeur sur le staging, relu par
    /// `GET /posts/:id` — champs de rendu retirés, structure du canevas intacte.
    private static let twoImageReelJSON = """
    {
      "id": "6aea869e674bc60d1d3ff655", "type": "REEL",
      "content": "Recette #9333 réel avant modification", "originalLanguage": "fr",
      "visibility": "FRIENDS", "visibilityUserIds": [], "createdAt": "2026-11-04T01:20:00Z",
      "author": { "id": "6ada27bf28983c39d9838be9", "username": "recmod_m" },
      "media": [
        { "id": "6aea869d674bc60d1d3ff652", "mimeType": "image/png", "width": 600, "height": 600, "order": 0,
          "fileUrl": "2026/11/6ada27bf28983c39d9838be9/0_703cd2b1.png",
          "thumbnailUrl": "2026/11/6ada27bf28983c39d9838be9/0_703cd2b1_thumb.webp", "duration": null },
        { "id": "6aea869d674bc60d1d3ff653", "mimeType": "image/png", "width": 600, "height": 600, "order": 1,
          "fileUrl": "2026/11/6ada27bf28983c39d9838be9/1_0b142ec1.png",
          "thumbnailUrl": "2026/11/6ada27bf28983c39d9838be9/1_0b142ec1_thumb.webp", "duration": null }
      ],
      "storyEffects": { "v": 3, "scenes": [ { "id": "s1", "objects": [
        { "id": "bg", "kind": "media", "plane": "bg", "z": 0, "anchor": { "x": 0.5, "y": 0.5, "t": "free" },
          "transform": { "rotation": 0, "scale": 1, "opacity": 1 }, "payload": { "transform": { "videoFitMode": "fit" } } },
        { "id": "DE0B61B3-805A-465A-B84C-D65383693A71", "kind": "media", "plane": "content", "z": 1, "locale": "fr",
          "anchor": { "x": 0.5, "y": 0.5, "t": "free" }, "transform": { "rotation": 0, "scale": 1, "opacity": 1 },
          "payload": { "mediaType": "image", "aspectRatio": 1, "isBackground": true, "loop": true,
                       "mediaURL": "2026/11/6ada27bf28983c39d9838be9/0_703cd2b1.png",
                       "postMediaId": "6aea869d674bc60d1d3ff652" } },
        { "id": "97C0DB67-9B51-44C9-BC75-388996A1665B", "kind": "media", "plane": "content", "z": 3, "locale": "fr",
          "anchor": { "x": 0.5, "y": 0.5, "t": "free" }, "transform": { "rotation": 0, "scale": 1, "opacity": 1 },
          "payload": { "mediaType": "image", "aspectRatio": 1,
                       "mediaURL": "2026/11/6ada27bf28983c39d9838be9/1_0b142ec1.png",
                       "postMediaId": "6aea869d674bc60d1d3ff653" } }
      ] } ] }
    }
    """
}

/// **Une publication rouverte ne bascule jamais d'elle-même en réel** (#15631).
@MainActor
final class PostEditReelAutoSwitchTests: XCTestCase {

    func test_demandsReel_editedPostWithVideoBackground_false() {
        XCTAssertFalse(ComposerReelAutoSwitch.demandsReel([videoBackgroundSlide()], slideImageIds: [],
                                                          editsPublication: true))
    }

    func test_demandsReel_newCompositionWithVideoBackground_true() {
        XCTAssertTrue(ComposerReelAutoSwitch.demandsReel([videoBackgroundSlide()], slideImageIds: [],
                                                         editsPublication: false))
    }

    private func videoBackgroundSlide() -> StorySlide {
        var effets = StoryEffects()
        effets.mediaObjects = [StoryMediaObject(id: "fond", postMediaId: "v1", kind: .video, aspectRatio: 1,
                                                isBackground: true)]
        return StorySlide(id: "s1", mediaURL: nil, mediaData: nil, content: nil, effects: effets, duration: 6, order: 0)
    }
}
