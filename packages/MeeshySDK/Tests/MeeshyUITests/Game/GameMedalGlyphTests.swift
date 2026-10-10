import Testing
import MeeshySDK
@testable import MeeshyUI

/// UN GLYPHE PAR AXE (#9639) — la médaille d'un badge dessine le pictogramme de
/// SON axe, jamais celui de sa famille : liens, partages, invités et amitiés ne
/// se confondent plus, ni les quatre conversations, ni les cinq outils. Miroir
/// de `apps/web/src/lib/game/medal.ts` (`MEDAL_PICTOGRAMS`).
struct GameMedalGlyphTests {

    @Test("vingt axes, vingt glyphes : deux axes ne partagent jamais un pictogramme")
    func everyAxisHasItsOwnGlyph() {
        let glyphs = EngagementAxisKey.allCases.map(GameMedalGlyph.init(axis:))
        #expect(Set(glyphs).count == EngagementAxisKey.allCases.count)
        #expect(GameMedalGlyph.allCases.count == EngagementAxisKey.allCases.count)
    }

    @Test("le glyphe nomme son axe, comme sur le web")
    func glyphNamesMatchTheWeb() {
        #expect(GameMedalGlyph(axis: .friendship).webName == "friendship")
        #expect(GameMedalGlyph(axis: .trackedLink).webName == "link")
        #expect(GameMedalGlyph(axis: .groupCreated).webName == "group")
        #expect(Set(GameMedalGlyph.allCases.map(\.webName)).count == GameMedalGlyph.allCases.count)
    }
}
