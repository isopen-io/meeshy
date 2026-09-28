import CoreGraphics
import XCTest
@testable import Meeshy

@MainActor
final class CallMontageLayoutTests: XCTestCase {

    private let canvas = CallMontageLayout.captureSize
    private var bounds: CGRect { CGRect(origin: .zero, size: canvas) }

    private func slots(_ style: CallMontageStyle, _ count: Int) -> [CallMontageSlot] {
        CallMontageLayout.frames(style: style, count: count, canvas: canvas)
    }

    private func dimensions(_ count: Int) -> [Int] {
        let grid = CallMontageLayout.gridDimensions(count: count)
        return [grid.columns, grid.rows]
    }

    private func overlaps(_ frames: [CGRect]) -> Bool {
        frames.enumerated().contains { index, frame in
            frames.dropFirst(index + 1).contains { $0.insetBy(dx: 0.5, dy: 0.5).intersects(frame.insetBy(dx: 0.5, dy: 0.5)) }
        }
    }

    // MARK: - Catalogue

    func test_styles_followTheSharedDesignOrder() {
        XCTAssertEqual(CallMontageStyle.allCases.map(\.rawValue), ["screen", "grid", "strip", "polaroid", "magazine", "comic", "heart"])
    }

    func test_captureSize_isFullHDPortrait() {
        XCTAssertEqual(CallMontageLayout.captureSize, CGSize(width: 1080, height: 1920))
        XCTAssertEqual(CallMontageLayout.faceSide, 1080)
    }

    // MARK: - Every style

    func test_frames_noParticipant_isEmpty() {
        XCTAssertTrue(CallMontageStyle.allCases.allSatisfy { slots($0, 0).isEmpty })
    }

    func test_frames_emptyCanvas_isEmpty() {
        XCTAssertTrue(CallMontageLayout.frames(style: .grid, count: 3, canvas: .zero).isEmpty)
    }

    func test_frames_oneSlotPerParticipant_forEveryStyleAndCount() {
        for style in CallMontageStyle.allCases {
            for count in 1 ... CallMontageLayout.maxParticipants {
                XCTAssertEqual(slots(style, count).count, count, "\(style) × \(count)")
            }
        }
    }

    func test_frames_tooManyParticipants_isCapped() {
        XCTAssertEqual(slots(.grid, 40).count, CallMontageLayout.maxParticipants)
    }

    func test_frames_stayOnTheCanvas() {
        for style in CallMontageStyle.allCases {
            for count in 1 ... CallMontageLayout.maxParticipants {
                for slot in slots(style, count) {
                    XCTAssertTrue(bounds.insetBy(dx: -0.5, dy: -0.5).contains(slot.frame), "\(style) × \(count): \(slot.frame)")
                    XCTAssertGreaterThan(slot.frame.width, 0)
                    XCTAssertGreaterThan(slot.frame.height, 0)
                }
            }
        }
    }

    func test_frames_scaleWithTheCanvas() {
        let small = CGSize(width: 108, height: 192)
        for style in CallMontageStyle.allCases {
            let big = CallMontageLayout.frames(style: style, count: 3, canvas: canvas).map(\.frame)
            let thumb = CallMontageLayout.frames(style: style, count: 3, canvas: small).map(\.frame)
            zip(big, thumb).forEach { large, tiny in
                XCTAssertEqual(tiny.minX * 10, large.minX, accuracy: 0.01, "\(style)")
                XCTAssertEqual(tiny.width * 10, large.width, accuracy: 0.01, "\(style)")
            }
        }
    }

    // MARK: - Plein écran

    func test_screen_alone_fillsTheCanvas() {
        XCTAssertEqual(slots(.screen, 1).map(\.frame), [bounds])
    }

