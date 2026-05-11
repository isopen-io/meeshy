import Foundation
import CoreGraphics

/// One-shot migration helpers for converting legacy story data to the new model contract.
///
/// **Pre-launch context:** Stories existantes obsolètes, but in-flight composer state
/// or test fixtures may need conversion from legacy point-based sizes (textSize in
/// iPhone 16 Pro points at 412pt-wide canvas) to design pixels (1080-wide reference).
public enum StoryModelMigration {

    /// Computes a default `fontSize` in design pixels from a legacy `textSize` value
    /// expressed in iPhone 16 Pro points (412pt canvas width reference).
    ///
    /// Heuristic: legacy `textSize: 28pt` (default) was authored on iPhone 16 Pro
    /// (412pt wide canvas) → relative `28 / 412 ≈ 0.068` → applied to designWidth `1080`
    /// → ≈ 73.5 design px. Practical default is rounded to 64.
    ///
    /// Use this helper when migrating in-memory drafts authored with the old API.
    public static func fontSizeFromLegacyPoints(_ legacyPt: CGFloat) -> Double {
        // 412pt iPhone 16 Pro reference width
        Double(legacyPt) * (1080.0 / 412.0)
    }

    /// Assigns sequential `zIndex` values to a collection of items in array order.
    /// Useful for promoting legacy `Int?` zIndex (where `nil` meant "use array index")
    /// to the non-optional `Int` field after migration.
    ///
    /// - Parameters:
    ///   - items: The collection to mutate.
    ///   - setter: Closure that assigns the index to a single item.
    public static func assignSequentialZIndex<T>(_ items: inout [T], setter: (inout T, Int) -> Void) {
        for i in items.indices {
            setter(&items[i], i)
        }
    }
}
