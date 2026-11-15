import Foundation

/// Pure helper keeping a multi-select `Set<String>` in sync with a live list
/// of ids. Selections are never read raw from `@State` — always filtered
/// through `liveSelection` — so an id that vanished mid-selection (real-time
/// deletion from another device, expiry) never inflates a bulk-action count
/// or triggers a doomed network call for a story that's already gone.
enum StorySelectionResolver {
    static func liveSelection(selectedIDs: Set<String>, liveIDs: [String]) -> Set<String> {
        selectedIDs.intersection(Set(liveIDs))
    }
}
