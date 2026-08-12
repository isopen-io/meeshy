import XCTest
@testable import Meeshy

/// Tests for `EmojiGridCategory.localizedName` — the VoiceOver accessibility
/// label of the icon-only category tabs in the emoji picker.
///
/// The tabs carry no visible text, so `localizedName` is the *only* thing
/// VoiceOver announces. These cases are locale-resilient (they assert the
/// shape of the mapping, not specific translations, which vary by run locale):
/// every case must resolve to a non-empty, distinct name so no category is
/// ever announced as another, and identity (`rawValue`) stays decoupled from
/// the display layer.
///
/// `@MainActor` because the project default `SWIFT_DEFAULT_ACTOR_ISOLATION =
/// MainActor` makes `localizedName` main-actor-isolated, while the test bundle
/// runs nonisolated by default (mirrors `ContactCardViewTests`).
@MainActor
final class EmojiGridCategoryTests: XCTestCase {

    func test_localizedName_isNonEmptyForEveryCase() {
        for category in EmojiGridCategory.allCases {
            XCTAssertFalse(
                category.localizedName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                "Category \(category.rawValue) must expose a non-empty accessibility name"
            )
        }
    }

    func test_localizedName_isUniqueAcrossCases() {
        let names = EmojiGridCategory.allCases.map(\.localizedName)
        XCTAssertEqual(
            Set(names).count,
            EmojiGridCategory.allCases.count,
            "Each category must announce a distinct name so VoiceOver never confuses two"
        )
    }

    func test_localizedName_doesNotLeakStorageRawValue() {
        // `rawValue` is the storage/identity key and stays stable; localizing
        // a category must not silently mutate it.
        XCTAssertEqual(EmojiGridCategory.people.rawValue, "Personnes")
        XCTAssertEqual(EmojiGridCategory.recent.rawValue, "Recents")
    }

    func test_localizedName_coversAllCategoriesIncludingRecent() {
        // `allCases` drives the tab strip; guard that the switch is exhaustive
        // (a missing case would not compile, but this pins the count too).
        XCTAssertEqual(EmojiGridCategory.allCases.count, 10)
        for category in EmojiGridCategory.allCases {
            _ = category.localizedName
        }
    }
}
