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
        XCTAssertEqual(
            CallMontageStyle.allCases.map(\.rawValue),
            ["screen", "cover", "gold", "redcarpet", "grid", "strip", "polaroid", "magazine", "film", "neon", "noir", "comic", "heart"]
        )
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

    func test_screen_alone_isAScreenInsideA3PercentBezel_withConcentricCorners() throws {
        let slot = try XCTUnwrap(slots(.screen, 1).first)
        let bezel = bounds.width * 0.03
        XCTAssertEqual(slot.shape, .roundedRectangle)
        XCTAssertEqual(slot.frame, bounds.insetBy(dx: bezel, dy: bezel), "un bord d'appareil de 3 % de la largeur, sur les quatre côtés")
        XCTAssertEqual(slot.cornerRadius + bezel, bounds.width * 0.115, accuracy: 0.01,
                       "le coin de l'écran est concentrique à celui du boîtier")
    }

    func test_screenSolo_statusBandSitsAtTheTopOfTheScreen() {
        let solo = CallMontageSoloLayout.screen(in: bounds)
        XCTAssertEqual(solo.statusBand.minY, solo.screen.minY, accuracy: 0.01)
        XCTAssertEqual(solo.statusBand.minX, solo.screen.minX, accuracy: 0.01)
        XCTAssertEqual(solo.statusBand.width, solo.screen.width, accuracy: 0.01)
        XCTAssertGreaterThan(solo.statusBand.height, 0)
        XCTAssertLessThan(solo.statusBand.height, solo.screen.height * 0.06)
        XCTAssertGreaterThanOrEqual(solo.reflection.count, 3, "le reflet est un polygone")
        XCTAssertTrue(solo.reflection.allSatisfy { solo.screen.insetBy(dx: -0.5, dy: -0.5).contains($0) },
                      "le reflet ne déborde pas de l'écran")
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

    func test_gridSolo_cutsThePhotoIn3x5Tiles_separatedBy0006uJoints() {
        let solo = CallMontageSoloLayout.mosaic(in: bounds)
        XCTAssertEqual(solo.columns, 3)
        XCTAssertEqual(solo.rows, 5)
        XCTAssertEqual(solo.tiles.count, 15)
        XCTAssertEqual(solo.joint, bounds.width * 0.006, accuracy: 0.0001)
        XCTAssertFalse(overlaps(solo.tiles))
        XCTAssertTrue(solo.tiles.allSatisfy { solo.slot.insetBy(dx: -0.01, dy: -0.01).contains($0) })
        XCTAssertEqual(solo.tiles[1].minX - solo.tiles[0].maxX, solo.joint, accuracy: 0.001, "un joint entre deux carreaux d'une rangée")
        XCTAssertEqual(solo.tiles[3].minY - solo.tiles[0].maxY, solo.joint, accuracy: 0.001, "un joint entre deux rangées")
        let carreaux = solo.tiles.reduce(0) { $0 + $1.width * $1.height }
        let joints = solo.joint * solo.slot.height * 2 + solo.joint * solo.slot.width * 4 - solo.joint * solo.joint * 8
        XCTAssertEqual(carreaux, solo.slot.width * solo.slot.height - joints, accuracy: 1,
                       "l'union des carreaux est la case moins ses joints")
        XCTAssertGreaterThan(solo.band.height, solo.joint * 4, "la bande basse porte la signature")
        XCTAssertEqual(solo.band.minY, solo.slot.maxY, accuracy: 0.01)
        XCTAssertEqual(solo.band.maxY, bounds.maxY, accuracy: 0.01)
    }

    func test_gridSolo_followsTheSlotInTheSingleFrame() throws {
        let slot = try XCTUnwrap(slots(.grid, 1).first)
        XCTAssertEqual(slot.frame, CallMontageSoloLayout.mosaic(in: bounds).slot)
    }

    func test_gridSolo_landscapeSwapsTheTiling() {
        let paysage = CallMontageSoloLayout.mosaic(in: CGRect(x: 0, y: 0, width: 1920, height: 1080))
        XCTAssertEqual([paysage.columns, paysage.rows], [5, 3])
        let carre = CallMontageSoloLayout.mosaic(in: CGRect(x: 0, y: 0, width: 1080, height: 1080))
        XCTAssertEqual([carre.columns, carre.rows], [4, 4])
        XCTAssertEqual(CallMontageSoloLayout.mosaic(in: CGRect(x: 0, y: 0, width: 1080, height: 1350)).tiles.count, 16,
                       "un 4:5 est assez près du carré")
    }

    func test_gridSolo_tintsAreDeterministic_andNeighboursDiffer() {
        for (columns, rows) in [(3, 5), (5, 3), (4, 4)] {
            for row in 0 ..< rows {
                for column in 0 ..< columns {
                    XCTAssertEqual(CallMontageSoloLayout.tint(row: row, column: column), CallMontageSoloLayout.tint(row: row, column: column))
                    if column + 1 < columns {
                        XCTAssertNotEqual(CallMontageSoloLayout.tint(row: row, column: column), CallMontageSoloLayout.tint(row: row, column: column + 1))
                    }
                    if row + 1 < rows {
                        XCTAssertNotEqual(CallMontageSoloLayout.tint(row: row, column: column), CallMontageSoloLayout.tint(row: row + 1, column: column))
                    }
                }
            }
        }
        XCTAssertTrue(CallMontageSoloLayout.Tint.allCases.allSatisfy { $0.alpha >= 0 && $0.alpha <= 0.08 })
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

    // MARK: - Glamour (#8580)

    func test_glamour_neverOverlaps_forEveryGroupSize() {
        for style in [CallMontageStyle.cover, .gold, .redcarpet, .film, .neon, .noir] {
            for count in 1 ... CallMontageLayout.maxParticipants {
                XCTAssertFalse(overlaps(slots(style, count).map(\.frame)), "\(style) × \(count)")
            }
        }
    }

    func test_glamour_titlesNeverCoverAFace() {
        for style in [CallMontageStyle.cover, .gold, .redcarpet, .neon, .noir] {
            guard let band = CallMontageLayout.captionBand(style: style, canvas: canvas) else { return XCTFail("\(style) needs its title") }
            for count in 1 ... CallMontageLayout.maxParticipants {
                XCTAssertTrue(slots(style, count).allSatisfy { !$0.frame.intersects(band) }, "\(style) × \(count)")
            }
        }
    }

    func test_cover_heroLeadsAndTheOthersAreMedallions() {
        let cover = slots(.cover, 5)
        XCTAssertTrue(cover.dropFirst().allSatisfy { $0.shape == .circle && abs($0.frame.width - $0.frame.height) < 0.001 })
        XCTAssertTrue(cover.dropFirst().allSatisfy { $0.frame.width < cover[0].frame.width / 3 })
        XCTAssertTrue(cover.dropFirst().allSatisfy { $0.frame.minY > cover[0].frame.maxY })
    }

    func test_cover_alone_heroFillsThePageUnderTheMasthead() {
        let hero = slots(.cover, 1)[0].frame
        XCTAssertGreaterThan(hero.height, bounds.height * 0.7)
        XCTAssertEqual(hero.midX, bounds.midX, accuracy: 0.001)
    }

    func test_gold_portraitsAreCameoOvals() {
        let cameos = slots(.gold, 4)
        XCTAssertTrue(cameos.allSatisfy { $0.shape == .circle })
        XCTAssertTrue(cameos.allSatisfy { abs($0.frame.height / $0.frame.width - CallMontageLayout.goldCameoAspect) < 0.001 })
    }

    func test_redcarpet_smallGroup_standsInOneLine() {
        let line = slots(.redcarpet, 4)
        XCTAssertEqual(Set(line.map { Int($0.frame.minY.rounded()) }).count, 1)
        XCTAssertEqual(line.map(\.frame.minX), line.map(\.frame.minX).sorted())
        XCTAssertTrue(line.allSatisfy { $0.frame.height > $0.frame.width })
    }

    func test_film_framesAreLandscapeInsideTheirStrip() {
        for count in [1, 4, 7, 12] {
            let strips = CallMontageLayout.filmStrips(count: count, canvas: canvas)
            let frames = slots(.film, count).map(\.frame)
            XCTAssertTrue(frames.allSatisfy { abs($0.height / $0.width - CallMontageLayout.filmFrameAspect) < 0.001 }, "\(count)")
            XCTAssertTrue(frames.allSatisfy { frame in strips.contains { $0.contains(frame) } }, "\(count)")
        }
    }

    func test_filmStrips_bigGroup_runsTwoStrips() {
        XCTAssertEqual(CallMontageLayout.filmStrips(count: 3, canvas: canvas).count, 1)
        XCTAssertEqual(CallMontageLayout.filmStrips(count: 8, canvas: canvas).count, 2)
        XCTAssertTrue(CallMontageLayout.filmStrips(count: 0, canvas: canvas).isEmpty)
    }

    func test_render_everyStyle_drawsTheWholeCanvas() {
        let portraits = ["Ana", "Bo", "Céline"].map { CallMontagePortrait(id: $0, name: $0, image: nil) }
        let caption = CallMontageCaption(title: "Meeshy", subtitle: "28 sept.")
        let size = CGSize(width: 216, height: 384)
        for style in CallMontageStyle.allCases {
            let image = CallMontageRenderer.render(style: style, portraits: portraits, canvas: size, caption: caption)
            XCTAssertEqual(image?.width, 216, "\(style)")
            XCTAssertEqual(image?.height, 384, "\(style)")
        }
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
