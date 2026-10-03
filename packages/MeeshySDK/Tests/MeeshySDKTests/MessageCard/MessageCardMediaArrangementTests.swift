import Foundation
import Testing
@testable import MeeshySDK

/// « Imagine » (#9235) — OÙ se posent les médias (au-dessus, en dessous, à
/// gauche, à droite, en fond), COMMENT ils s'agencent (une seule choisie, la
/// grille, les dispositions des posts), et QUI les a postés.
struct MessageCardMediaArrangementTests {

    private static func measure(_ text: String, _ font: MessageCardFont) -> Double { Double(text.count) * font.size * 0.5 }

    private static func photo(_ id: String, aspect: Double = 1, credit: String? = nil) -> MessageCardMedia {
        MessageCardMedia(id: id, kind: .image, aspect: aspect, credit: credit)
    }

    private static let clip = MessageCardMedia(id: "v1", kind: .video, aspect: 16.0 / 9.0, duration: 10)
    private static let voice = MessageCardMedia(id: "a1", kind: .audio, duration: 30)

    private static func input(
        reply: String = "Chez Lina, à 20 h !",
        media: [MessageCardMedia],
        disposition: MessageCardDisposition
    ) -> MessageCardInput {
        MessageCardInput(quoted: nil, reply: MessageCardPart(author: "Jacques", text: reply), template: MessageCardTemplates.defaultID,
                         handle: "jacques", media: media, disposition: disposition)
    }

    private static func layout(_ input: MessageCardInput) -> MessageCardLayout { MessageCardLayout.make(input, measure: measure) }

    private static func flat(_ ops: [MessageCardOp]) -> [MessageCardOp] {
        ops.flatMap { op -> [MessageCardOp] in
            if case let .group(group) = op { return flat(group.ops) }
            return [op]
        }
    }

    private static func texts(_ ops: [MessageCardOp]) -> [MessageCardTextOp] {
        flat(ops).compactMap { if case let .text(text) = $0 { return text } else { return nil } }
    }

    private static func media(_ ops: [MessageCardOp]) -> [MessageCardMediaOp] {
        flat(ops).compactMap { if case let .media(media) = $0 { return media } else { return nil } }
    }

    private static let three = [photo("p1", credit: "Awa"), photo("p2", credit: "Jacques"), photo("p3", credit: "Awa")]

    // MARK: - Ce que la carte peint

    @Test func painted_aSingleImageIsTheChosenOne_andAnUnknownChoiceFallsBackToTheFirst() {
        let chosen = MessageCardDisposition(mediaArrangement: .single, featuredMediaID: "p2")
        #expect(chosen.paintedVisuals(of: Self.three).map(\.id) == ["p2"])
        let unknown = MessageCardDisposition(mediaArrangement: .single, featuredMediaID: "gone")
        #expect(unknown.paintedVisuals(of: Self.three).map(\.id) == ["p1"])
        let backdrop = MessageCardDisposition(mediaLayout: .backdrop, mediaArrangement: .wave, featuredMediaID: "p3")
        #expect(backdrop.paintedVisuals(of: Self.three).map(\.id) == ["p3"])
    }

    @Test func painted_gridsAndPostLayoutsShowTheFirstFour_andTheSoundStays() {
        let six = (1...6).map { Self.photo("p\($0)") }
        for arrangement in [MessageCardMediaArrangement.mosaic, .wave, .hero, .sine] {
            let disposition = MessageCardDisposition(mediaArrangement: arrangement)
            #expect(disposition.paintedVisuals(of: six).map(\.id) == ["p1", "p2", "p3", "p4"], "\(arrangement)")
        }
        #expect(MessageCardDisposition(mediaArrangement: .single).paintedMedia(of: Self.three + [Self.voice]).map(\.id) == ["p1", "a1"])
    }

    @Test func painted_theOutputsFollowWhatTheCardShows() {
        let media = [Self.photo("p1"), Self.clip]
        let photoOnly = MessageCardDisposition(mediaArrangement: .single, featuredMediaID: "p1").paintedMedia(of: media)
        #expect(MessageCardOutput.offered(for: photoOnly.map(\.kind)) == [.image])
        #expect(MessageCardMotionPlan.of(.gif, media: photoOnly) == nil)
        let video = MessageCardDisposition(mediaArrangement: .single, featuredMediaID: "v1").paintedMedia(of: media)
        #expect(MessageCardOutput.offered(for: video.map(\.kind)) == [.image, .gif, .video])
    }

