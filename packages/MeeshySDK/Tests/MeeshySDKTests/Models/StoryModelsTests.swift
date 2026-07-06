import XCTest
@testable import MeeshySDK

final class StoryModelsTests: XCTestCase {

    // MARK: - StoryTextStyle

    func testStoryTextStyleAllCases() {
        let cases = StoryTextStyle.allCases
        XCTAssertEqual(cases.count, 11)
        XCTAssertTrue(cases.contains(.bold))
        XCTAssertTrue(cases.contains(.neon))
        XCTAssertTrue(cases.contains(.typewriter))
        XCTAssertTrue(cases.contains(.handwriting))
        XCTAssertTrue(cases.contains(.classic))
        XCTAssertTrue(cases.contains(.calligraphy))
        XCTAssertTrue(cases.contains(.cartoon))
        XCTAssertTrue(cases.contains(.futuristic))
        XCTAssertTrue(cases.contains(.fantasy))
        XCTAssertTrue(cases.contains(.curve))
        XCTAssertTrue(cases.contains(.tag))
    }

    func testStoryTextStyleDisplayNames() {
        XCTAssertEqual(StoryTextStyle.bold.displayName, "Bold")
        XCTAssertEqual(StoryTextStyle.neon.displayName, "Neon")
        XCTAssertEqual(StoryTextStyle.typewriter.displayName, "Typewriter")
        XCTAssertEqual(StoryTextStyle.handwriting.displayName, "Handwriting")
        XCTAssertEqual(StoryTextStyle.classic.displayName, "Classic")
    }

    func testStoryTextStyleFontNames() {
        XCTAssertNil(StoryTextStyle.bold.fontName)
        XCTAssertNil(StoryTextStyle.neon.fontName)
        XCTAssertEqual(StoryTextStyle.typewriter.fontName, "Courier")
        XCTAssertEqual(StoryTextStyle.handwriting.fontName, "SnellRoundhand")
        XCTAssertEqual(StoryTextStyle.classic.fontName, "Georgia")
    }

    // MARK: - StoryFilter

    func testStoryFilterAllCases() {
        let cases = StoryFilter.allCases
        XCTAssertEqual(cases.count, 8)
        XCTAssertTrue(cases.contains(.vintage))
        XCTAssertTrue(cases.contains(.bw))
        XCTAssertTrue(cases.contains(.warm))
        XCTAssertTrue(cases.contains(.cool))
        XCTAssertTrue(cases.contains(.dramatic))
        XCTAssertTrue(cases.contains(.vivid))
        XCTAssertTrue(cases.contains(.fade))
        XCTAssertTrue(cases.contains(.chrome))
    }

    func testStoryFilterDisplayNames() {
        XCTAssertEqual(StoryFilter.vintage.displayName, "Vintage")
        XCTAssertEqual(StoryFilter.bw.displayName, "N&B")
        XCTAssertEqual(StoryFilter.warm.displayName, "Chaud")
        XCTAssertEqual(StoryFilter.cool.displayName, "Froid")
        XCTAssertEqual(StoryFilter.dramatic.displayName, "Dramatic")
        XCTAssertEqual(StoryFilter.vivid.displayName, "Vivid")
        XCTAssertEqual(StoryFilter.fade.displayName, "Fade")
        XCTAssertEqual(StoryFilter.chrome.displayName, "Chrome")
    }

    func testStoryFilterCIFilterNames() {
        XCTAssertEqual(StoryFilter.vintage.ciFilterName, "CIPhotoEffectTransfer")
        XCTAssertEqual(StoryFilter.bw.ciFilterName, "CIPhotoEffectMono")
        XCTAssertEqual(StoryFilter.warm.ciFilterName, "CITemperatureAndTint")
        XCTAssertEqual(StoryFilter.cool.ciFilterName, "CITemperatureAndTint")
        XCTAssertEqual(StoryFilter.dramatic.ciFilterName, "CIPhotoEffectProcess")
        XCTAssertEqual(StoryFilter.vivid.ciFilterName, "CIColorControls")
        XCTAssertEqual(StoryFilter.fade.ciFilterName, "CIPhotoEffectFade")
        XCTAssertEqual(StoryFilter.chrome.ciFilterName, "CIPhotoEffectChrome")
    }

