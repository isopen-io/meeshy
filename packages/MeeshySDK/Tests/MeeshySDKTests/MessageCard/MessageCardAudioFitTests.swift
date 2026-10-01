import Foundation
import Testing
@testable import MeeshySDK

/// **Un vocal tient dans sa carte** (revue #8979) — sur un format FIXE, le bloc
/// des médias ne prend jamais la place du texte : la transcription cède
/// d'abord (3 → 2 → 1 → masquée), l'échelle des médias s'arrête où le texte
/// garde sa place minimale, et l'avis dit la vraie cause d'une coupe.
struct MessageCardAudioFitTests {

    private static func measure(_ text: String, _ font: MessageCardFont) -> Double { Double(text.count) * font.size * 0.5 }

    private static let phrases = ["Bonjour à tous.", "On se retrouve demain.", "À la gare, vers midi.",
                                  "Prenez vos billets.", "Le train part à treize heures.", "Bon voyage !"]

    private static let voice = MessageCardMedia(
        id: "a1", kind: .audio, duration: 12,
        transcript: MessageCardTranscript(text: nil, segments: phrases.enumerated().map {
            MessageCardTranscript.Segment(text: $0.element, start: Double($0.offset) * 2, end: Double($0.offset + 1) * 2)
        })
    )
    private static let photo = MessageCardMedia(id: "p1", kind: .image, aspect: 4.0 / 3.0)

    private static func layout(_ input: MessageCardInput) -> MessageCardLayout { MessageCardLayout.make(input, measure: measure) }

    private static func texts(_ card: MessageCardLayout) -> [MessageCardTextOp] {
        card.ops.compactMap { if case let .text(text) = $0 { return text } else { return nil } }
    }