    // MARK: - Où

    @Test func beside_left_theMediaTakeAColumnAndTheReplyNarrowsBesideIt() throws {
        let card = Self.layout(Self.input(media: [Self.photo("p1")], disposition: MessageCardDisposition(mediaLayout: .left)))
        let picture = try #require(Self.media(card.ops).first)
        let reply = try #require(Self.texts(card.ops).first { $0.text.hasPrefix("Chez") })
        #expect(picture.x == 96)
        #expect(reply.x >= picture.x + picture.width + MessageCardMediaPlan.besideGap)
        let regions = Dictionary(card.regions.map { ($0.part, $0) }, uniquingKeysWith: { first, _ in first })
        #expect(regions[.media]?.y == regions[.reply]?.y)
    }

    @Test func beside_right_theColumnHugsTheRightEdge_andNoReplyLineCrossesIt() throws {
        let long = String(repeating: "mot ", count: 60)
        let card = Self.layout(Self.input(reply: long, media: [Self.photo("p1")], disposition: MessageCardDisposition(mediaLayout: .right)))
        let picture = try #require(Self.media(card.ops).first)
        #expect(abs(picture.x + picture.width - (1080 - 96)) <= 1)
        let lines = Self.texts(card.ops).filter { $0.text.hasPrefix("mot") }
        #expect(!lines.isEmpty)
        #expect(lines.allSatisfy { $0.x + Self.measure($0.text, $0.font) <= picture.x - MessageCardMediaPlan.besideGap + 1 })
    }

    @Test func beside_withoutAVisual_theSoundStaysAboveTheReply() {
        let card = Self.layout(Self.input(media: [Self.voice], disposition: MessageCardDisposition(mediaLayout: .left)))
        #expect(card.regions.map(\.part) == [.media, .reply])
        #expect(card.regions.first?.width == Double(1080 - 2 * 96))
    }

    // MARK: - Comment

    @Test func wave_tilesShareTheirWidth_andTheirHeightsUndulate() {
        let tiles = Self.media(Self.layout(Self.input(media: Self.three, disposition: MessageCardDisposition(mediaArrangement: .wave))).ops)
        #expect(tiles.map(\.mediaID) == ["p1", "p2", "p3"])
        #expect(Set(tiles.map(\.width)).count == 1)
        #expect(tiles[1].height < tiles[0].height && tiles[2].height == tiles[0].height)
    }

    @Test func hero_theFirstDominates_theOthersStackBesideIt() {
        let tiles = Self.media(Self.layout(Self.input(media: Self.three, disposition: MessageCardDisposition(mediaArrangement: .hero))).ops)
        #expect(tiles[0].width > tiles[1].width && tiles[1].x == tiles[2].x && tiles[2].y > tiles[1].y)
    }

    @Test func sine_tilesJumpFromTopToBottom() {
        let tiles = Self.media(Self.layout(Self.input(media: Self.three, disposition: MessageCardDisposition(mediaArrangement: .sine))).ops)
        #expect(tiles[1].y > tiles[0].y && tiles[2].y == tiles[0].y)
    }

    @Test func postLayouts_countWhatRemainsOnTheLastTile() {
        let six = (1...6).map { Self.photo("p\($0)") }
        for arrangement in [MessageCardMediaArrangement.wave, .hero, .sine, .mosaic] {
            let card = Self.layout(Self.input(media: six, disposition: MessageCardDisposition(mediaArrangement: arrangement)))
            #expect(Self.media(card.ops).count == 4, "\(arrangement)")
            #expect(Self.texts(card.ops).contains { $0.text == "+2" }, "\(arrangement)")
        }
    }

    @Test func arrangement_aColumnBesideTheReplyArrangesToo() {
        let tiles = Self.media(Self.layout(Self.input(media: Self.three, disposition: MessageCardDisposition(mediaLayout: .right, mediaArrangement: .mosaic))).ops)
        #expect(tiles.count == 3)
        #expect(tiles.allSatisfy { $0.x >= 1080 - 96 - MessageCardMediaPlan.besideWidth(textWidth: 1080 - 2 * 96, scale: 1) - 1 })
    }