    func test_screen_duo_remoteFullAndSelfAsPictureInPicture() {
        let duo = slots(.screen, 2)
        XCTAssertEqual(duo[0].frame, bounds)
        XCTAssertEqual(duo[1].shape, .roundedRectangle)
        XCTAssertLessThan(duo[1].frame.width, bounds.width / 3)
        XCTAssertGreaterThan(duo[1].frame.midX, bounds.midX)
        XCTAssertGreaterThan(duo[1].frame.midY, bounds.midY)
        XCTAssertEqual(duo[1].frame.height / duo[1].frame.width, 16 / 9, accuracy: 0.001)
    }

    func test_screen_group_tilesWithoutOverlap() {
        XCTAssertFalse(overlaps(slots(.screen, 5).map(\.frame)))
    }

    // MARK: - Mosaïque

    func test_grid_neverOverlapsAndCentresTheLastRow() {
        for count in 1 ... CallMontageLayout.maxParticipants {
            XCTAssertFalse(overlaps(slots(.grid, count).map(\.frame)), "\(count)")
        }
        let five = slots(.grid, 5).map(\.frame)
        XCTAssertEqual(five[4].midX, bounds.midX, accuracy: 0.5)
    }

    func test_gridDimensions_growWithTheGroup() {
        XCTAssertEqual(dimensions(1), [1, 1])
        XCTAssertEqual(dimensions(2), [1, 2])
        XCTAssertEqual(dimensions(4), [2, 2])
        XCTAssertEqual(dimensions(6), [2, 3])
        XCTAssertEqual(dimensions(9), [3, 3])
        XCTAssertEqual(dimensions(11), [3, 4])
    }

    // MARK: - Photomaton

    func test_strip_framesAreLandscapeAndStackedTopToBottom() {
        let frames = slots(.strip, 4).map(\.frame)
        XCTAssertTrue(frames.allSatisfy { abs($0.height / $0.width - 0.75) < 0.001 })
        XCTAssertEqual(frames.map(\.minY), frames.map(\.minY).sorted())
        XCTAssertFalse(overlaps(frames))
    }

    func test_strip_leavesTheFooterForTheCaption() {
        guard let band = CallMontageLayout.captionBand(style: .strip, canvas: canvas) else { return XCTFail("strip needs a caption band") }
        XCTAssertTrue(slots(.strip, 4).allSatisfy { $0.frame.maxY <= band.minY })
    }

    func test_strip_bigGroup_usesTwoColumns() {
        let frames = slots(.strip, 6).map(\.frame)
        XCTAssertEqual(Set(frames.map { Int($0.minX) }).count, 2)
    }

    // MARK: - Polaroïd

    func test_polaroid_photosAreSquareAndTilted() {
        let cards = slots(.polaroid, 4)
        XCTAssertTrue(cards.allSatisfy { abs($0.frame.width - $0.frame.height) < 0.001 })
        XCTAssertTrue(cards.allSatisfy { $0.rotation != 0 })
        XCTAssertNotEqual(cards[0].rotation.sign, cards[1].rotation.sign)
    }

    func test_polaroid_cardsStayOnTheCanvasAndApart() {
        for count in 1 ... CallMontageLayout.maxParticipants {
            let cards = slots(.polaroid, count).map { CallMontageLayout.polaroidCard(around: $0.frame) }
            XCTAssertTrue(cards.allSatisfy { bounds.contains($0) }, "\(count)")
            XCTAssertFalse(overlaps(cards), "\(count)")
        }
    }

    func test_polaroidCard_hasTheWideBottomBorder() {
        let photo = CGRect(x: 100, y: 100, width: 500, height: 500)
        let card = CallMontageLayout.polaroidCard(around: photo)
        XCTAssertTrue(card.contains(photo))
        XCTAssertGreaterThan(card.maxY - photo.maxY, (photo.minY - card.minY) * 2)
        XCTAssertEqual(card.midX, photo.midX, accuracy: 0.001)
    }

    // MARK: - Magazine

