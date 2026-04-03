import XCTest
@testable import MeeshySDK

final class StoryModelsTests: XCTestCase {

    // MARK: - StoryTextStyle

    func testStoryTextStyleAllCases() {
        let cases = StoryTextStyle.allCases
        XCTAssertEqual(cases.count, 5)
        XCTAssertTrue(cases.contains(.bold))
        XCTAssertTrue(cases.contains(.neon))
        XCTAssertTrue(cases.contains(.typewriter))
        XCTAssertTrue(cases.contains(.handwriting))
        XCTAssertTrue(cases.contains(.classic))
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
        XCTAssertEqual(cases.count, 5)
        XCTAssertTrue(cases.contains(.vintage))
        XCTAssertTrue(cases.contains(.bw))
        XCTAssertTrue(cases.contains(.warm))
        XCTAssertTrue(cases.contains(.cool))
        XCTAssertTrue(cases.contains(.dramatic))
    }

    func testStoryFilterDisplayNames() {
        XCTAssertEqual(StoryFilter.vintage.displayName, "Vintage")
        XCTAssertEqual(StoryFilter.bw.displayName, "N&B")
        XCTAssertEqual(StoryFilter.warm.displayName, "Warm")
        XCTAssertEqual(StoryFilter.cool.displayName, "Cool")
        XCTAssertEqual(StoryFilter.dramatic.displayName, "Dramatic")
    }

    func testStoryFilterCIFilterNames() {
        XCTAssertEqual(StoryFilter.vintage.ciFilterName, "CIPhotoEffectTransfer")
        XCTAssertEqual(StoryFilter.bw.ciFilterName, "CIPhotoEffectNoir")
        XCTAssertEqual(StoryFilter.warm.ciFilterName, "CIColorControls")
        XCTAssertEqual(StoryFilter.cool.ciFilterName, "CIColorControls")
        XCTAssertEqual(StoryFilter.dramatic.ciFilterName, "CIPhotoEffectProcess")
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
        XCTAssertEqual(cases.count, 3)
        XCTAssertTrue(cases.contains(.post))
        XCTAssertTrue(cases.contains(.story))
        XCTAssertTrue(cases.contains(.status))
    }

    func testPostTypeRawValues() {
        XCTAssertEqual(PostType.post.rawValue, "POST")
        XCTAssertEqual(PostType.story.rawValue, "STORY")
        XCTAssertEqual(PostType.status.rawValue, "STATUS")
    }

    func testPostTypeDisplayNames() {
        XCTAssertEqual(PostType.post.displayName, "Post")
        XCTAssertEqual(PostType.story.displayName, "Story")
        XCTAssertEqual(PostType.status.displayName, "Status")
    }

    func testPostTypeIcons() {
        XCTAssertEqual(PostType.post.icon, "square.and.pencil")
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
        XCTAssertNil(effects.textObjects)
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
        XCTAssertEqual(slide.duration, 5)
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
        XCTAssertEqual(slide.duration, 5)
        XCTAssertEqual(slide.order, 0)
    }

    // MARK: - StoryTextObject

    func testStoryTextObjectInit() {
        let text = StoryTextObject(id: "t1", content: "Hello World")
        XCTAssertEqual(text.id, "t1")
        XCTAssertEqual(text.content, "Hello World")
        XCTAssertEqual(text.x, 0.5)
        XCTAssertEqual(text.y, 0.5)
        XCTAssertEqual(text.scale, 1.0)
        XCTAssertEqual(text.rotation, 0)
        XCTAssertEqual(text.textStyle, "bold")
        XCTAssertEqual(text.textColor, "FFFFFF")
        XCTAssertEqual(text.textSize, 28)
        XCTAssertEqual(text.textAlign, "center")
        XCTAssertNil(text.textBg)
    }

    func testStoryTextObjectHasBg() {
        let withBg = StoryTextObject(content: "X", textBg: "000000")
        XCTAssertTrue(withBg.hasBg)

        let withoutBg = StoryTextObject(content: "Y", textBg: nil)
        XCTAssertFalse(withoutBg.hasBg)
    }

    func testStoryTextObjectParsedTextStyle() {
        let bold = StoryTextObject(content: "A", textStyle: "bold")
        XCTAssertEqual(bold.parsedTextStyle, .bold)

        let neon = StoryTextObject(content: "B", textStyle: "neon")
        XCTAssertEqual(neon.parsedTextStyle, .neon)

        let unknown = StoryTextObject(content: "C", textStyle: "nonexistent")
        XCTAssertEqual(unknown.parsedTextStyle, .bold)

        let nilStyle = StoryTextObject(content: "D", textStyle: nil)
        XCTAssertEqual(nilStyle.parsedTextStyle, .bold)
    }

    func testStoryTextObjectResolvedSize() {
        let withSize = StoryTextObject(content: "A", textSize: 42)
        XCTAssertEqual(withSize.resolvedSize, 42)

        let withoutSize = StoryTextObject(content: "B", textSize: nil)
        XCTAssertEqual(withoutSize.resolvedSize, 28)
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
}
