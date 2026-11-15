import CoreGraphics
import XCTest
@testable import Meeshy

/// AUCUN TEXTE DU CADRE NE PASSE SOUS UN CONTRÔLE (#9777). En appel, le titre d'Aurore, de Gala,
/// de Fête, de Pop Art, de Crypte ou de Cœur de rose passait sous le chevron et la bulle de
/// conversation : la toile du cadre couvre l'écran, et sa réserve haute commençait à la marge du
/// cadre — sous la Dynamic Island et la rangée d'en-tête. Les bandes des contrôles sont désormais
/// RÉSERVÉES : les textes descendent sous la rangée d'en-tête et remontent au-dessus de la pilule.
final class CallFrameChromeReserveTests: XCTestCase {
    private let texts = CallFrameTexts(groupName: nil, isGroup: false, date: "9 oct. 2026", accentHex: nil)
    private let duo = [
        CallFramePerson(id: "a", name: "Windie Nh", handle: "windie", isSelf: true),
        CallFramePerson(id: "b", name: "J. Charles N. M.", handle: "jcharles", isSelf: false),
    ]
    /// L'iPhone 16 Pro Max de la recette (encarts 62 / 34) et l'iPhone 16 (59 / 34).
    private let screens: [(size: CGSize, top: CGFloat, bottom: CGFloat)] = [
        (CGSize(width: 440, height: 956), 62, 34),
        (CGSize(width: 393, height: 852), 59, 34),
    ]

    private func callReserve(_ screen: (size: CGSize, top: CGFloat, bottom: CGFloat)) -> CallFrameChromeReserve {
        CallLiveFrameRule.chromeReserve(viewHeight: screen.size.height, topInset: screen.top + 8, bottomInset: screen.bottom + 12)
    }

    private func textBoxes(_ frame: CallFrameDesign, size: CGSize, reserve: CallFrameChromeReserve) -> [CGRect] {
        let stage = CallFrameStage(frame: frame, people: duo, texts: texts, size: size, reserve: reserve)
        return CallFrameRenderer.textLayout(stage, fonts: CallFrameFontBook()).boxes
    }

    private func covered(_ box: CGRect, by bands: (top: CGRect, bottom: CGRect)) -> Bool {
        box.minY < bands.top.maxY - 0.5 || box.maxY > bands.bottom.minY + 0.5
    }

    func test_liveFrames_withoutAReserve_putATitleUnderTheCallHeader() throws {
        let screen = screens[0]
        let bands = callReserve(screen).bands(in: screen.size)
        let hidden = CallLiveFrameRule.frames().filter { frame in
            textBoxes(frame, size: screen.size, reserve: .none).contains { covered($0, by: bands) }
        }
        XCTAssertFalse(hidden.isEmpty, "le défaut de la recette : un texte de cadre sous la rangée d'en-tête ou la pilule")
        XCTAssertTrue(hidden.contains { $0.name == "Gala" }, "Gala, cité par la recette, garde son titre sous le chevron")
    }

    func test_liveFrames_withTheCallReserve_putNoTextUnderAControl() {
        for screen in screens {
            let reserve = callReserve(screen)
            let bands = reserve.bands(in: screen.size)
            CallLiveFrameRule.frames().forEach { frame in
                textBoxes(frame, size: screen.size, reserve: reserve).forEach { box in
                    XCTAssertFalse(covered(box, by: bands), "\(frame.id) à \(screen.size) : un texte en \(box) passe sous un contrôle")
                }
            }
        }
    }

    func test_liveFrames_withTheCallReserve_keepEveryFaceBetweenTheControls() {
        for screen in screens {
            let reserve = callReserve(screen)
            let bands = reserve.bands(in: screen.size)
            CallLiveFrameRule.frames().forEach { frame in
                let stage = CallFrameStage(frame: frame, people: duo, texts: texts, size: screen.size, reserve: reserve)
                stage.footprints.forEach { face in
                    XCTAssertFalse(covered(face, by: bands), "\(frame.id) à \(screen.size) : une case passe sous un contrôle")
                }
            }
        }
    }

    func test_areas_withoutAReserve_keepTheCanonicalGeometry() {
        let size = CGSize(width: 440, height: 956)
        CallFrameCatalogue.all.forEach { frame in
            XCTAssertEqual(CallFrameLayoutGeometry.areas(frame.look.layout, size: size, reserve: .none),
                           CallFrameLayoutGeometry.areas(frame.look.layout, size: size), frame.id)
        }
    }

    func test_areas_underHugeControls_neverShrinkTheFacesBelowHalf() {
        let size = CGSize(width: 956, height: 440)
        let reserve = CallFrameChromeReserve(top: 0.45, bottom: 0.45)
        CallFrameCatalogue.all.forEach { frame in
            let canonical = CallFrameLayoutGeometry.areas(frame.look.layout, size: size)
            let reserved = CallFrameLayoutGeometry.areas(frame.look.layout, size: size, reserve: reserve)
            XCTAssertGreaterThanOrEqual(reserved.content.height, canonical.content.height * CallFrameLayoutGeometry.reserveContentFloor - 0.5, frame.id)
            XCTAssertEqual(reserved.top.height, canonical.top.height, accuracy: 0.001, frame.id)
            XCTAssertEqual(reserved.bottom.height, canonical.bottom.height, accuracy: 0.001, frame.id)
        }
    }

    func test_covering_roundsUpSoTheReservedBandIsNeverShorterThanTheControl() {
        let reserve = CallFrameChromeReserve.covering(top: 122, bottom: 130, height: 956)
        let bands = reserve.bands(in: CGSize(width: 440, height: 956))
        XCTAssertGreaterThanOrEqual(bands.top.height, 122)
        XCTAssertGreaterThanOrEqual(bands.bottom.height, 130)
        XCTAssertEqual(CallFrameChromeReserve.covering(top: 10, bottom: 10, height: 0), CallFrameChromeReserve.none)
    }

    func test_layerInputs_aChangedReserve_repaintsTheFrame() {
        let current = CallLiveFrameLayerInputs(frameId: "a.b", people: duo, texts: texts, size: CGSize(width: 10, height: 20))
        let next = CallLiveFrameLayerInputs(frameId: "a.b", people: duo, texts: texts, size: current.size,
                                            reserve: CallFrameChromeReserve(top: 0.1, bottom: 0.1))
        XCTAssertTrue(CallLiveFrameRule.needsRepaint(current: current, next: next))
    }
}
