import Foundation
import Testing
@testable import MeeshySDK

/// Une photo qui ne tient pas dans son cadre se déplace et se zoome (#18805) :
/// la loi du cadrage (elle COUVRE toujours le cadre), ses gestes, et ce que la
/// mise en page en fait.
struct MessageCardFramingTests {

    private static let frame = MessageCardFrame(x: 100, y: 200, width: 400, height: 400)

    private static func measure(_ text: String, _ font: MessageCardFont) -> Double { Double(text.count) * font.size * 0.5 }

    private static func layout(_ media: [MessageCardMedia], framings: [String: MessageCardFraming] = [:],
                               disposition: MessageCardDisposition = .standard) -> MessageCardLayout {
        var input = MessageCardInput(quoted: nil, reply: MessageCardPart(author: "Awa", text: "Voilà !"), template: MessageCardTemplates.defaultID,
                                     handle: "awa", media: media, disposition: disposition)
        input.framings = framings
        return MessageCardLayout.make(input, measure: measure)
    }

    private static func mediaOps(_ layout: MessageCardLayout) -> [MessageCardMediaOp] {
        (layout.backdrop + layout.ops).compactMap { if case let .media(op) = $0 { return op } else { return nil } }
    }

    private static func covers(_ drawn: MessageCardFrame, _ frame: MessageCardFrame) -> Bool {
        let tolerance = 1e-9
        return drawn.x <= frame.x + tolerance && drawn.y <= frame.y + tolerance
            && drawn.x + drawn.width >= frame.x + frame.width - tolerance
            && drawn.y + drawn.height >= frame.y + frame.height - tolerance
    }

    // MARK: - La loi du cadrage

    @Test func theDefaultFramingIsExactlyTheCenteredCover() {
        for (width, height) in [(1600.0, 900.0), (900.0, 1600.0), (1000.0, 1000.0), (333.0, 777.0)] {
            let centered = MessageCardFraming.centered.drawn(pixelWidth: width, pixelHeight: height, in: Self.frame)
            #expect(centered == MessageCardMediaFit.cover.drawn(pixelWidth: width, pixelHeight: height, in: Self.frame))
        }
        #expect(MessageCardFraming.centered.isCentered)
    }

    @Test func theZoomStaysWithinItsRange() {
        #expect(MessageCardFraming(zoom: 0.2).zoom == MessageCardFraming.zoomRange.lowerBound)
        #expect(MessageCardFraming(zoom: 40).zoom == MessageCardFraming.zoomRange.upperBound)
        #expect(MessageCardFraming(zoom: .nan).zoom == 1)
        #expect(MessageCardFraming(focusX: -3, focusY: 9) == MessageCardFraming(focusX: 0, focusY: 1))
    }

    @Test func aFramedPhotoAlwaysCoversItsFrame() {
        let extremes = [MessageCardFraming(zoom: 1, focusX: 0, focusY: 0), MessageCardFraming(zoom: 1, focusX: 1, focusY: 1),
                        MessageCardFraming(zoom: 4, focusX: 0, focusY: 1), MessageCardFraming(zoom: 2.5, focusX: 1, focusY: 0)]
        for framing in extremes {
            for (width, height) in [(1600.0, 900.0), (900.0, 1600.0)] {
                #expect(Self.covers(framing.drawn(pixelWidth: width, pixelHeight: height, in: Self.frame), Self.frame))
            }
        }
    }

    @Test func zoomingEnlargesThePhotoAroundTheChosenPoint() {
        let doubled = MessageCardFraming(zoom: 2).drawn(pixelWidth: 1000, pixelHeight: 1000, in: Self.frame)
        #expect(doubled.width == 800 && doubled.height == 800)
        #expect(doubled.x == -100 && doubled.y == 0, "centré : le milieu de la photo reste au milieu du cadre")
    }

    @Test func aFocusAtTheEdgeShowsThatEdgeOfThePhoto() {
        let left = MessageCardFraming(focusX: 0).drawn(pixelWidth: 1600, pixelHeight: 800, in: Self.frame)
        #expect(left.x == Self.frame.x, "le bord gauche de la photo vient au bord gauche du cadre")
        let right = MessageCardFraming(focusX: 1).drawn(pixelWidth: 1600, pixelHeight: 800, in: Self.frame)
        #expect(right.x + right.width == Self.frame.x + Self.frame.width)
    }

    // MARK: - Glisser

    @Test func draggingMovesThePhotoWithTheFinger() {
        let move = MessageCardFraming.centered.panned(dx: 100, dy: 0, pixelWidth: 1600, pixelHeight: 800, in: Self.frame)
        let before = MessageCardFraming.centered.drawn(pixelWidth: 1600, pixelHeight: 800, in: Self.frame)
        let after = move.framing.drawn(pixelWidth: 1600, pixelHeight: 800, in: Self.frame)
        #expect(abs(after.x - (before.x + 100)) < 1e-9)
        #expect(after.y == before.y)
        #expect(!move.hitEdge)
    }

