import Foundation
import Testing
@testable import MeeshySDK

/// La mise en page de la carte d'export — les mêmes promesses que
/// `apps/web/src/lib/export/message-card-layout.test.ts`, rejouées sur le miroir iOS.
struct MessageCardLayoutTests {

    /// Une règle fixe : chaque caractère mesure la moitié de la taille de police.
    private static func measure(_ text: String, _ font: MessageCardFont) -> Double { Double(text.count) * font.size * 0.5 }

    private static func perChar(_ width: Double) -> MessageCardMeasure { { text, _ in Double(text.count) * width } }

    private static let anyFont = MessageCardFont(face: .system(400), size: 10)

    private static func input(
        quoted: MessageCardPart? = MessageCardPart(author: "Awa", text: "On se retrouve où ce soir ?"),
        reply: MessageCardPart = MessageCardPart(author: "Jacques", text: "Chez Lina, à 20 h !"),
        template: MessageCardTemplateID = MessageCardTemplates.defaultID,
        handle: String? = "jacques",
        title: String? = nil,
        date: String? = nil,
        showAuthors: Bool = true
    ) -> MessageCardInput {
        MessageCardInput(quoted: quoted, reply: reply, template: template, handle: handle, title: title, date: date, showAuthors: showAuthors)
    }

    private static func layout(_ input: MessageCardInput) -> MessageCardLayout {
        MessageCardLayout.make(input, measure: Self.measure)
    }

    private static func texts(_ ops: [MessageCardOp]) -> [MessageCardTextOp] {
        ops.compactMap { if case let .text(text) = $0 { return text } else { return nil } }
    }

    private static func text(_ ops: [MessageCardOp], _ value: String) -> MessageCardTextOp? {
        texts(ops).first { $0.text == value }
    }

    private static func separators(_ ops: [MessageCardOp]) -> [MessageCardSeparatorOp] {
        ops.compactMap { if case let .separator(separator) = $0 { return separator } else { return nil } }
    }

    private static func panels(_ ops: [MessageCardOp]) -> [MessageCardRectOp] {
        ops.compactMap { if case let .panel(panel) = $0 { return panel } else { return nil } }
    }

    private static func bars(_ ops: [MessageCardOp]) -> [MessageCardRectOp] {
        ops.compactMap { if case let .bar(bar) = $0 { return bar } else { return nil } }
    }

    private static func dots(_ ops: [MessageCardOp]) -> [MessageCardDotOp] {
        ops.compactMap { if case let .dot(dot) = $0 { return dot } else { return nil } }
    }

    private static func with(_ link: MessageCardLinkID) -> MessageCardLayout {
        layout(input(template: MessageCardTemplateID(palette: .aurore, typeface: .rond, link: link)))
    }

    // MARK: - Texte

    @Test func wrap_cutsAtSpaces_neverWiderThanTheLine() {
        let lines = MessageCardText.wrap("un deux trois quatre cinq six", maxWidth: 10, font: Self.anyFont, measure: Self.perChar(1))
        #expect(lines == ["un deux", "trois", "quatre", "cinq six"])
    }

    @Test func wrap_keepsAuthorLineBreaks_withoutStackingBlankLines() {
        #expect(MessageCardText.wrap("bonjour\n\n\n\nà demain", maxWidth: 50, font: Self.anyFont, measure: Self.perChar(1)) == ["bonjour", "", "à demain"])
    }

    @Test func wrap_cutsAnOverlongWordByGrapheme() {
        #expect(MessageCardText.wrap("https://meeshy.me/abc", maxWidth: 8, font: Self.anyFont, measure: Self.perChar(1)) == ["https://", "meeshy.m", "e/abc"])
    }

    @Test func wrap_neverSplitsAComposedEmoji() {
        #expect(MessageCardText.wrap("🎉🎉🎉🎉", maxWidth: 2, font: Self.anyFont, measure: Self.perChar(1)) == ["🎉🎉", "🎉🎉"])
    }

