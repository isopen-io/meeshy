import Foundation

/// NSCache requires reference-type values. This wraps `Data` (the only
/// concrete instantiation across the codebase — `DiskCacheStore`).
///
/// NOTE — kept NON-GENERIC on purpose. The previous generic form
/// (`CacheBox<T: Sendable>`) is the same shape that tripped a Swift 6.3.2
/// optimizer crash on `WeakBox<T>` and `FABPanGestureWrapper<Content>.Coordinator`
/// (EarlyPerfInliner / isCallerAndCalleeLayoutConstraintsCompatible on the
/// synthesized deinit, under Release `-O -whole-module-optimization`). With a
/// single concrete instantiation the generic was gratuitous — typing on
/// `Data` directly removes the trigger entirely.
final class CacheBox: NSObject {
    let value: Data
    init(_ value: Data) { self.value = value }
}
