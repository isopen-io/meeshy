import Testing
import SwiftUI
@testable import MeeshyUI

/// Locks the geometry contract of the "emerge from the notch" reveal used by
/// the in-app FeedbackToast (action feedback: "post sent", "changes saved"…).
///
/// The transition can't be inspected directly (`AnyTransition` is opaque), so
/// these tests pin the named geometry the transition is built from — the same
/// approach `AttachmentDisplayTests` uses for design constants. If someone
/// flips the anchor to `.bottom` or makes the toast shrink instead of grow,
/// these break.
@Suite("FeedbackToastReveal")
struct FeedbackToastRevealTests {

    @Test("emerges from the top — the notch / Dynamic Island, never the bottom or center")
    func anchor_is_top() {
        #expect(FeedbackToastReveal.anchor == .top)
    }

    @Test("starts collapsed and grows to full size on entry")
    func collapsed_scale_grows_to_full() {
        #expect(FeedbackToastReveal.collapsedScale > 0)
        #expect(FeedbackToastReveal.collapsedScale < 1)
    }

    @Test("offset pulls the toast up toward the notch on entry, and back up on exit")
    func notch_offset_is_positive() {
        // Applied as `-notchOffset` on the Y axis in the transition (toward the
        // top of the screen / the notch). A positive magnitude keeps the intent
        // unambiguous regardless of the sign convention at the call site.
        #expect(FeedbackToastReveal.notchOffset > 0)
    }
}