    // MARK: - StoryTransitionEffect

    func testStoryTransitionEffectAllCases() {
        let cases = StoryTransitionEffect.allCases
        XCTAssertEqual(cases.count, 4)
        XCTAssertTrue(cases.contains(.fade))
        XCTAssertTrue(cases.contains(.zoom))
        XCTAssertTrue(cases.contains(.slide))
        XCTAssertTrue(cases.contains(.reveal))
    }

    func testStoryTransitionEffectLabels() {
        XCTAssertEqual(StoryTransitionEffect.fade.label, "Fondu")
        XCTAssertEqual(StoryTransitionEffect.zoom.label, "Zoom")
        XCTAssertEqual(StoryTransitionEffect.slide.label, "Glissement")
        XCTAssertEqual(StoryTransitionEffect.reveal.label, "Révélation")
    }

    func testStoryTransitionEffectIconNames() {
        XCTAssertEqual(StoryTransitionEffect.fade.iconName, "sun.max")
        XCTAssertEqual(StoryTransitionEffect.zoom.iconName, "arrow.up.left.and.arrow.down.right")
        XCTAssertEqual(StoryTransitionEffect.slide.iconName, "arrow.up")
        XCTAssertEqual(StoryTransitionEffect.reveal.iconName, "circle.dashed")
    }

    // MARK: - PostType

    func testPostTypeAllCases() {
        let cases = PostType.allCases
        XCTAssertEqual(cases.count, 4)
        XCTAssertTrue(cases.contains(.post))
        XCTAssertTrue(cases.contains(.reel))
        XCTAssertTrue(cases.contains(.story))
        XCTAssertTrue(cases.contains(.status))
    }

    func testPostTypeRawValues() {
        XCTAssertEqual(PostType.post.rawValue, "POST")
        XCTAssertEqual(PostType.reel.rawValue, "REEL")
        XCTAssertEqual(PostType.story.rawValue, "STORY")
        XCTAssertEqual(PostType.status.rawValue, "STATUS")
    }

    func testPostTypeDisplayNames() {
        XCTAssertEqual(PostType.post.displayName, "Post")
        XCTAssertEqual(PostType.reel.displayName, "Réel")
        XCTAssertEqual(PostType.story.displayName, "Story")
        XCTAssertEqual(PostType.status.displayName, "Status")
    }

    func testPostTypeIcons() {
        XCTAssertEqual(PostType.post.icon, "square.and.pencil")
        XCTAssertEqual(PostType.reel.icon, "play.rectangle.on.rectangle.fill")
        XCTAssertEqual(PostType.story.icon, "camera.fill")
        XCTAssertEqual(PostType.status.icon, "face.smiling")
    }

    // MARK: - StoryTextPosition

    func testStoryTextPositionStaticPositions() {
        XCTAssertEqual(StoryTextPosition.center.x, 0.5)
        XCTAssertEqual(StoryTextPosition.center.y, 0.5)
        XCTAssertEqual(StoryTextPosition.top.x, 0.5)
        XCTAssertEqual(StoryTextPosition.top.y, 0.2)
        XCTAssertEqual(StoryTextPosition.bottom.x, 0.5)
        XCTAssertEqual(StoryTextPosition.bottom.y, 0.8)
    }

