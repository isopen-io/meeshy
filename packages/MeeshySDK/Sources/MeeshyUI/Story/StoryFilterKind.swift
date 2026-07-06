import Foundation
import MeeshySDK

/// Which story filter a slide's `StoryEffects.filter` actually renders.
///
/// Bridges the persisted `StoryFilter` vocabulary (what `StoryEffects.filter`
/// stores — "vintage", "bw", … — written by the filter grid via
/// `applyFilter(filter.rawValue)`) to the two filters that are truly applied:
/// `StorySlideRenderer.applyActiveFilter` (snapshot/thumbHash) and the reader
/// both switch on this. Only `vintage` and `bw` ship a filter; every other
/// `StoryFilter` returns `nil` (composite left untouched), matching the viewer.
///
/// Extracted from the former `StoryFilteredLayer.Kind` — the `CAMetalLayer`
/// real-time-preview path it belonged to was dead (never instantiated; filters
/// are baked via CoreImage at stamp time since 2026-06-03), so the layer and its
/// Metal-pipeline machinery were removed and this discriminator lives on alone.
public enum StoryFilterKind: Sendable, CaseIterable {
    case vintage
    case bwContrast

    public nonisolated init?(storyFilter raw: String?) {
        guard let raw, let filter = StoryFilter(rawValue: raw) else { return nil }
        switch filter {
        case .vintage: self = .vintage
        case .bw:      self = .bwContrast
        case .warm, .cool, .dramatic, .vivid, .fade, .chrome:
            return nil
        }
    }
}
