import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **« Rogner » vit dans l'appui long** (#8370, lot 6 — directive porteur
/// 2026-09-27 : « faire apparaître les actions possibles au long press »). Le
/// rail des contrôleurs qui portait ce geste est parti ; sans ce menu, une
/// vidéo posée sur la scène ne se rognait plus que par son éditeur.
@MainActor
final class StoryCanvasTrimMenuTests: XCTestCase {

    private func canvas(video: Bool) -> StoryCanvasUIView {
        let media = StoryMediaObject(id: "m", kind: video ? .video : .image, aspectRatio: 1)
        let slide = StorySlide(id: "s", effects: StoryEffects(mediaObjects: [media]),
                               duration: 6, order: 0)
        let view = StoryCanvasUIView(slide: slide, mode: .edit)
        view.frame = CGRect(x: 0, y: 0, width: 412, height: 732)
        return view
    }

    private func titres(_ view: StoryCanvasUIView) -> [String] {
        view.contextMenu(for: "m", kind: .media).children.compactMap { ($0 as? UIAction)?.title }
    }

    func test_uneVideo_seRogneDepuisLAppuiLong_quandLHoteLeSait() {
        let vue = canvas(video: true)
        vue.onItemTrimRequested = { _, _ in }
        XCTAssertTrue(titres(vue).contains(StoryCanvasContextAction.trim.title))
    }

    func test_sansHoteCable_rognerNEstPasOffert() {
        XCTAssertFalse(titres(canvas(video: true)).contains(StoryCanvasContextAction.trim.title),
                       "Une action sans destinataire n'est pas offerte (loi 4).")
    }

    func test_uneImage_nOffreJamaisRogner() {
        let vue = canvas(video: false)
        vue.onItemTrimRequested = { _, _ in }
        XCTAssertFalse(titres(vue).contains(StoryCanvasContextAction.trim.title),
                       "Une image n'a pas de source à rogner.")
    }

    func test_rogner_estRemisALHote() {
        let vue = canvas(video: true)
        var recu: String?
        vue.onItemTrimRequested = { id, _ in recu = id }
        let action = vue.contextMenu(for: "m", kind: .media).children
            .compactMap { $0 as? UIAction }
            .first { $0.title == StoryCanvasContextAction.trim.title }
        XCTAssertNotNil(action)
        vue.performContextAction(.trim, on: "m", kind: .media)
        XCTAssertEqual(recu, "m")
    }
}