    @Test func draggingStopsAtThePhotoEdge_andSaysSo() {
        let move = MessageCardFraming.centered.panned(dx: 5000, dy: 0, pixelWidth: 1600, pixelHeight: 800, in: Self.frame)
        let drawn = move.framing.drawn(pixelWidth: 1600, pixelHeight: 800, in: Self.frame)
        #expect(drawn.x == Self.frame.x)
        #expect(move.hitEdge)
        #expect(Self.covers(drawn, Self.frame))
    }

    @Test func draggingAlongAnAxisWithoutOverflowChangesNothing() {
        let move = MessageCardFraming.centered.panned(dx: 0, dy: 120, pixelWidth: 1600, pixelHeight: 800, in: Self.frame)
        #expect(move.framing == .centered)
        #expect(move.hitEdge, "la photo ne déborde pas en hauteur : le geste bute")
    }

    // MARK: - Pincer

    @Test func pinchingZoomsAroundTheCenterOfTheFrame() {
        let move = MessageCardFraming.centered.zoomed(by: 2, pixelWidth: 1000, pixelHeight: 1000, in: Self.frame)
        #expect(move.framing.zoom == 2)
        #expect(move.framing.focusX == 0.5 && move.framing.focusY == 0.5)
        #expect(!move.hitEdge)
    }

    @Test func pinchingKeepsTheShownPointUnderTheCenter() {
        let start = MessageCardFraming.centered
            .zoomed(by: 2, pixelWidth: 1000, pixelHeight: 1000, in: Self.frame).framing
            .panned(dx: 150, dy: -100, pixelWidth: 1000, pixelHeight: 1000, in: Self.frame).framing
        let zoomed = start.zoomed(by: 1.5, pixelWidth: 1000, pixelHeight: 1000, in: Self.frame).framing
        #expect(abs(zoomed.focusX - start.focusX) < 1e-9 && abs(zoomed.focusY - start.focusY) < 1e-9)
        #expect(zoomed.zoom == 3)
    }

    @Test func pinchingStopsAtTheZoomBounds_andSaysSo() {
        let out = MessageCardFraming.centered.zoomed(by: 0.5, pixelWidth: 1000, pixelHeight: 1000, in: Self.frame)
        #expect(out.framing.zoom == 1 && out.hitEdge)
        let deep = MessageCardFraming(zoom: 3).zoomed(by: 10, pixelWidth: 1000, pixelHeight: 1000, in: Self.frame)
        #expect(deep.framing.zoom == MessageCardFraming.zoomRange.upperBound && deep.hitEdge)
    }

    @Test func zoomingOutPullsAnEdgeFocusBackSoThePhotoStillCovers() {
        let edge = MessageCardFraming(zoom: 3, focusX: 0.95, focusY: 0.05)
        let out = edge.zoomed(by: 1 / 3, pixelWidth: 1000, pixelHeight: 1000, in: Self.frame).framing
        #expect(out.zoom == 1 && out.focusX == 0.5 && out.focusY == 0.5)
    }

    @Test func theKeyNamesTheFraming() {
        #expect(MessageCardFraming.centered.key != MessageCardFraming(zoom: 2).key)
        #expect(MessageCardFraming(zoom: 2).key == MessageCardFraming(zoom: 2).key)
    }

    // MARK: - La mise en page

    @Test func aPhotoCarriesItsFramingToThePainter() throws {
        let photo = MessageCardMedia(id: "p", kind: .image, aspect: 1.5)
        let framing = MessageCardFraming(zoom: 2, focusX: 0.3, focusY: 0.6)
        let op = try #require(Self.mediaOps(Self.layout([photo], framings: ["p": framing])).first)
        #expect(op.framing == framing)
        #expect(op.fit == .cover)
        let plain = try #require(Self.mediaOps(Self.layout([photo])).first)
        #expect(plain.framing == .centered)
    }

    @Test func aStickerIsNeverFramed() throws {
        let sticker = MessageCardMedia(id: "s", kind: .image, aspect: 1, isSticker: true)
        let op = try #require(Self.mediaOps(Self.layout([sticker], framings: ["s": MessageCardFraming(zoom: 3)])).first)
        #expect(op.framing == .centered && op.fit == .contain)
        #expect(Self.layout([sticker]).framedMedia.isEmpty)
    }

