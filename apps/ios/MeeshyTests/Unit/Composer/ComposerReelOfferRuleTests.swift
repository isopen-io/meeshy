import XCTest
import MeeshySDK
@testable import Meeshy

/// **« Publier en réel ? »** (#8603) — la capsule Publier d'un POST dont le
/// seul média est UNE vidéo ouvre le choix « C'est un Réel / C'est un Post ».
/// Ces témoins éprouvent ce que le meuble remet à la règle du SDK : les médias
/// comptés sur TOUTES les surfaces (un média ponté compté une fois), et les
/// portes où la question n'a pas lieu d'être.
final class ComposerReelOfferRuleTests: XCTestCase {

    private typealias Rule = ComposerReelOfferRule

    private let video = ComposerDocumentMedia(url: URL(fileURLWithPath: "/tmp/clip.mov"),
                                              mimeType: "video/quicktime", durationMs: 12_000)
    private let photo = ComposerDocumentMedia(url: URL(fileURLWithPath: "/tmp/photo.jpg"),
                                              mimeType: "image/jpeg", durationMs: nil)

    private func entries(reelChoosable: Bool = true) -> [ComposerPublishMenuRule.Entry] {
        [
            ComposerPublishMenuRule.Entry(format: .post, isChoosable: true, reason: nil, layouts: []),
            ComposerPublishMenuRule.Entry(format: .story, isChoosable: true, reason: nil, layouts: []),
            ComposerPublishMenuRule.Entry(format: .reel, isChoosable: reelChoosable,
                                          reason: reelChoosable ? nil : "—", layouts: []),
        ]
    }

    private func offers(format: ComposerFormat = .post,
                        layout: MosaicLayoutMode? = nil,
                        entries: [ComposerPublishMenuRule.Entry]? = nil,
                        origin: ComposerOrigin = .feedComposer,
                        chosen: Bool = false,
                        media: [ComposerDocumentMedia]) -> Bool {
        Rule.offers(choice: ComposerPublishChoice(format: format, layout: layout),
                    menuEntries: entries ?? self.entries(),
                    origin: origin,
                    formatChosenByAuthor: chosen,
                    media: Rule.composedMedia(documentMedia: media, bridgedSources: [],
                                              slides: [], slideImageIds: []))
    }

    private func videoSlide(id: String = "s1") -> StorySlide {
        var effects = StoryEffects()
        var objet = StoryMediaObject(id: "obj-\(id)", mediaURL: "file:///tmp/clip.mov", kind: .video, aspectRatio: 9.0 / 16.0)
        objet.intrinsicDuration = 12
        effects.mediaObjects = [objet]
        return StorySlide(id: id, effects: effects)
    }

    // MARK: - Le seul cas qui pose la question

    func test_offers_postWithSingleVideo_asksReel() {
        XCTAssertTrue(offers(media: [video]))
    }

    func test_composedMedia_bridgedDocumentVideo_countsOnceThroughTheScene() {
        let media = Rule.composedMedia(documentMedia: [video], bridgedSources: [video.url],
                                       slides: [videoSlide()], slideImageIds: [])
        XCTAssertEqual(media.count, 1, "Un média du document PONTÉ sur la scène ne se compte qu'une fois.")
        XCTAssertTrue(Rule.offers(choice: ComposerPublishChoice(format: .post, layout: nil),
                                  menuEntries: entries(), origin: .feedComposer,
                                  formatChosenByAuthor: false, media: media))
    }

    // MARK: - Aucun modal hors de ce cas

    func test_offers_severalMedia_doesNotAsk() {
        XCTAssertFalse(offers(media: [video, photo]))
        let deuxScenes = Rule.composedMedia(documentMedia: [], bridgedSources: [],
                                            slides: [videoSlide(id: "a"), videoSlide(id: "b")], slideImageIds: [])
        XCTAssertEqual(deuxScenes.count, 2)
    }

    func test_offers_videoWithSlideBackgroundImage_doesNotAsk() {
        let media = Rule.composedMedia(documentMedia: [], bridgedSources: [],
                                       slides: [videoSlide(id: "a")], slideImageIds: ["a"])
        XCTAssertEqual(media.count, 2, "L'image de fond d'une slide est un média.")
    }

    func test_offers_photoOrTextOnly_doesNotAsk() {
        XCTAssertFalse(offers(media: [photo]))
        XCTAssertFalse(offers(media: []))
    }

    func test_offers_documentFile_countsAsMedia() {
        let pdf = ComposerDocumentMedia(url: URL(fileURLWithPath: "/tmp/a.pdf"), mimeType: "application/pdf", durationMs: nil)
        XCTAssertFalse(offers(media: [video, pdf]))
    }

    func test_offers_storyOrReel_doesNotAsk() {
        XCTAssertFalse(offers(format: .story, media: [video]))
        XCTAssertFalse(offers(format: .reel, media: [video]))
    }

    func test_offers_repostOrEdit_doesNotAsk() {
        XCTAssertFalse(offers(origin: .repost(ofPostId: "p1", sourceFormat: .post), media: [video]))
        XCTAssertFalse(offers(origin: .edit(postId: "p1", documentFormat: .post), media: [video]))
    }

    func test_offers_formatArmedByAuthor_doesNotAsk() {
        XCTAssertFalse(offers(chosen: true, media: [video]))
    }

    func test_offers_withLayout_doesNotAsk() {
        XCTAssertFalse(offers(layout: ComposerMosaicChoice.ordered.first, media: [video]))
    }

    func test_offers_reelNotChoosableOrNoMenu_doesNotAsk() {
        XCTAssertFalse(offers(entries: entries(reelChoosable: false), media: [video]))
        XCTAssertFalse(Rule.offers(choice: ComposerPublishChoice(format: .post, layout: nil), menuEntries: nil,
                                   origin: .feedComposer, formatChosenByAuthor: false,
                                   media: Rule.composedMedia(documentMedia: [video], bridgedSources: [],
                                                             slides: [], slideImageIds: [])))
    }

    func test_offers_tooShortVideo_doesNotAsk() {
        let court = ComposerDocumentMedia(url: URL(fileURLWithPath: "/tmp/c.mov"), mimeType: "video/mp4", durationMs: 1_500)
        XCTAssertFalse(offers(media: [court]))
    }
}
