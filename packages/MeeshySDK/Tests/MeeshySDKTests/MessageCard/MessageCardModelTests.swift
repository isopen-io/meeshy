import Foundation
import Testing
@testable import MeeshySDK

/// Les MAQUETTES d'export (#18673) : des fiches de données, distinctes, que le
/// moteur lit comme celles d'une marque — la palette, la police et la liaison en
/// sont des réglages.
struct MessageCardModelTests {

    private static func measure(_ text: String, _ font: MessageCardFont) -> Double { Double(text.count) * font.size * 0.5 }

    private static func input(_ format: MessageCardFormat) -> MessageCardInput {
        MessageCardInput(
            quoted: MessageCardPart(author: "Awa", text: "Qui vient jeudi ?"),
            reply: MessageCardPart(author: "Jacques", text: "Je serai là avec toute l’équipe."),
            template: format.template,
            handle: "jacques",
            disposition: format.disposition
        )
    }

    private static func layout(_ model: MessageCardModel) -> MessageCardLayout {
        MessageCardLayout.make(input(model.applied(to: .initial)), measure: measure)
    }

    // MARK: - Les huit maquettes

    @Test func eightBuiltInModelsAreReadFromTheirSheet() {
        #expect(MessageCardModels.builtIn.count == 8)
        #expect(Set(MessageCardModels.builtIn.map(\.id)).count == 8)
        #expect(MessageCardModels.model(id: MessageCardModels.defaultID)?.template == MessageCardTemplates.defaultID)
    }

    @Test func everyModelIsDistinctInWhatItLaysOut() {
        let shapes = MessageCardModels.builtIn.map { model in
            "\(model.link)|\(model.aspect)|\(model.headerOrientation)|\(model.authorPlacement)|\(model.tilt)|\(model.decor.alignment)|\(model.decor.frame)|\(model.decor.ornament)"
        }
        #expect(Set(shapes).count == shapes.count)
    }

    @Test func everyModelIsNamedInTheSevenLanguages() {
        for model in MessageCardModels.builtIn {
            for language in ["fr", "en", "es", "de", "it", "pt-BR", "ar"] {
                #expect(model.name(language: language) != model.id || model.names.values.contains(model.id))
            }
            #expect(model.names.count == 7)
        }
    }

    @Test func applyingAModelKeepsWhatTheUserChoseToShow() throws {
        var format = MessageCardFormat.initial
        format.anonymizeQuoted = true
        format.showDate = true
        let affiche = try #require(MessageCardModels.model(id: "affiche"))
        let applied = affiche.applied(to: format)
        #expect(applied.anonymizeQuoted && applied.showDate)
        #expect(applied.model == "affiche")
        #expect(applied.template == affiche.template)
        #expect(applied.disposition.aspect == .story)
        #expect(applied.disposition.decor.alignment == .center)
    }

    @Test func aModelOffersOnlyTheLinksThatSuitIt() throws {
        let bulles = try #require(MessageCardModels.model(id: "bulles"))
        #expect(bulles.offeredLinks == [.bulles])
        let citation = try #require(MessageCardModels.model(id: "citation"))
        #expect(citation.offeredLinks == MessageCardLinkID.allCases)
    }

    // MARK: - Le format se souvient de sa maquette

    @Test func aFormatRemembersItsModelAndDecor() throws {
        let carnet = try #require(MessageCardModels.model(id: "carnet"))
        let format = carnet.applied(to: .initial)
        let read = try #require(MessageCardFormat.parse(format.serialized))
        #expect(read == format)
    }

    @Test func aFormatWithoutDecorSerializesAsBefore() {
        #expect(!MessageCardFormat.initial.serialized.contains("frame"))
        #expect(!MessageCardFormat.initial.serialized.contains("model"))
    }

    // MARK: - Le décor

    @Test func aCenteredModelCentersItsLines() throws {
        let layout = Self.layout(try #require(MessageCardModels.model(id: "affiche")))
        let texts = layout.ops.compactMap { if case let .text(text) = $0 { return text } else { return nil } }
        #expect(!texts.isEmpty)
        #expect(texts.allSatisfy { $0.align == .center })
        #expect(Set(texts.map(\.x)).count == 1)
    }

    @Test func aBorderedModelDrawsFourEdgesUnderTheWatermark() throws {
        let layout = Self.layout(try #require(MessageCardModels.model(id: "editorial")))
        let bars = layout.backdrop.filter { if case .bar = $0 { return true } else { return false } }
        #expect(bars.count == 4)
    }

    @Test func aPanelSitsBehindTheContent() throws {
        let layout = Self.layout(try #require(MessageCardModels.model(id: "carnet")))
        let behind = layout.backdrop.flatMap { op -> [MessageCardOp] in
            if case let .group(group) = op { return group.ops } else { return [op] }
        }
        #expect(behind.contains { if case .panel = $0 { return true } else { return false } })
    }

    @Test func noDecorLeavesTheCardUntouched() {
        let plain = MessageCardLayout.make(Self.input(.initial), measure: Self.measure)
        let engine = MessageCardLayoutEngine(input: Self.input(.initial), measure: Self.measure).layout()
        #expect(plain == engine)
    }

    // MARK: - Une marque fournit la même fiche

    @Test func aBrandModelIsReadLikeABuiltInOne() throws {
        let json = """
        [{"id": "@acme/promo", "names": {"fr": "Promo Acme"}, "palette": "citron", "typeface": "affiche", "link": "silence",
          "aspect": "square", "decor": {"alignment": "center", "frame": "panel", "ornament": "accentRule"}}]
        """
        let models = try MessageCardModels.decode(Data(json.utf8))
        #expect(models.first?.id == "@acme/promo")
        #expect(models.first?.name(language: "en") == "Promo Acme")
    }

    @Test func aSheetWithAnUnknownValueIsRefused() {
        let unknown = #"[{"id": "x", "names": {"fr": "X"}, "palette": "turquoise", "typeface": "rond", "link": "orbite"}]"#
        #expect(throws: (any Error).self) { try MessageCardModels.decode(Data(unknown.utf8)) }
        let badID = #"[{"id": "Acme Promo", "names": {"fr": "X"}, "palette": "aurore", "typeface": "rond", "link": "orbite"}]"#
        #expect(throws: (any Error).self) { try MessageCardModels.decode(Data(badID.utf8)) }
        let outside = #"[{"id": "x", "names": {"fr": "X"}, "palette": "aurore", "typeface": "rond", "link": "fil", "links": ["orbite"]}]"#
        #expect(throws: (any Error).self) { try MessageCardModels.decode(Data(outside.utf8)) }
    }
}
