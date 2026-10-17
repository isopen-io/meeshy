import XCTest
@testable import MeeshyUI

/// Chaque catégorie alimente `LazyVGrid { ForEach(category.emojis, id: \.self) }` :
/// un emoji répété y donne deux cellules de même identité (comportement
/// indéfini, cellule masquée ou réutilisée, plantage sur certaines versions).
/// « 😌 » figurait deux fois dans « Visages ».
@MainActor
final class EmojiCategoryUniqueIdsTests: XCTestCase {

    func test_everyCategory_listsEachEmojiOnce() {
        for category in EmojiCategory.all {
            var seen = Set<String>()
            let duplicates = category.emojis.filter { !seen.insert($0).inserted }
            XCTAssertTrue(duplicates.isEmpty, "\(category.icon) répète \(duplicates)")
        }
    }
}
