import Foundation
import Testing
@testable import MeeshySDK

/// Le HERO du support et l'IMBRICATION du fil (#10915) — lois pures et mise en page.
struct MessageCardHeroThreadTests {

    private static func measure(_ text: String, _ font: MessageCardFont) -> Double { Double(text.count) * font.size * 0.5 }

    private static let photo = MessageCardMedia(id: "hero", kind: .image, aspect: 16.0 / 9.0)
    private static let attached = MessageCardMedia(id: "att", kind: .image, aspect: 1)

    private static func layout(quoted: MessageCardPart? = MessageCardPart(author: "Awa", text: "Le coucher de soleil"),
                               reply: MessageCardPart = MessageCardPart(author: "Bob", text: "Magnifique !"),
                               media: [MessageCardMedia] = [], hero: String? = nil) -> MessageCardLayout {
        let input = MessageCardInput(quoted: quoted, reply: reply, template: MessageCardTemplates.defaultID, handle: "bob", media: media,
                                     disposition: MessageCardDisposition(heroMediaID: hero))
        return MessageCardLayout.make(input, measure: measure)
    }

    private static func mediaOps(_ layout: MessageCardLayout) -> [MessageCardMediaOp] {
        layout.ops.compactMap { if case let .media(op) = $0 { return op } else { return nil } }
    }

    private static func textOps(_ layout: MessageCardLayout) -> [MessageCardTextOp] {
        layout.ops.compactMap { if case let .text(op) = $0 { return op } else { return nil } }
    }

    // MARK: - La loi du hero

    @Test func height_followsTheRatio_clampedBetweenSixteenNineAndFourFive() {
        #expect(MessageCardHero.height(aspect: 16.0 / 9.0, aspectKnown: true, width: 984, budget: 4000) == 554)
        #expect(MessageCardHero.height(aspect: 3, aspectKnown: true, width: 984, budget: 4000) == 554, "plus large que 16:9 : recadré à 16:9")
        #expect(MessageCardHero.height(aspect: 0.4, aspectKnown: true, width: 984, budget: 4000) == 1230, "plus haut que 4:5 : recadré à 4:5")
        #expect(MessageCardHero.height(aspect: 1, aspectKnown: false, width: 984, budget: 4000) == 738, "côtés inconnus : 4:3")
    }

    @Test func height_neverTakesMoreThanFortyFivePercentOfTheBudget() {
        #expect(MessageCardHero.height(aspect: 0.5, aspectKnown: true, width: 984, budget: 1648) == 741)
    }

    @Test func span_isFullWidthMinusTheMargin_orTheTextColumnBesideAVerticalHeader() {
        let full = MessageCardHero.span(canvasWidth: 1080, verticalHeader: false, textLeft: 96, textWidth: 888)
        #expect(full.x == 48 && full.width == 984)
        let column = MessageCardHero.span(canvasWidth: 1080, verticalHeader: true, textLeft: 208, textWidth: 776)
        #expect(column.x == 208 && column.width == 776)
    }

    // MARK: - Le hero sur la carte

    @Test func disposition_theHeroLeavesTheBody_andComesFirst() {
        let disposition = MessageCardDisposition(mediaArrangement: .mosaic, heroMediaID: "hero")
        let media = [Self.attached, Self.photo]
        #expect(disposition.paintedVisuals(of: media).map(\.id) == ["hero", "att"])
        #expect(disposition.bodyVisuals(of: media).map(\.id) == ["att"])
        #expect(MessageCardDisposition(heroMediaID: "gone").heroVisual(of: media) == nil)
        #expect(MessageCardDisposition().paintedVisuals(of: media).map(\.id) == ["att"], "sans hero, la règle d'avant (#9235) : le premier")
    }

    @Test func layout_theHeroIsOnTopOfEveryText_fullWidth() throws {
        let card = Self.layout(media: [Self.photo], hero: "hero")
        let media = try #require(Self.mediaOps(card).first)
        #expect(media.x == 48 && media.width == 984)
        #expect(media.height == 554)
        let firstText = try #require(Self.textOps(card).map(\.y).min())
        #expect(media.y + media.height < firstText, "le hero est au-dessus de la ligne du support")
        let hero = try #require(card.regions.first { $0.part == .media })
        #expect(hero.y == media.y && hero.width == 984)
        let quote = try #require(card.regions.first { $0.part == .quote })
        #expect(quote.y >= media.y + media.height)
    }

