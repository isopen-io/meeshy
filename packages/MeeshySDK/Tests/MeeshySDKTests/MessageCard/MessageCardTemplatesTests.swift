import Foundation
import Testing
@testable import MeeshySDK

/// Les templates de carte — des centaines, composés, et nommés EXACTEMENT
/// comme sur le web : le compteur d'usage et le format par défaut retiennent
/// ces identifiants, les deux plateformes doivent parler la même langue.
struct MessageCardTemplatesTests {

    /// `apps/web/src/lib/export/message-card-templates.ts`, lu DANS LE DÉPÔT.
    private static var webTemplatesURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("apps/web/src/lib/export/message-card-templates.ts")
    }

    private static func webSource() throws -> String {
        try String(contentsOf: webTemplatesURL, encoding: .utf8)
    }

    /// Le bloc `export const NAME = … ;` ou `… as const …` du fichier web.
    private static func block(_ source: String, from start: String, to end: String) -> String {
        guard let lower = source.range(of: start) else { return "" }
        let rest = source[lower.upperBound...]
        guard let upper = rest.range(of: end) else { return "" }
        return String(rest[..<upper.lowerBound])
    }

    private static func keys(in block: String) -> [String] {
        block.components(separatedBy: "\n").compactMap { line -> String? in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard let colon = trimmed.firstIndex(of: ":") else { return nil }
            let key = String(trimmed[..<colon])
            return !key.isEmpty && key.allSatisfy({ $0.isLetter }) ? key : nil
        }
    }

    private static func quoted(in block: String) -> [String] {
        block.components(separatedBy: "'").enumerated().filter { $0.offset % 2 == 1 }.map(\.element)
    }

    @Test func paletteIDs_matchTheWebTable_inOrder() throws {
        let palettes = Self.block(try Self.webSource(), from: "export const CARD_PALETTES = {", to: "} as const")
        #expect(Self.keys(in: palettes) == MessageCardPaletteID.allCases.map(\.rawValue))
    }

    @Test func typefaceIDs_matchTheWebTable_inOrder() throws {
        let typefaces = Self.block(try Self.webSource(), from: "export const CARD_TYPEFACES = {", to: "} as const")
        #expect(Self.keys(in: typefaces) == MessageCardTypefaceID.allCases.map(\.rawValue))
    }

    @Test func linkIDs_matchTheWebTable_inOrder() throws {
        let links = Self.block(try Self.webSource(), from: "export const CARD_LINKS = [", to: "]")
        #expect(Self.quoted(in: links) == MessageCardLinkID.allCases.map(\.rawValue))
    }

    @Test func featuredAndDefault_matchTheWeb() throws {
        let source = try Self.webSource()
        let featured = Self.block(source, from: "export const FEATURED_TEMPLATE_IDS: readonly MessageCardTemplateId[] = [", to: "];")
        #expect(Self.quoted(in: featured) == MessageCardTemplates.featured.map(\.rawValue))
        #expect(source.contains("DEFAULT_TEMPLATE_ID: MessageCardTemplateId = '\(MessageCardTemplates.defaultID.rawValue)'"))
    }

    @Test func paletteNames_matchTheWeb() throws {
        let source = try Self.webSource()
        for palette in MessageCardPaletteID.allCases {
            #expect(source.contains("'\(palette.palette.name)'"), "nom de palette absent du web : \(palette.palette.name)")
        }
    }

    @Test func hundredsOfDistinctTemplates() {
        let all = MessageCardTemplates.all
        #expect(all.count == MessageCardPaletteID.allCases.count * MessageCardTypefaceID.allCases.count * MessageCardLinkID.allCases.count)
        #expect(all.count >= 300)
        #expect(Set(all).count == all.count)
    }

    @Test func anIDReadsBackIntoItsTemplate_andAnUnknownOneIntoNothing() {
        for id in MessageCardTemplates.featured + [MessageCardTemplates.defaultID] {
            #expect(MessageCardTemplateID(rawValue: id.rawValue) == id)
        }
        #expect(MessageCardTemplateID(rawValue: "neige.systeme.bulles")?.link == .bulles)
        #expect(MessageCardTemplateID(rawValue: "aurore") == nil)
        #expect(MessageCardTemplateID(rawValue: "aurore.rond.orbite.extra") == nil)
        #expect(MessageCardTemplateID(rawValue: "toString.rond.orbite") == nil)
    }

    @Test func random_drawsAnExistingTemplate_boundsIncluded() {
        #expect(MessageCardTemplates.random { 0 } == MessageCardTemplates.all[0])
        #expect(MessageCardTemplates.random { 0.9999999 } == MessageCardTemplates.all[MessageCardTemplates.all.count - 1])
        #expect(MessageCardTemplates.all.contains(MessageCardTemplates.random { 0.5 }))
    }

    @Test func storyTypefaces_useTheStoryFonts() {
        #expect(MessageCardTypefaceID.affiche.typeface.replyFace == .story(.poster))
        #expect(MessageCardTypefaceID.didone.typeface.quoteFace == .story(.elegant))
        #expect(MessageCardTemplates.guillemetFace == .story(.elegant))
        for typeface in MessageCardTypefaceID.allCases {
            for face in [typeface.typeface.replyFace, typeface.typeface.quoteFace] {
                if case let .story(style) = face { #expect(style.fontName != nil) }
            }
        }
    }

    @Test func colors_parseHexAndRGBA() {
        #expect(MessageCardColor.hex("#FF8000") == MessageCardColor(red: 1, green: 128.0 / 255, blue: 0))
        #expect(MessageCardColor.rgba(255, 255, 255, 0.5).alpha == 0.5)
        #expect(MessageCardColor.hex("nope") == MessageCardColor(red: 0, green: 0, blue: 0))
    }
}
