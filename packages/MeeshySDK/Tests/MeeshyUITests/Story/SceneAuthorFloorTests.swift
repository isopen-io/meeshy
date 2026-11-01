import XCTest
import SwiftUI
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Une scène publiée sans `background` se lit sur le dégradé de son auteur,
/// jamais sur du noir (#14258, parité Android #14223) : la story, la carte de
/// post, la fiche et le plein écran donnent leur couleur d'auteur au lecteur,
/// qui la peint en diagonale vers le noir.
@MainActor
final class SceneAuthorFloorTests: XCTestCase {

    func test_aSceneWithoutBackground_readsOnTheAuthorGradient() {
        let slide = StoryReaderRepresentable(story: Self.story(), sceneFloorHex: "EA580C").renderableSlide

        XCTAssertEqual(slide.effects.background, "gradient:EA580C:000000")
        XCTAssertTrue(Self.isAuthorGradient(StoryRenderer.renderBackground(slide: slide, languages: []),
                                            red: 0xEA, green: 0x58, blue: 0x0C))
    }

    func test_withoutAnAuthorColour_theSceneKeepsTheBlackFloor() {
        let slide = StoryReaderRepresentable(story: Self.story()).renderableSlide

        XCTAssertNil(slide.effects.background)
        guard case .solidColor = StoryRenderer.renderBackground(slide: slide, languages: []) else {
            return XCTFail("Un réel et un aperçu ne donnent aucune couleur d'auteur : leur sol reste noir.")
        }
    }

    func test_aChosenBackground_isNeverReplaced() {
        var effects = StoryEffects()
        effects.background = "gradient:FF2E63:08D9D6"
        let slide = StoryReaderRepresentable(story: Self.story(effects: effects), sceneFloorHex: "EA580C").renderableSlide

        XCTAssertEqual(slide.effects.background, "gradient:FF2E63:08D9D6")
    }

    func test_theScenePlayer_handsItsAuthorColourToTheCanvas() {
        let player = MeeshyScenePlayer(document: CanvasV3(scenes: [Self.textScene()]),
                                       mode: .reader,
                                       sceneIndex: .constant(0),
                                       isPlaying: .constant(false),
                                       accentColorHex: "#7C3AED",
                                       sceneFloorHex: "EA580C")

        XCTAssertEqual(player.host.renderableSlide.effects.background, "gradient:EA580C:000000",
                       "La couleur de l'hôte (accentColorHex) teinte la chrome ; le sol est celui de l'AUTEUR.")
    }

    private static func story(effects: StoryEffects? = nil) -> StoryItem {
        StoryItem(id: "story-14200", content: nil, media: [], storyEffects: effects,
                  createdAt: Date(timeIntervalSince1970: 1_700_000_000))
    }

    private static func textScene() -> SceneV3 {
        SceneV3(id: "s1", objects: [
            ObjectV3(id: "t1", kind: .text,
                     anchor: .free(x: 0.5, y: 0.5), plane: .fg, z: 1,
                     transform: TransformV3(), locale: "fr",
                     payload: ["text": .string("Recette 14200 texte du post")]),
        ])
    }

    private static func isAuthorGradient(_ kind: StoryBackgroundLayer.Kind,
                                         red: Int, green: Int, blue: Int) -> Bool {
        guard case .gradient(let colors, let direction) = kind, colors.count == 2,
              direction == .topLeftToBottomRight else { return false }
        return components(colors[0]) == [red, green, blue] && components(colors[1]) == [0, 0, 0]
    }

    private static func components(_ color: UIColor) -> [Int] {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        return [r, g, b].map { Int(($0 * 255).rounded()) }
    }
}