    func testStoryTextPositionCodableRoundtrip() throws {
        let original = StoryTextPosition(x: 0.3, y: 0.7)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryTextPosition.self, from: data)
        XCTAssertEqual(decoded.x, 0.3)
        XCTAssertEqual(decoded.y, 0.7)
    }

    func testStoryTextPositionDefaultValues() {
        let pos = StoryTextPosition()
        XCTAssertEqual(pos.x, 0.5)
        XCTAssertEqual(pos.y, 0.5)
    }

    // MARK: - StoryEffects

    func testStoryEffectsInitDefaults() {
        let effects = StoryEffects()
        XCTAssertNil(effects.background)
        XCTAssertNil(effects.textStyle)
        XCTAssertNil(effects.textColor)
        XCTAssertNil(effects.filter)
        XCTAssertNil(effects.stickers)
        XCTAssertNil(effects.stickerObjects)
        XCTAssertNil(effects.backgroundAudioId)
        XCTAssertNil(effects.opening)
        XCTAssertNil(effects.closing)
        XCTAssertTrue(effects.textObjects.isEmpty)
        XCTAssertNil(effects.slideDuration)
    }

    func testStoryEffectsToJSONWithBackgroundAndTextStyle() {
        let effects = StoryEffects(
            background: "#FF0000", textStyle: "bold", textColor: "FFFFFF",
            stickers: ["star", "heart"]
        )
        let dict = effects.toJSON()
        XCTAssertEqual(dict["background"] as? String, "#FF0000")
        XCTAssertEqual(dict["textStyle"] as? String, "bold")
        XCTAssertEqual(dict["textColor"] as? String, "FFFFFF")
        XCTAssertEqual(dict["stickers"] as? [String], ["star", "heart"])
    }

    func testStoryEffectsCodableRoundtrip() throws {
        let sticker = StorySticker(id: "s1", emoji: "star", x: 0.3, y: 0.4, scale: 1.5, rotation: 45)
        let original = StoryEffects(
            background: "#000000", textStyle: "neon", textColor: "00FF00",
            filter: "vintage", stickerObjects: [sticker],
            opening: .fade, closing: .zoom
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: data)
        XCTAssertEqual(decoded.background, "#000000")
        XCTAssertEqual(decoded.textStyle, "neon")
        XCTAssertEqual(decoded.textColor, "00FF00")
        XCTAssertEqual(decoded.filter, "vintage")
        XCTAssertEqual(decoded.stickerObjects?.count, 1)
        XCTAssertEqual(decoded.stickerObjects?.first?.emoji, "star")
        XCTAssertEqual(decoded.opening, .fade)
        XCTAssertEqual(decoded.closing, .zoom)
    }

    func testStoryEffectsParsedTextStyle() {
        let withStyle = StoryEffects(textStyle: "typewriter")
        XCTAssertEqual(withStyle.parsedTextStyle, .typewriter)

        let withNil = StoryEffects()
        XCTAssertNil(withNil.parsedTextStyle)

        let withInvalid = StoryEffects(textStyle: "unknown")
        XCTAssertNil(withInvalid.parsedTextStyle)
    }

    func testStoryEffectsParsedFilter() {
        let withFilter = StoryEffects(filter: "bw")
        XCTAssertEqual(withFilter.parsedFilter, .bw)

        let withNil = StoryEffects()
        XCTAssertNil(withNil.parsedFilter)
    }

    // MARK: - StorySlide

    func testStorySlideInitDefaults() {
        let slide = StorySlide()
        XCTAssertNil(slide.mediaURL)
        XCTAssertNil(slide.mediaData)
        XCTAssertNil(slide.content)
        XCTAssertEqual(slide.duration, 6)
        XCTAssertEqual(slide.order, 0)
    }

    func testStorySlideCodableRoundtripExcludesMediaData() throws {
        let slide = StorySlide(
            id: "slide1", mediaURL: "https://example.com/img.jpg",
            mediaData: Data([0x01, 0x02, 0x03]),
            content: "Hello", duration: 10, order: 2
        )
        let data = try JSONEncoder().encode(slide)
        let decoded = try JSONDecoder().decode(StorySlide.self, from: data)
        XCTAssertEqual(decoded.id, "slide1")
        XCTAssertEqual(decoded.mediaURL, "https://example.com/img.jpg")
        XCTAssertNil(decoded.mediaData)
        XCTAssertEqual(decoded.content, "Hello")
        XCTAssertEqual(decoded.duration, 10)
        XCTAssertEqual(decoded.order, 2)
    }

    func testStorySlideDecodesWithMissingOptionalFields() throws {
        let json = """
        {"id": "s2"}
        """.data(using: .utf8)!
        let slide = try JSONDecoder().decode(StorySlide.self, from: json)
        XCTAssertEqual(slide.id, "s2")
        XCTAssertNil(slide.mediaURL)
        XCTAssertNil(slide.content)
        XCTAssertEqual(slide.duration, 6)
        XCTAssertEqual(slide.order, 0)
    }

    // MARK: - StoryTextObject

    func testStoryTextObjectInit() {
        let text = StoryTextObject(id: "t1", text: "Hello World")
        XCTAssertEqual(text.id, "t1")
        XCTAssertEqual(text.text, "Hello World")
        XCTAssertEqual(text.x, 0.5)
        XCTAssertEqual(text.y, 0.5)
        XCTAssertEqual(text.scale, 1.0)
        XCTAssertEqual(text.rotation, 0)
        XCTAssertEqual(text.textStyle, "bold")
        XCTAssertEqual(text.textColor, "FFFFFF")
        // New texts default to 96 design pixels (~35pt rendu) for legibility.
        // The legacy 64.0 default only applies to the Codable fallback path
        // for stories written before fontSize was promoted — see
        // testStoryTextObjectInit_legacyFallback for that case.
        XCTAssertEqual(text.fontSize, 96.0)
        XCTAssertEqual(text.textAlign, "center")
        XCTAssertNil(text.textBg)
    }

    func testStoryTextObjectHasBg() {
        let withBg = StoryTextObject(text: "X", textBg: "000000")
        XCTAssertTrue(withBg.hasBg)

        let withoutBg = StoryTextObject(text: "Y", textBg: nil)
        XCTAssertFalse(withoutBg.hasBg)
    }

    func testStoryTextObjectParsedTextStyle() {
        let bold = StoryTextObject(text: "A", textStyle: "bold")
        XCTAssertEqual(bold.parsedTextStyle, .bold)

        let neon = StoryTextObject(text: "B", textStyle: "neon")
        XCTAssertEqual(neon.parsedTextStyle, .neon)

        let unknown = StoryTextObject(text: "C", textStyle: "nonexistent")
        XCTAssertEqual(unknown.parsedTextStyle, .bold)

        let nilStyle = StoryTextObject(text: "D", textStyle: nil)
        XCTAssertEqual(nilStyle.parsedTextStyle, .bold)
    }

    func testStoryTextObjectResolvedSize() {
        let withSize = StoryTextObject(text: "A", fontSize: 42)
        XCTAssertEqual(withSize.resolvedSize, 42)

        let withoutSize = StoryTextObject(text: "B")
        // Default fontSize bumped to 96 (see testStoryTextObjectInit).
        XCTAssertEqual(withoutSize.resolvedSize, 96.0)
    }

    // MARK: - StoryTextObject isLocked (Patch B.3)

    func test_StoryTextObject_decodes_isLocked() throws {
        let json = """
        {"id": "t1", "content": "Reposté de @alice", "x": 0.5, "y": 0.92,
         "scale": 1, "rotation": 0, "textStyle": "bold", "textColor": "FFFFFF",
         "textSize": 14, "textAlign": "center", "textBg": "6366F1",
         "isLocked": true, "zIndex": 1000}
        """.data(using: .utf8)!
        let obj = try JSONDecoder().decode(StoryTextObject.self, from: json)
        XCTAssertEqual(obj.isLocked, true)
    }

    func test_StoryTextObject_isLocked_optional_defaults_nil() throws {
        let json = """
        {"id": "t1", "content": "hello", "x": 0.5, "y": 0.5,
         "scale": 1, "rotation": 0}
        """.data(using: .utf8)!
        let obj = try JSONDecoder().decode(StoryTextObject.self, from: json)
        XCTAssertNil(obj.isLocked)
    }

    func test_StoryTextObject_encodes_isLocked() throws {
        var obj = StoryTextObject(text: "x")
        obj.isLocked = true
        let data = try JSONEncoder().encode(obj)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(dict["isLocked"] as? Bool, true)
    }

    // MARK: - StorySticker

    func testStoryStickerInit() {
        let sticker = StorySticker(id: "st1", emoji: "fire", x: 0.2, y: 0.8, scale: 2.0, rotation: 15)
        XCTAssertEqual(sticker.id, "st1")
        XCTAssertEqual(sticker.emoji, "fire")
        XCTAssertEqual(sticker.x, 0.2)
        XCTAssertEqual(sticker.y, 0.8)
        XCTAssertEqual(sticker.scale, 2.0)
        XCTAssertEqual(sticker.rotation, 15)
    }

    func testStoryStickerCodableRoundtrip() throws {
        let original = StorySticker(id: "st2", emoji: "heart", x: 0.5, y: 0.5, scale: 1.0, rotation: 0)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StorySticker.self, from: data)
        XCTAssertEqual(decoded.id, "st2")
        XCTAssertEqual(decoded.emoji, "heart")
        XCTAssertEqual(decoded.x, 0.5)
        XCTAssertEqual(decoded.y, 0.5)
        XCTAssertEqual(decoded.scale, 1.0)
        XCTAssertEqual(decoded.rotation, 0)
    }

    func testStoryStickerDefaults() {
        let sticker = StorySticker(emoji: "sun")
        XCTAssertEqual(sticker.x, 0.5)
        XCTAssertEqual(sticker.y, 0.5)
        XCTAssertEqual(sticker.scale, 1.0)
        XCTAssertEqual(sticker.rotation, 0)
    }

    // MARK: - StoryBackgroundTransform

    func testBackgroundTransformInitDefaults() {
        let bt = StoryBackgroundTransform()
        XCTAssertNil(bt.scale)
        XCTAssertNil(bt.offsetX)
        XCTAssertNil(bt.offsetY)
        XCTAssertNil(bt.rotation)
        XCTAssertTrue(bt.isIdentity)
    }

    func testBackgroundTransformIsIdentity() {
        let identity = StoryBackgroundTransform(scale: 1.0, offsetX: 0, offsetY: 0, rotation: 0)
        XCTAssertTrue(identity.isIdentity)

        let nonIdentity = StoryBackgroundTransform(scale: 1.5, offsetX: 10, offsetY: -5, rotation: 45)
        XCTAssertFalse(nonIdentity.isIdentity)
    }

    func testBackgroundTransformCodableRoundtrip() throws {
        let original = StoryBackgroundTransform(scale: 2.0, offsetX: 15.5, offsetY: -30, rotation: 90)
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(StoryBackgroundTransform.self, from: data)
        XCTAssertEqual(decoded.scale, 2.0)
        XCTAssertEqual(decoded.offsetX, 15.5)
        XCTAssertEqual(decoded.offsetY, -30)
        XCTAssertEqual(decoded.rotation, 90)
    }

    func testBackgroundTransformDecodesWithMissingFields() throws {
        let json = "{}".data(using: .utf8)!
        let bt = try JSONDecoder().decode(StoryBackgroundTransform.self, from: json)
        XCTAssertNil(bt.scale)
        XCTAssertNil(bt.offsetX)
        XCTAssertNil(bt.offsetY)
        XCTAssertNil(bt.rotation)
    }

    func testStoryEffectsWithBackgroundTransformRoundtrip() throws {
        let bt = StoryBackgroundTransform(scale: 1.5, offsetX: 20, offsetY: -10, rotation: 30)
        let effects = StoryEffects(background: "FF0000", backgroundTransform: bt)
        let data = try JSONEncoder().encode(effects)
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: data)
        XCTAssertNotNil(decoded.backgroundTransform)
        XCTAssertEqual(decoded.backgroundTransform?.scale, 1.5)
        XCTAssertEqual(decoded.backgroundTransform?.offsetX, 20)
        XCTAssertEqual(decoded.backgroundTransform?.offsetY, -10)
        XCTAssertEqual(decoded.backgroundTransform?.rotation, 30)
    }

    func testStoryEffectsWithNilBackgroundTransformRoundtrip() throws {
        let effects = StoryEffects(background: "000000")
        let data = try JSONEncoder().encode(effects)
        let decoded = try JSONDecoder().decode(StoryEffects.self, from: data)
        XCTAssertNil(decoded.backgroundTransform)
    }

    func testStoryEffectsInitIncludesBackgroundTransform() {
        let effects = StoryEffects()
        XCTAssertNil(effects.backgroundTransform)
    }

    // MARK: - StoryItem (Patch B.2) — originalRepostOfId / visibility / audioUrl

    private func makeAPIPost(
        id: String = "story-1",
        type: String = "STORY",
        visibility: String? = "PUBLIC",
        audioUrl: String? = nil,
        repostOfId: String? = nil,
        originalRepostOfId: String? = nil,
        repostMedia: [APIPostMedia]? = nil
    ) -> APIPost {
        let author = APIAuthor(id: "author-1", username: "alice", displayName: "Alice", avatar: nil)
        let repostOf: APIRepostOf? = repostOfId.map { rid in
            APIRepostOf(
                id: rid, type: "STORY", content: nil, originalLanguage: nil, translations: nil,
                storyEffects: nil, audioUrl: nil, moodEmoji: nil, originalRepostOfId: nil,
                author: author, media: repostMedia, createdAt: Date(), likeCount: nil,
                commentCount: nil, isQuote: nil
            )
        }
        return APIPost(
            id: id, type: type, visibility: visibility, content: "Hello",
            originalLanguage: "en", createdAt: Date(), updatedAt: nil, expiresAt: nil,
            author: author, likeCount: 0, commentCount: 0, repostCount: 0,
            viewCount: 0, postOpenCount: nil, qualifiedViewCount: nil, playCount: nil, bookmarkCount: 0, shareCount: 0, reactionSummary: nil,
            isPinned: false, isEdited: false, media: nil, comments: nil,
            repostOf: repostOf, originalRepostOfId: originalRepostOfId, isQuote: false,
            moodEmoji: nil, audioUrl: audioUrl, audioDuration: nil, storyEffects: nil,
            translations: nil, isLikedByMe: nil, isBookmarkedByMe: nil, isRepostedByMe: nil,
            isViewedByMe: nil, currentUserReactions: nil, mentionedUsers: nil, viaUsername: nil
        )
    }

    private func makeStoryItem(
        id: String = "story-x",
        visibility: String? = nil
    ) -> StoryItem {
        StoryItem(
            id: id,
            content: "Hello",
            media: [],
            storyEffects: nil,
            createdAt: Date(),
            expiresAt: nil,
            visibility: visibility,
            isViewed: false
        )
    }

    func test_StoryItem_carries_originalRepostOfId_visibility_audioUrl() {
        let post = makeAPIPost(
            id: "story-1",
            type: "STORY",
            visibility: "PUBLIC",
            audioUrl: "/api/v1/attachments/file/audio.mp3",
            repostOfId: "intermediate-1",
            originalRepostOfId: "root-1"
        )
        let groups = [post].toStoryGroups()
        let firstStory = groups.first?.stories.first
        XCTAssertEqual(firstStory?.originalRepostOfId, "root-1")
        XCTAssertEqual(firstStory?.visibility, "PUBLIC")
        XCTAssertEqual(firstStory?.audioUrl, "/api/v1/attachments/file/audio.mp3")
    }

    func test_repostedStory_inheritsMedia_fromRepostOf_forViewerPlayback() throws {
        // A reposted story's own `media` is empty — the playable media lives on
        // `repostOf`. The full-screen viewer renders from `StoryItem.media`, so
        // `toStoryGroups` must inherit it from `repostOf` (otherwise the viewer
        // shows a blank spinner while the feed embed plays fine). Regression guard
        // for the 2026-06-26 report « la republication ne joue pas la story ».
        let mediaJSON = """
        [{"id": "m1", "mimeType": "video/mp4", "fileUrl": "https://cdn.meeshy/story.mp4"}]
        """.data(using: .utf8)!
        let repostMedia = try JSONDecoder().decode([APIPostMedia].self, from: mediaJSON)
        let post = makeAPIPost(id: "repost-1", type: "STORY", repostOfId: "orig-1", repostMedia: repostMedia)

        let story = [post].toStoryGroups().first?.stories.first
        XCTAssertEqual(
            story?.media.first?.url, "https://cdn.meeshy/story.mp4",
            "Reposted story must inherit the original's media from repostOf so the full-screen viewer plays it")
    }

    func test_StoryItem_publicVisibility_isCurrentStoryIsPublic() {
        let publicStory = makeStoryItem(visibility: "PUBLIC")
        let privateStory = makeStoryItem(visibility: "PRIVATE")
        let unknownStory = makeStoryItem(visibility: nil)

        XCTAssertTrue(publicStory.isPublic)
        XCTAssertFalse(privateStory.isPublic)
        XCTAssertFalse(unknownStory.isPublic, "Unknown visibility must default to non-public to be safe")
    }

    // MARK: - StoryTextObject defaults

    func test_StoryTextObject_init_defaultFontSizeIs96() {
        let text = StoryTextObject(text: "hello")
        XCTAssertEqual(text.fontSize, 96.0,
                       "New texts must default to fontSize 96 (~35pt rendu) for legibility")
    }

    func test_StoryTextObject_decoder_legacyWithoutFontSize_fallsBackTo64() throws {
        let json = #"{"id":"t1","text":"legacy"}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryTextObject.self, from: json)
        XCTAssertEqual(decoded.fontSize, 64.0,
                       "Legacy stories without fontSize must keep the legacy 64 default for back-compat")
    }

    // MARK: - StoryMediaObject thumbHash

    func test_StoryMediaObject_setThumbHash_clampsOverLimit() {
        var media = StoryMediaObject(aspectRatio: 1.0)
        let huge = String(repeating: "A", count: StoryMediaObject.maxThumbHashLength + 1)
        media.thumbHash = huge
        XCTAssertNil(media.thumbHash,
                     "thumbHash > maxThumbHashLength must be rejected via didSet (defense-in-depth)")
    }

    func test_StoryMediaObject_setThumbHash_acceptsValidLength() {
        var media = StoryMediaObject(aspectRatio: 1.0)
        let valid = "ABCDEFGH"  // 8 chars — typical thumbHash size
        media.thumbHash = valid
        XCTAssertEqual(media.thumbHash, valid)
    }

    func test_StoryMediaObject_decoder_rejectsHugeThumbHash() throws {
        let huge = String(repeating: "A", count: StoryMediaObject.maxThumbHashLength + 1)
        let payload = #"{"id":"m1","mediaType":"image","aspectRatio":1.0,"thumbHash":"\#(huge)"}"#
        let json = payload.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: json)
        XCTAssertNil(decoded.thumbHash,
                     "Decoder must clamp oversized thumbHash to nil — guard against malicious payloads")
    }

    func test_StoryMediaObject_decoder_acceptsValidThumbHash() throws {
        let json = #"{"id":"m1","mediaType":"image","aspectRatio":1.0,"thumbHash":"ABC123"}"#.data(using: .utf8)!
        let decoded = try JSONDecoder().decode(StoryMediaObject.self, from: json)
        XCTAssertEqual(decoded.thumbHash, "ABC123")
    }
}