    // MARK: - Qui

    @Test func credit_namesWhoPostedTheVisuals_onceEach_aboveThem() throws {
        let card = Self.layout(Self.input(media: Self.three, disposition: MessageCardDisposition(mediaArrangement: .mosaic, showsMediaAuthor: true)))
        let credit = try #require(Self.texts(card.ops).first { $0.text == "Awa · Jacques" })
        let first = try #require(Self.media(card.ops).first)
        #expect(credit.y < first.y)
    }

    @Test func credit_signsBelowThePicturesWhenNamesSignAtTheEnd() throws {
        let disposition = MessageCardDisposition(authorPlacement: .after, mediaArrangement: .single, featuredMediaID: "p2", showsMediaAuthor: true)
        let card = Self.layout(Self.input(media: Self.three, disposition: disposition))
        let credit = try #require(Self.texts(card.ops).first { $0.text == "— Jacques" })
        let picture = try #require(Self.media(card.ops).first)
        #expect(credit.y > picture.y + picture.height)
        #expect(credit.align == .right)
    }

    @Test func credit_neverOnABackdrop_andOnlyWhenAsked() {
        let backdrop = Self.layout(Self.input(media: Self.three, disposition: MessageCardDisposition(mediaLayout: .backdrop, showsMediaAuthor: true)))
        #expect(!Self.texts(backdrop.ops).contains { $0.text.contains("Awa") })
        let silent = Self.layout(Self.input(media: Self.three, disposition: MessageCardDisposition(mediaArrangement: .mosaic)))
        #expect(!Self.texts(silent.ops).contains { $0.text.contains("Awa") })
    }

    @Test func credit_followsTheNamesOfItsBlock_anonymityAndPseudo() {
        let subject = MessageCardSubject(
            quoted: MessageCardPart(author: "Awa Diallo", text: "Question ?", handle: "awa"),
            reply: MessageCardPart(author: "Jacques Martin", text: "Réponse.", handle: "jacques"),
            sentAt: Date(timeIntervalSince1970: 0),
            media: [
                MessageCardSubjectMedia(media: Self.photo("r1"), fileURL: "r1", author: MessageCardMediaAuthor(name: "Jacques Martin", handle: "jacques")),
                MessageCardSubjectMedia(media: Self.photo("q1"), fileURL: "q1", author: MessageCardMediaAuthor(name: "Awa Diallo", handle: "@awa", isQuoted: true)),
            ]
        )
        var format = MessageCardFormat.initial
        format.disposition.showsMediaAuthor = true
        format.useHandles = true
        format.anonymizeQuoted = true
        let input = MessageCardInput.of(subject: subject, format: format, handle: nil, conversationTitle: nil, anonymousLabel: "Anonyme", formatDate: { _ in "" })
        #expect(input.media.map(\.credit) == ["@jacques", "Anonyme"])
        format.disposition.showsMediaAuthor = false
        let unsigned = MessageCardInput.of(subject: subject, format: format, handle: nil, conversationTitle: nil, anonymousLabel: "Anonyme", formatDate: { _ in "" })
        #expect(unsigned.media.allSatisfy { $0.credit == nil })
        #expect(subject.hasMediaAuthors)
    }

    // MARK: - Mémoire du format

    @Test func format_anOlderMosaicReadsAboveInAGrid_andTheChoiceOfImageIsNotStored() {
        let older = #"{"template":"neige.systeme.bulles","showConversationTitle":false,"showAuthors":true,"showDate":false,"anonymizeQuoted":false,"anonymizeReply":false,"mediaLayout":"mosaic"}"#
        let read = MessageCardFormat.parse(older)?.disposition
        #expect(read?.mediaLayout == .above && read?.mediaArrangement == .mosaic)
        var format = MessageCardFormat.initial
        format.disposition.featuredMediaID = "p2"
        #expect(MessageCardFormat.parse(format.serialized)?.disposition.featuredMediaID == nil)
    }
}
