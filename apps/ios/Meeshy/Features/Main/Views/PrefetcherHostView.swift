import SwiftUI
import UIKit
import MeeshyUI

/// Offscreen `UIViewRepresentable` that installs the
/// `StoryReaderPrefetcher.hostView` into the SwiftUI hierarchy. The host
/// occupies a 1x1 corner behind every visible layer so the prefetcher's
/// child canvas views go through a full `didMoveToWindow` cycle (image
/// decode, AVPlayer asset load, layer-tree build) without taking any
/// visible real estate.
///
/// `MeeshyUI` defaults to `@MainActor` isolation, so `StoryReaderPrefetcher`
/// is `@MainActor`. The closure is invoked synchronously inside
/// `makeUIView` on the main actor (SwiftUI guarantee), so the access is safe.
struct PrefetcherHostView: UIViewRepresentable {
    let prefetcher: StoryReaderPrefetcher

    func makeUIView(context: Context) -> UIView {
        // Wrapper so the prefetcher's host view sits behind any visible layer
        // and never affects layout/hit-testing of the SwiftUI tree.
        let container = UIView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        container.isUserInteractionEnabled = false
        container.clipsToBounds = true
        container.alpha = 0
        container.accessibilityElementsHidden = true
        prefetcher.attach(to: container)
        return container
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        // Idempotent — `attach(to:)` short-circuits if already parented.
        prefetcher.attach(to: uiView)
    }
}
