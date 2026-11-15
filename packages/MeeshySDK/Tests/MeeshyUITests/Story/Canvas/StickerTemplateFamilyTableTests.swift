import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// LOT-22 — **le registre est l'union des tables de famille, ni plus ni moins.**
@MainActor
final class StickerTemplateFamilyTableTests: XCTestCase {

    func test_everyFamily_drawsExactlyItsCatalogTemplates() {
        for famille in StickerTemplateFamily.allCases {
            let dessinés = Set(StickerTemplateFamilyTable.drawers(for: famille).map(\.id))
            let catalogués = Set(StickerTemplateCatalog.templates(family: famille).map(\.id))
            XCTAssertEqual(dessinés, catalogués, "\(famille)")
        }
    }

    func test_registry_isExactlyTheUnionOfTheFamilyTables() {
        let tous = StickerTemplateFamily.allCases
            .flatMap { StickerTemplateFamilyTable.drawers(for: $0).map(\.id) }
        XCTAssertEqual(tous.count, Set(tous).count, "un id est dessiné par deux familles")
        XCTAssertEqual(StickerTemplateRenderer.drawableTemplateIDs, Set(tous))
        XCTAssertEqual(tous.count, StickerTemplateCatalog.all.count)
    }

    func test_everyFamilyType_declaresItsOwnFamily() {
        for famille in StickerTemplateFamily.allCases {
            XCTAssertEqual(StickerTemplateFamilyTable.drawing(for: famille).family, famille)
        }
    }
}