    @Test func layout_theHeroIsPaintedOnce_notAgainInTheBody() {
        let card = Self.layout(media: [Self.photo], hero: "hero")
        #expect(Self.mediaOps(card).count == 1)
        let withBody = Self.layout(media: [Self.photo, Self.attached], hero: "hero")
        #expect(Self.mediaOps(withBody).map(\.mediaID) == ["hero", "att"])
    }

    @Test func layout_withoutAHero_theCardIsAsBefore() {
        let plain = Self.layout(media: [Self.photo], hero: nil)
        let op = Self.mediaOps(plain).first
        #expect(op?.x == 96 && op?.width == 888)
    }

    // MARK: - Le fil

    @Test func separatorWidth_shrinksByOneIndentPerLevel_neverBelowOne() {
        #expect(MessageCardThread.separatorWidth(level: 1) == 160)
        #expect(MessageCardThread.separatorWidth(level: 2) == 116)
        #expect(MessageCardThread.separatorWidth(level: 3) == 72)
        #expect(MessageCardThread.separatorWidth(level: 9) == 44)
    }

    @Test func line_levelIsClamped() {
        #expect(MessageCardThreadLine(text: "x", level: 9).level == MessageCardThread.maxLevel)
        #expect(MessageCardThreadLine(text: "x", level: -2).level == 0)
    }

    @Test func rows_wrapEachEntryInTheWidthItsLevelLeaves_andSeparateTheReplies() {
        let font = MessageCardFont(face: .system(500), size: 20)
        let lines = [MessageCardThreadLine(text: String(repeating: "mot ", count: 30), level: 0), MessageCardThreadLine(text: String(repeating: "mot ", count: 30), level: 2)]
        let rows = MessageCardThread.rows(of: lines, width: 600, font: font, measure: Self.measure)
        let rootRows = rows.filter { $0.level == 0 }
        let deepRows = rows.filter { $0.level == 2 && !$0.separator }
        #expect(!rootRows.isEmpty && deepRows.count > rootRows.count, "le niveau 2 dispose de 88 px de moins")
        #expect(rows.filter(\.separator).count == 1 && rows.first { $0.separator }?.text == "")
        #expect(rootRows.allSatisfy { !$0.separator })
    }

    @Test func layout_aReplyIsIndentedUnderItsRoot_behindTheTemplateSeparator() throws {
        let entries = [MessageCardThreadLine(text: "Bob : Magnifique !", level: 0), MessageCardThreadLine(text: "Cleo : Tu étais où ?", level: 1)]
        let reply = MessageCardPart(author: "Fil", text: entries.map(\.text).joined(separator: "\n"), thread: entries)
        let card = Self.layout(quoted: nil, reply: reply)
        let root = try #require(Self.textOps(card).first { $0.text.hasPrefix("Bob") })
        let answer = try #require(Self.textOps(card).first { $0.text.hasPrefix("Cleo") })
        #expect(answer.x - root.x == MessageCardThread.indent)
        let separators = card.ops.compactMap { op -> MessageCardSeparatorOp? in if case let .separator(line) = op { return line } else { return nil } }
        let line = try #require(separators.first, "la liaison orbite du template sépare la réponse de sa racine")
        #expect(line.x1 == answer.x && line.x2 - line.x1 == MessageCardThread.separatorWidth(level: 1))
        #expect(line.y > root.y && line.y < answer.y)
    }

    @Test(arguments: MessageCardAspect.allCases)
    func layout_aTruncatedThreadEndsOnText_neverOnASeparator(aspect: MessageCardAspect) throws {
        let entries = (1...60).map { MessageCardThreadLine(text: "U\($0) : réponse numéro \($0)", level: 1) }
        let reply = MessageCardPart(author: "Fil", text: entries.map(\.text).joined(separator: "\n"), thread: entries)
        let input = MessageCardInput(quoted: nil, reply: reply, template: MessageCardTemplates.defaultID, handle: "bob",
                                     disposition: MessageCardDisposition(aspect: aspect))
        let card = MessageCardLayout.make(input, measure: Self.measure)
        #expect(card.truncated)
        let last = try #require(Self.textOps(card).last { $0.text.hasPrefix("U") || $0.text.hasPrefix("…") })
        #expect(last.text.hasSuffix("…"), "la coupe se dit sur la dernière ligne de texte")
    }

    @Test func layout_aFlatReplyHasNoSeparatorAndNoIndent() throws {
        let card = Self.layout(quoted: nil, reply: MessageCardPart(author: "Bob", text: "Magnifique !"))
        let line = try #require(Self.textOps(card).first { $0.text.hasPrefix("Magn") })
        #expect(line.x == 96)
        #expect(!card.ops.contains { if case .separator = $0 { return true } else { return false } })
    }
}
