import Foundation

// MARK: - StoryViewerInitialAction
//
// Side-effect the StoryViewerView should perform on first appear when it has
// been opened from a notification flow (Phase F). The notification target
// screen for an *active* story redirects the user straight into the existing
// viewer, but it must auto-open either the comments overlay or the viewers /
// reactions sheet so the user lands on the surface that maps to the
// notification trigger (a comment vs. a reaction).
//
// `nil` is the legacy path — opening the viewer normally (no auto-action).
// Hashable is sufficient: the value is forwarded through `StoryViewerRequest`
// (already Equatable) and inspected once on `.onAppear`. Codable is not
// required by any current flow and is intentionally omitted to keep the type
// narrow.

public enum StoryViewerInitialAction: Hashable {
    case showCommentsOverlay
    case showViewersSheet
}