    @Test func truncate_leavesAFittingTextAlone_andEndsTheLastKeptLineWithAnEllipsis() {
        #expect(MessageCardText.truncate(["a", "b"], count: 3, maxWidth: 10, font: Self.anyFont, measure: Self.perChar(1)) == ["a", "b"])
        #expect(MessageCardText.truncate(["abcdef", "ghijkl", "mnop"], count: 2, maxWidth: 6, font: Self.anyFont, measure: Self.perChar(1)) == ["abcdef", "ghijk…"])
    }

    @Test func direction_followsTheFirstStrongCharacter() {
        #expect(MessageCardText.direction(of: "مرحبا بك") == .rtl)
        #expect(MessageCardText.direction(of: "« Salut »") == .ltr)
        #expect(MessageCardText.direction(of: "🔥🔥") == .ltr)
    }

    // MARK: - Carte

    @Test func layout_readsLikeTheThread_quoteThenLinkThenReply() throws {
        let ops = Self.layout(Self.input()).ops
        let quote = try #require(Self.text(ops, "On se retrouve où ce soir ?"))
        let reply = try #require(Self.text(ops, "Chez Lina, à 20 h !"))
        let separator = try #require(Self.separators(ops).first)
        #expect(quote.y < separator.y)
        #expect(separator.y < reply.y)
        #expect(quote.font.size < reply.font.size)
    }

    @Test func layout_namesBothAuthors_andTheQuoteCarriesItsBar() {
        let ops = Self.layout(Self.input()).ops
        #expect(Self.text(ops, "Awa") != nil)
        #expect(Self.text(ops, "Jacques") != nil)
        #expect(!Self.bars(ops).isEmpty)
    }

    @Test func layout_aStandaloneMessageHasNoLink_whateverTheTemplate() {
        for link in MessageCardLinkID.allCases {
            let ops = Self.layout(Self.input(quoted: nil, template: MessageCardTemplateID(palette: .aurore, typeface: .rond, link: link))).ops
            #expect(Self.separators(ops).isEmpty && Self.bars(ops).isEmpty && Self.dots(ops).isEmpty)
            #expect(Self.texts(ops).map(\.text) == ["Jacques", "Chez Lina, à 20 h !"])
        }
    }

    @Test func watermark_isOnlyMeeshyAndTheHandle() {
        let layout = Self.layout(Self.input(handle: "awa"))
        #expect(layout.watermark == "Meeshy @awa")
        #expect(Self.texts(layout.ops).map(\.text) == ["Awa", "On se retrouve où ce soir ?", "Jacques", "Chez Lina, à 20 h !"])
        #expect(Self.layout(Self.input(handle: "@awa")).watermark == "Meeshy @awa")
        #expect(Self.layout(Self.input(handle: nil)).watermark == "Meeshy")
        #expect(Self.layout(Self.input(handle: "  ")).watermark == "Meeshy")
    }

    @Test func watermark_staysWhenBothAuthorsAreAnonymized() {
        let subject = MessageCardSubject(
            quoted: MessageCardPart(author: "Awa", text: "Question ?"),
            reply: MessageCardPart(author: "Jacques", text: "Réponse."),
            sentAt: Date(timeIntervalSince1970: 0)
        )
        var format = MessageCardFormat.initial
        format.anonymizeQuoted = true
        format.anonymizeReply = true
        let input = MessageCardInput.of(subject: subject, format: format, handle: "jacques", conversationTitle: nil, anonymousLabel: "Anonyme", formatDate: { _ in "" })
        let layout = Self.layout(input)
        #expect(layout.watermark == "Meeshy @jacques")
        #expect(Self.text(layout.ops, "Awa") == nil && Self.text(layout.ops, "Jacques") == nil)
        #expect(Self.texts(layout.ops).filter { $0.text == "Anonyme" }.count == 2)
    }

