import Testing
@testable import MeeshySDK

/// UN LOGO PAR TYPE (#9639) — deux axes ne partagent jamais la même icône :
/// « les amitiés nouées et les liens ont la même icône, il ne faut pas ».
struct EngagementAxisSymbolTests {

    @Test("les vingt axes portent vingt icônes distinctes")
    func everyAxisHasItsOwnSymbol() {
        let symbols = EngagementAxisKey.allCases.map(\.symbolName)
        #expect(Set(symbols).count == EngagementAxisKey.allCases.count, "deux axes partagent une icône : \(symbols)")
    }
}
