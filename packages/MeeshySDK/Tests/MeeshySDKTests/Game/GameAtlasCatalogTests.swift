import Foundation
import Testing
@testable import MeeshySDK

/// Le catalogue de l'Atlas est celui de la passerelle, pas une liste de plus (#9388).
@Suite("Jeu Meeshy — le catalogue de l'Atlas des langues")
struct GameAtlasCatalogTests {

    private static var languageCodesURL: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("shared/utils/language-codes.ts")
    }

    @Test("les langues de l'Atlas sont SUPPORTED_LANGUAGE_CODES, dans le même ordre")
    func catalogMatchesTheSharedCodes() throws {
        let source = try String(contentsOf: Self.languageCodesURL, encoding: .utf8)
        let blockRange = try #require(source.range(of: "(?s)SUPPORTED_LANGUAGE_CODES = \\[(.*?)\\] as const", options: .regularExpression))
        let block = String(source[blockRange])
        let regex = try NSRegularExpression(pattern: "'([a-z]+)'")
        let codes: [String] = regex.matches(in: block, range: NSRange(block.startIndex..., in: block)).compactMap { match in
            Range(match.range(at: 1), in: block).map { String(block[$0]) }
        }
        #expect(codes == GameAtlas.catalog)
    }

    @Test("un code verbatim se range sous sa langue servie, sans jamais tronquer un code à trois lettres")
    func verbatimCodesFold() {
        #expect(GameAtlas.language(of: "en-US") == "en")
        #expect(GameAtlas.language(of: "pt_BR") == "pt")
        #expect(GameAtlas.language(of: "zh-Hant-HK") == "zh")
        #expect(GameAtlas.language(of: "bas") == "bas")
        #expect(GameAtlas.language(of: "ksf") == "ksf")
        #expect(GameAtlas.language(of: "eng") == "en")
        #expect(GameAtlas.language(of: "fil") == nil)
        #expect(GameAtlas.language(of: "xx") == nil)
        #expect(GameAtlas.language(of: nil) == nil)
    }

    @Test("un tampon se pose quand les DEUX sens sont échangés, et une seule fois")
    func stampNeedsBothDirections() {
        let sent = GameAtlas.apply(AtlasEvent(kind: .sent, language: "ja", dayKey: "2026-10-12"), to: [:])
        #expect(sent.stamped == nil)
        let received = GameAtlas.apply(AtlasEvent(kind: .received, language: "ja", dayKey: "2026-10-13"), to: sent.state)
        #expect(received.stamped == "ja")
        #expect(received.state["ja"]?.stampedOn == "2026-10-13")
        let again = GameAtlas.apply(AtlasEvent(kind: .received, language: "ja", dayKey: "2026-10-20"), to: received.state)
        #expect(again.stamped == nil)
        #expect(again.state["ja"]?.stampedOn == "2026-10-13")
    }
}

@Suite("Jeu Meeshy — les badges à sept paliers")
struct GameBadgeTiersTests {

    @Test("sept paliers côté client, les cinq d'origine d'abord")
    func sevenTiersWithTheLegacyFiveFirst() {
        #expect(EngagementCatalog.badgeThresholds == [1, 10, 50, 100, 500, 1000, 5000])
        #expect(Array(EngagementCatalog.badgeThresholds.prefix(5)) == EngagementCatalog.legacyBadgeThresholds)
    }

    @Test("un ancien client ne reçoit que les cinq paliers d'origine")
    func anOldClientGetsTheLegacyFive() {
        #expect(GameBadgeTiers.servedThresholds(knowsExtendedTiers: false) == [1, 10, 50, 100, 500])
        #expect(GameBadgeTiers.isExtended(1000) && GameBadgeTiers.isExtended(5000))
        #expect(!GameBadgeTiers.isExtended(500))
    }

    @Test("l'Obsidienne et le Prisme : le ruban à partir de l'Or, l'émail irisé au seul Prisme")
    func materials() {
        #expect(GameBadgeTiers.material(ofThreshold: 1000) == .obsidienne)
        #expect(GameBadgeTiers.material(ofThreshold: 5000) == .prisme)
        #expect(GameBadgeTiers.materials.filter(\.ribbon).map(\.key) == [.or, .platine, .obsidienne, .prisme])
        #expect(GameBadgeTiers.materials.filter(\.iridescent).map(\.key) == [.prisme])
    }

    @Test("une empreinte dit ce qu'il manque pour rallumer le badge")
    func imprint() {
        #expect(GameBadgeTiers.imprint(count: 963, threshold: 1000) == BadgeImprint(extinguished: true, missing: 37))
        #expect(GameBadgeTiers.imprint(count: 1000, threshold: 1000) == BadgeImprint(extinguished: false, missing: 0))
    }
}
