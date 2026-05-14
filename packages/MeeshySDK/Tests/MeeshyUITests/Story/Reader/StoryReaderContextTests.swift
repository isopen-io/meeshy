import Foundation
import Testing
@testable import MeeshyUI

/// Mutable box for Sendable closures to capture.
final class Box<T>: @unchecked Sendable {
    var value: T
    init(_ value: T) { self.value = value }
}

@MainActor
struct StoryReaderContextTests {
    @Test func defaultContext_hasEmptyLanguagesAndUnmuted() {
        let ctx = StoryReaderContext.empty
        #expect(ctx.preferredLanguages.isEmpty)
        #expect(ctx.mute == false)
        #expect(ctx.onCompletion == nil)
        #expect(ctx.postMediaURLResolver == nil)
    }

    @Test func customContext_storesAllFields() {
        let firedRef = Box<Bool>(false)
        let ctx = StoryReaderContext(
            preferredLanguages: ["fr", "en"],
            mute: true,
            onCompletion: { firedRef.value = true },
            postMediaURLResolver: { _ in URL(string: "https://example.com/m.mp4") },
            imageCache: nil
        )
        #expect(ctx.preferredLanguages == ["fr", "en"])
        #expect(ctx.mute == true)
        ctx.onCompletion?()
        #expect(firedRef.value == true)
        #expect(ctx.postMediaURLResolver?("any") != nil)
    }
}
