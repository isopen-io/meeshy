import SwiftUI

// MARK: - Adaptive onChange

/// The two-parameter `onChange(of:initial:_:)` — closure `(oldValue, newValue)`
/// — is iOS 17+. iOS 16 only has the single-parameter, now-deprecated
/// `onChange(of:perform:)`, which hands back the new value alone.
///
/// `adaptiveOnChange` exposes the iOS 17 shape everywhere: on iOS 17+ it calls
/// the real modifier verbatim (no behaviour change on current OS versions); on
/// iOS 16 it tracks the previous value itself so callers still receive
/// `(oldValue, newValue)`.
public extension View {
    /// Drop-in replacement for `onChange(of:initial:_:)` with the two-parameter
    /// `(oldValue, newValue)` closure, available down to iOS 16.
    @ViewBuilder
    func adaptiveOnChange<V: Equatable>(
        of value: V,
        initial: Bool = false,
        _ action: @escaping (V, V) -> Void
    ) -> some View {
        if #available(iOS 17.0, *) {
            onChange(of: value, initial: initial, action)
        } else {
            modifier(LegacyOnChangeModifier(value: value, initial: initial, action: action))
        }
    }
}

/// iOS 16 backport: the deprecated `onChange(of:perform:)` only surfaces the new
/// value, so the previous value is held in `@State` to reconstruct the
/// `(oldValue, newValue)` pair. When `initial` is `true` the action also fires
/// once on first appearance with `(value, value)`, matching iOS 17 semantics.
private struct LegacyOnChangeModifier<V: Equatable>: ViewModifier {
    let value: V
    let initial: Bool
    let action: (V, V) -> Void

    @State private var previous: V?

    func body(content: Content) -> some View {
        content
            .onAppear {
                guard previous == nil else { return }
                previous = value
                if initial { action(value, value) }
            }
            .onChange(of: value) { newValue in
                let oldValue = previous ?? newValue
                previous = newValue
                action(oldValue, newValue)
            }
    }
}