    func test_magazine_coverFillsTheCanvasAndOthersAreRoundInsets() {
        let cover = slots(.magazine, 4)
        XCTAssertEqual(cover[0].frame, bounds)
        XCTAssertTrue(cover.dropFirst().allSatisfy { $0.shape == .circle && $0.frame.width == $0.frame.height })
        XCTAssertFalse(overlaps(cover.dropFirst().map(\.frame)))
        XCTAssertTrue(cover.dropFirst().allSatisfy { $0.frame.minY > bounds.midY })
    }

    func test_magazine_mastheadSitsAtTheTop() {
        guard let band = CallMontageLayout.captionBand(style: .magazine, canvas: canvas) else { return XCTFail("magazine needs a masthead") }
        XCTAssertLessThan(band.maxY, canvas.height * 0.2)
    }

    // MARK: - BD

    func test_comic_threePanels_oneWideOnTopTwoBelow() {
        let panels = slots(.comic, 3).map(\.frame)
        XCTAssertGreaterThan(panels[0].width, panels[1].width * 1.9)
        XCTAssertEqual(panels[1].minY, panels[2].minY, accuracy: 0.001)
        XCTAssertGreaterThan(panels[1].minY, panels[0].maxY)
        XCTAssertFalse(overlaps(panels))
    }

    func test_comic_keepsAGutterAroundThePage() {
        XCTAssertTrue(slots(.comic, 4).allSatisfy { $0.frame.minX > 0 && $0.frame.maxX < bounds.maxX })
    }

    // MARK: - Cœur

    func test_heart_slotsAreSquareHearts() {
        for count in [1, 2, 5] {
            let hearts = slots(.heart, count)
            XCTAssertTrue(hearts.allSatisfy { $0.shape == .heart && abs($0.frame.width - $0.frame.height) < 0.001 }, "\(count)")
            XCTAssertFalse(overlaps(hearts.map(\.frame)), "\(count)")
        }
    }

    func test_heart_alone_isCentredAndLarge() {
        let heart = slots(.heart, 1)[0].frame
        XCTAssertEqual(heart.midX, bounds.midX, accuracy: 0.001)
        XCTAssertGreaterThan(heart.width, bounds.width * 0.8)
    }

    // MARK: - Recadrage d'un visage

    func test_pixelRect_flipsVisionCoordinatesToTopLeft() {
        let rect = CallFaceCrop.pixelRect(fromNormalized: CGRect(x: 0.25, y: 0.5, width: 0.5, height: 0.25), imageSize: CGSize(width: 400, height: 800))
        XCTAssertEqual(rect, CGRect(x: 100, y: 200, width: 200, height: 200))
    }

    func test_square_noFace_isTheCentredLargestSquare() {
        XCTAssertEqual(
            CallFaceCrop.square(around: nil, in: CGSize(width: 720, height: 1280), margin: 0.4),
            CGRect(x: 0, y: 280, width: 720, height: 720)
        )
    }

    func test_square_aroundAFace_addsTheMarginAndStaysSquare() {
        let face = CGRect(x: 300, y: 500, width: 200, height: 260)
        let crop = CallFaceCrop.square(around: face, in: CGSize(width: 1080, height: 1920), margin: 0.4)
        XCTAssertEqual(crop.width, crop.height)
        XCTAssertEqual(crop.width, 260 * 1.8, accuracy: 0.001)
        XCTAssertTrue(crop.contains(face))
    }

    func test_square_faceNearTheEdge_isClampedInsideTheImage() {
        let size = CGSize(width: 720, height: 1280)
        let crop = CallFaceCrop.square(around: CGRect(x: 650, y: 10, width: 60, height: 80), in: size, margin: 0.5)
        XCTAssertTrue(CGRect(origin: .zero, size: size).contains(crop))
    }

    func test_square_hugeFace_isCappedToTheImage() {
        let size = CGSize(width: 720, height: 1280)
        let crop = CallFaceCrop.square(around: CGRect(x: 0, y: 0, width: 700, height: 900), in: size, margin: 0.5)
        XCTAssertEqual(crop.width, 720)
        XCTAssertTrue(CGRect(origin: .zero, size: size).contains(crop))
    }
}
