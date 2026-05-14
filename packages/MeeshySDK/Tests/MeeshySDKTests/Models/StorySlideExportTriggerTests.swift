import Testing
import Foundation
@testable import MeeshySDK

@Suite("StorySlide.needsVideoExport — Sprint 8 publish→exporter trigger")
struct StorySlideExportTriggerTests {

    // MARK: - Factories

    private func makeSlide(effects: StoryEffects = StoryEffects()) -> StorySlide {
        StorySlide(effects: effects)
    }

    private func makeText(keyframes: [StoryKeyframe]? = nil) -> StoryTextObject {
        StoryTextObject(text: "hello", keyframes: keyframes)
    }

    private func makeMedia(kind: StoryMediaKind,
                           keyframes: [StoryKeyframe]? = nil) -> StoryMediaObject {
        StoryMediaObject(kind: kind, aspectRatio: 1.0, keyframes: keyframes)
    }

    private func makeKeyframe() -> StoryKeyframe {
        StoryKeyframe(time: 0.5, scale: 1.2)
    }

    private func makeClipTransition() -> StoryClipTransition {
        StoryClipTransition(fromClipId: "a",
                            toClipId: "b",
                            kind: .crossfade,
                            duration: 0.4)
    }

    // MARK: - Negative cases (static slide — no export needed)

    @Test("empty effects → false (poster-image path)")
    func test_emptyEffects_returnsFalse() {
        let slide = makeSlide()
        #expect(slide.needsVideoExport == false)
    }

    @Test("text-only (no keyframes) → false")
    func test_textOnly_returnsFalse() {
        let slide = makeSlide(effects: StoryEffects(textObjects: [makeText()]))
        #expect(slide.needsVideoExport == false)
    }

    @Test("sticker-only → false")
    func test_stickerOnly_returnsFalse() {
        let sticker = StorySticker(emoji: "🎉")
        let slide = makeSlide(effects: StoryEffects(stickerObjects: [sticker]))
        #expect(slide.needsVideoExport == false)
    }

    @Test("image media only (no keyframes, no audio) → false")
    func test_imageMediaOnly_returnsFalse() {
        let media = makeMedia(kind: .image)
        let slide = makeSlide(effects: StoryEffects(mediaObjects: [media]))
        #expect(slide.needsVideoExport == false)
    }

    // MARK: - Positive cases (time-evolving — export required)

    @Test("video background media → true")
    func test_videoMedia_returnsTrue() {
        let video = makeMedia(kind: .video)
        let slide = makeSlide(effects: StoryEffects(mediaObjects: [video]))
        #expect(slide.needsVideoExport == true)
    }

    @Test("background audio id present → true")
    func test_backgroundAudio_returnsTrue() {
        let slide = makeSlide(effects: StoryEffects(backgroundAudioId: "audio-123"))
        #expect(slide.needsVideoExport == true)
    }

    @Test("voice attachment id present → true")
    func test_voiceAttachment_returnsTrue() {
        let slide = makeSlide(effects: StoryEffects(voiceAttachmentId: "voice-456"))
        #expect(slide.needsVideoExport == true)
    }

    @Test("text object with keyframes → true")
    func test_keyframes_returnsTrue() {
        let animatedText = makeText(keyframes: [makeKeyframe()])
        let slide = makeSlide(effects: StoryEffects(textObjects: [animatedText]))
        #expect(slide.needsVideoExport == true)
    }

    @Test("media object with keyframes → true")
    func test_mediaKeyframes_returnsTrue() {
        let animatedImage = makeMedia(kind: .image, keyframes: [makeKeyframe()])
        let slide = makeSlide(effects: StoryEffects(mediaObjects: [animatedImage]))
        #expect(slide.needsVideoExport == true)
    }

    @Test("clip transitions present → true")
    func test_clipTransitions_returnsTrue() {
        let slide = makeSlide(effects: StoryEffects(clipTransitions: [makeClipTransition()]))
        #expect(slide.needsVideoExport == true)
    }

    @Test("opening reveal/fade present → true")
    func test_opening_returnsTrue() {
        let slide = makeSlide(effects: StoryEffects(opening: .fade))
        #expect(slide.needsVideoExport == true)
    }
}