    @Test func layout_aShortExchangeFitsASquare() {
        let layout = Self.layout(Self.input())
        #expect(layout.width == MessageCardLayout.cardWidth)
        #expect(layout.height == MessageCardLayout.minHeight)
        #expect(!layout.truncated)
        for link in MessageCardLinkID.allCases { #expect(Self.with(link).height == MessageCardLayout.minHeight) }
    }

    @Test func layout_aMediumTextGrowsTheCardWithoutCuttingIt() {
        let reply = (0..<60).map { "mot\($0)" }.joined(separator: " ")
        let layout = Self.layout(Self.input(reply: MessageCardPart(author: "Jacques", text: reply)))
        #expect(layout.height > MessageCardLayout.minHeight && layout.height <= MessageCardLayout.maxHeight)
        #expect(!layout.truncated)
        #expect(Self.texts(layout.ops).map(\.text).joined(separator: " ").contains("mot59"))
    }

    @Test func layout_aRiverOfTextShrinks_capsAtStoryHeight_andEndsWithAnEllipsis() {
        let reply = (0..<1200).map { "mot\($0)" }.joined(separator: " ")
        let layout = Self.layout(Self.input(reply: MessageCardPart(author: "Jacques", text: reply)))
        #expect(layout.height == MessageCardLayout.maxHeight)
        #expect(layout.truncated)
        #expect(Self.texts(layout.ops).contains { $0.text.hasSuffix("…") })
        #expect(Self.texts(layout.ops).allSatisfy { $0.y <= MessageCardLayout.maxHeight })
    }

    @Test func layout_noLineOverflowsTheMargins_forEveryTypefaceAndLink() {
        let reply = "Une réponse assez longue pour tenir sur plusieurs lignes, avec des mots ordinaires et un lien https://meeshy.me/une-adresse-tres-longue-sans-espace"
        for typeface in MessageCardTypefaceID.allCases {
            for link in MessageCardLinkID.allCases {
                let template = MessageCardTemplateID(palette: .neige, typeface: typeface, link: link)
                let ops = Self.layout(Self.input(reply: MessageCardPart(author: "Jacques", text: reply), template: template)).ops
                for op in Self.texts(ops) where op.align == .left {
                    #expect(op.x + Self.measure(op.text, op.font) <= MessageCardLayout.cardWidth)
                }
            }
        }
    }

    @Test func layout_anArabicReplyAlignsRight() throws {
        let ops = Self.layout(Self.input(reply: MessageCardPart(author: "ليلى", text: "نلتقي الساعة الثامنة"))).ops
        let reply = try #require(Self.text(ops, "نلتقي الساعة الثامنة"))
        #expect(reply.direction == .rtl)
        #expect(reply.align == .right)
    }

    @Test func layout_theHeaderOpensTheCard_beforeTheQuote() throws {
        let ops = Self.layout(Self.input(title: "Soirée de lancement", date: "28 septembre 2026")).ops
        let title = try #require(Self.text(ops, "Soirée de lancement"))
        let date = try #require(Self.text(ops, "28 septembre 2026"))
        let quote = try #require(Self.text(ops, "On se retrouve où ce soir ?"))
        #expect(title.y < date.y && date.y < quote.y)
    }

    @Test func layout_anOverlongTitleHoldsOnOneLine() throws {
        let long = String(repeating: "Une conversation au titre vraiment interminable ", count: 4).trimmingCharacters(in: .whitespaces)
        let ops = Self.layout(Self.input(title: long)).ops
        let title = try #require(Self.texts(ops).first { $0.text.hasPrefix("Une conversation") })
        #expect(title.text.hasSuffix("…"))
        #expect(title.x + Self.measure(title.text, title.font) <= MessageCardLayout.cardWidth)
    }

    @Test func layout_withoutAuthors_noNameIsPainted() {
        let ops = Self.layout(Self.input(showAuthors: false)).ops
        #expect(Self.text(ops, "Awa") == nil && Self.text(ops, "Jacques") == nil)
        #expect(Self.text(ops, "Chez Lina, à 20 h !") != nil)
    }

    // MARK: - Liaisons

    @Test func link_orbite_isADottedLineAroundACircle() throws {
        let separator = try #require(Self.separators(Self.with(.orbite).ops).first)
        #expect(separator.radius > 0 && !separator.dash.isEmpty)
    }

    @Test func link_filet_isAShortSolidRule() throws {
        let separator = try #require(Self.separators(Self.with(.filet).ops).first)
        #expect(separator.radius == 0 && separator.dash.isEmpty)
        #expect(separator.x2 - separator.x1 < MessageCardLayout.cardWidth / 2)
    }

    @Test func link_guillemets_opensTheReplyWithALargeQuoteMark() throws {
        let ops = Self.with(.guillemets).ops
        let mark = try #require(Self.text(ops, "“"))
        #expect(mark.font.size > 100)
        #expect(Self.bars(ops).isEmpty)
    }

    @Test func link_bulles_putsEachTextInItsOwnOffsetBubble() throws {
        let ops = Self.with(.bulles).ops
        let panels = Self.panels(ops)
        #expect(panels.count == 2)
        let quote = try #require(Self.text(ops, "On se retrouve où ce soir ?"))
        let reply = try #require(Self.text(ops, "Chez Lina, à 20 h !"))
        let inside: (MessageCardTextOp, MessageCardRectOp) -> Bool = { op, panel in
            op.y > panel.y && op.y < panel.y + panel.height && op.x > panel.x && op.x < panel.x + panel.width
        }
        #expect(inside(quote, panels[0]) && inside(reply, panels[1]))
        #expect(panels[0].x < panels[1].x)
    }

    @Test func link_fil_endsOnADot_andSilencePaintsNothing() {
        let fil = Self.with(.fil).ops
        #expect(Self.dots(fil).count == 1)
        #expect(Self.bars(fil).count == 2)
        let silence = Self.with(.silence).ops
        #expect(Self.separators(silence).isEmpty && Self.panels(silence).isEmpty && Self.dots(silence).isEmpty)
        #expect(Self.texts(silence).count == 4)
        #expect(Self.text(Self.with(.fleche).ops, "↳") != nil)
    }

    // MARK: - Zones touchables

    @Test func uneReponseCiteeSeLitDeHautEnBasSansEnTeteNonDemande() {
        let layout = Self.layout(Self.input())
        #expect(layout.regions.map(\.part) == [.quote, .link, .reply])
        let quote = layout.regions[0], link = layout.regions[1], reply = layout.regions[2]
        #expect(quote.y + quote.height <= link.y)
        #expect(link.y + link.height <= reply.y)
    }

    @Test func leTitreOuLaDateOuvrentUneZoneDEnTeteEtUnMessageIsoleNAniCitationNiLiaison() {
        let layout = Self.layout(Self.input(quoted: nil, title: "Soirée", date: "28 septembre 2026"))
        #expect(layout.regions.map(\.part) == [.header, .reply])
    }

    @Test func chaqueZoneContientLeTexteQuElleNomme() {
        let layout = Self.layout(Self.input(template: MessageCardTemplateID(palette: .neige, typeface: .systeme, link: .bulles)))
        let reply = layout.regions.first { $0.part == .reply }
        let line = Self.text(layout.ops, "Chez Lina, à 20 h !")
        #expect(reply != nil && line != nil)
        if let reply, let line {
            #expect(line.y > reply.y)
            #expect(line.y <= reply.y + reply.height)
        }
    }

    @Test func lesZonesNeSeChevauchentPasEtRestentDansLaCarte() {
        let layout = Self.layout(Self.input(title: "Soirée", date: "28 septembre 2026"))
        #expect(layout.regions.map(\.part) == [.header, .quote, .link, .reply])
        for (index, zone) in layout.regions.enumerated() {
            #expect(zone.x >= 0)
            #expect(zone.x + zone.width <= MessageCardLayout.cardWidth)
            #expect(zone.y + zone.height <= layout.height)
            if index + 1 < layout.regions.count {
                #expect(zone.y + zone.height <= layout.regions[index + 1].y)
            }
        }
    }
}