    /// Tout ce qui est posé tient entre les marges hautes et basses de la toile.
    private static func expectInside(_ card: MessageCardLayout, padY: Double, sourceLocation: SourceLocation = #_sourceLocation) {
        for zone in card.regions {
            #expect(zone.y >= padY - 0.5 && zone.y + zone.height <= card.height - padY + 0.5,
                    "\(zone.part) déborde : \(zone.y)…\(zone.y + zone.height) sur \(card.height)", sourceLocation: sourceLocation)
        }
    }

    private static func transcriptLines(_ card: MessageCardLayout) -> Int {
        guard let zone = card.regions.first(where: { $0.part == .transcript }) else { return 0 }
        return texts(card).filter { $0.y > zone.y && $0.y <= zone.y + zone.height + 1 }.count
    }

    /// Mesuré par la revue : en 4:5, une photo et un vocal pincés à 150 %
    /// occupaient ~1 136 px pour 1 110 de place.
    @Test func fit_aPinchedPhotoAndVoiceStayInsideA4by5Card_andTheReplyIsStillRead() {
        let input = MessageCardInput(
            quoted: MessageCardPart(author: "Awa", text: "On se retrouve où ce soir ?"),
            reply: MessageCardPart(author: "Jacques", text: "Chez Lina, à 20 h !"),
            template: MessageCardTemplates.defaultID, handle: "jacques",
            media: [Self.photo, Self.voice],
            disposition: MessageCardDisposition(aspect: .portrait, scales: MessageCardScales([.media: 1.5]))
        )
        let card = Self.layout(input)
        Self.expectInside(card, padY: 120)
        #expect(Self.texts(card).contains { $0.text == "Chez Lina, à 20 h !" }, "la réponse se lit toujours, en entier")
        #expect(!card.truncated)
    }

    /// Mesuré par la revue : en 1:1, à l'échelle 1, un vocal en réponse à une
    /// photo légendée dépassait d'environ 134 px — la carte tenait avant la
    /// transcription. Elle cède la première ; le texte garde son corps.
    @Test func fit_aVoiceReplyToACaptionedPhotoFitsASquare_theTranscriptGivesWayBeforeTheText() throws {
        let input = MessageCardInput(
            quoted: MessageCardPart(author: "Awa", text: "Le coucher de soleil sur la baie"),
            reply: MessageCardPart(author: "Jacques", text: ""),
            template: MessageCardTemplates.defaultID, handle: "jacques",
            media: [Self.voice, Self.photo],
            disposition: MessageCardDisposition(aspect: .square)
        )
        let card = Self.layout(input)
        Self.expectInside(card, padY: 104)
        let caption = try #require(Self.texts(card).first { $0.text == "Le coucher de soleil sur la baie" })
        #expect(caption.font.size == 40, "la légende garde son corps : la transcription a cédé d'abord")
        #expect(!card.truncated)
    }

    /// L'échelle des médias s'arrête où le texte garde sa place minimale — et
    /// le pincement s'arrête au même endroit : il ne promet pas une taille que
    /// la carte ne peindra pas.
    @Test func fit_theMediaScaleStopsWhereTheTextKeepsItsRoom_andThePinchStopsThere() throws {
        let pinched = MessageCardScales([.media: 1.5])
        let input = MessageCardInput(
            quoted: MessageCardPart(author: "Awa", text: "On se retrouve où ce soir ?"),
            reply: MessageCardPart(author: "Jacques", text: "Chez Lina, à 20 h !"),
            template: MessageCardTemplates.defaultID, handle: "jacques",
            media: [Self.photo, Self.voice],
            disposition: MessageCardDisposition(aspect: .portrait, scales: pinched)
        )
        let limit = Self.layout(input).mediaScaleLimit
        #expect(limit >= 1 && limit < 1.5, "\(limit)")
        #expect(pinched.pinched(.media, by: 1.3, limit: limit) == limit, "le geste plafonne à la borne")
        #expect(abs(pinched.pinched(.media, by: 0.9, limit: limit) - limit * 0.9) < 1e-9, "il repart de l'échelle RENDUE, pas de celle demandée")
        let roomy = MessageCardInput(quoted: nil, reply: MessageCardPart(author: "J", text: "Oui"), template: MessageCardTemplates.defaultID,
                                     handle: nil, media: [Self.photo])
        #expect(Self.layout(roomy).mediaScaleLimit == MessageCardScales.range.upperBound, "une carte qui a de la place ne borne rien")
    }

    /// L'avis dit la VRAIE cause d'une coupe : les médias, quand le texte seul tiendrait.
    @Test func fit_theCutIsBlamedOnTheMedia_onlyWhenTheTextAloneWouldFit() {
        let long = String(repeating: "mot ", count: 120)
        let crowded = Self.layout(MessageCardInput(
            quoted: nil, reply: MessageCardPart(author: "Jacques", text: long), template: MessageCardTemplates.defaultID, handle: nil,
            media: [Self.photo, Self.voice], disposition: MessageCardDisposition(aspect: .square)
        ))
        #expect(crowded.truncated && crowded.crowdedByMedia)
        Self.expectInside(crowded, padY: 104)
        let river = Self.layout(MessageCardInput(
            quoted: nil, reply: MessageCardPart(author: "Jacques", text: String(repeating: "mot ", count: 900)),
            template: MessageCardTemplates.defaultID, handle: nil, disposition: MessageCardDisposition(aspect: .square)
        ))
        #expect(river.truncated && !river.crowdedByMedia, "un message trop long l'est par lui-même")
    }

    /// Une ligne de transcription en trop : elle seule s'en va, les deux autres restent.
    @Test func fit_theTranscriptShortensLineByLineBeforeItDisappears() {
        let input = MessageCardInput(
            quoted: nil, reply: MessageCardPart(author: "Jacques", text: ""),
            template: MessageCardTemplates.defaultID, handle: "jacques", title: "Soirée",
            media: [Self.voice, Self.photo],
            disposition: MessageCardDisposition(aspect: .square)
        )
        let card = Self.layout(input)
        Self.expectInside(card, padY: 104)
        #expect(Self.transcriptLines(card) == 2)
    }
}