    @Test func theCardNamesTheFramesThatCanBeFramed() throws {
        let photo = MessageCardMedia(id: "p", kind: .image, aspect: 1.5)
        let layout = Self.layout([photo])
        let framed = try #require(layout.framedMedia.first)
        let op = try #require(Self.mediaOps(layout).first)
        #expect(framed.mediaID == "p" && framed.kind == .image && !framed.isBackdrop)
        #expect(framed.frame == MessageCardFrame(x: op.x, y: op.y, width: op.width, height: op.height))
        #expect(framed.radius == op.radius)
    }

    @Test func aChosenBackdropIsFramedToo() throws {
        let media = MessageCardMedia(id: MessageCardBackdrop.mediaID, kind: .image, aspect: 0.5)
        var input = MessageCardInput(quoted: nil, reply: MessageCardPart(author: "Awa", text: "Voilà !"), template: MessageCardTemplates.defaultID, handle: "awa")
        input.backdrop = MessageCardBackdrop(media: media, veil: 0.4)
        input.framings = [MessageCardBackdrop.mediaID: MessageCardFraming(zoom: 2)]
        let layout = MessageCardLayout.make(input, measure: Self.measure)
        let op = try #require(Self.mediaOps(layout).first)
        #expect(op.framing == MessageCardFraming(zoom: 2))
        #expect(layout.framedMedia.contains { $0.mediaID == MessageCardBackdrop.mediaID && $0.isBackdrop })
    }

    // MARK: - Toutes les entrées d'Imager (#18810)

    @Test func aVideoIsFramedLikeAPhoto_itsPosterAndEveryFrameShareTheFraming() throws {
        let video = MessageCardMedia(id: "v", kind: .video, aspect: 16.0 / 9.0)
        let layout = Self.layout([video], framings: ["v": MessageCardFraming(zoom: 2)])
        let framed = try #require(layout.framedMedia.first)
        #expect(framed.mediaID == "v" && framed.kind == .video && !framed.isBackdrop)
        #expect(try #require(Self.mediaOps(layout).first).framing == MessageCardFraming(zoom: 2))
    }

    @Test func theHeroOfAPostOrAStoryIsFramed() throws {
        let story = MessageCardMedia(id: "story:1", kind: .video, aspect: 9.0 / 16.0)
        var disposition = MessageCardDisposition.standard
        disposition.heroMediaID = story.id
        let layout = Self.layout([story], disposition: disposition)
        let framed = try #require(layout.framedMedia.first { $0.mediaID == story.id })
        #expect(framed.rotation == 0)
        #expect(layout.regions.contains { $0.part == .media && $0.y == framed.frame.y && $0.height == framed.frame.height })
    }

    @Test func aTiltedCardStillNamesItsFramedMedia_withTheTiltAndItsPivot() throws {
        let photo = MessageCardMedia(id: "p", kind: .image, aspect: 1.5)
        var disposition = MessageCardDisposition.standard
        disposition.tilt = .left
        let layout = Self.layout([photo], disposition: disposition)
        let framed = try #require(layout.framedMedia.first { $0.mediaID == "p" })
        guard case let .group(group) = try #require(layout.ops.first { if case .group = $0 { return true } else { return false } }) else {
            Issue.record("la carte inclinée peint son contenu dans un groupe")
            return
        }
        #expect(framed.rotation == MessageCardTilt.left.radians)
        #expect(framed.pivotX == group.cx && framed.pivotY == group.cy)
        #expect(Self.layout([photo]).framedMedia.first?.rotation == 0)
    }

    @Test func aSoundHasNoPictureToFrame_onlyItsChosenBackdrop() throws {
        let voice = MessageCardMedia(id: "a", kind: .audio, aspect: 1)
        #expect(Self.layout([voice]).framedMedia.isEmpty)
        var input = MessageCardInput(quoted: nil, reply: MessageCardPart(author: "Awa", text: ""), template: MessageCardTemplates.defaultID,
                                     handle: "awa", media: [voice])
        input.backdrop = MessageCardBackdrop(media: MessageCardMedia(id: MessageCardBackdrop.mediaID, kind: .image, aspect: 0.75), veil: 0.4)
        let framed = MessageCardLayout.make(input, measure: Self.measure).framedMedia
        #expect(framed.map(\.mediaID) == [MessageCardBackdrop.mediaID])
        #expect(framed.allSatisfy { $0.isBackdrop })
    }

    @Test func aFramedInputSurvivesAMomentAClipAndTheScroll() {
        var input = MessageCardInput(quoted: nil, reply: MessageCardPart(author: "Awa", text: "Voilà !"), template: MessageCardTemplates.defaultID, handle: "awa")
        input.framings = ["p": MessageCardFraming(zoom: 2)]
        #expect(input.at(time: 2).framings == input.framings)
        #expect(input.clipped(to: MessageCardClip(start: 0, duration: 3)).framings == input.framings)
        #expect(input.unboundedCard().framings == input.framings)
    }
}
