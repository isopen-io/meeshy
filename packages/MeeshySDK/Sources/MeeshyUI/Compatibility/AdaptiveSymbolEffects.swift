import SwiftUI

// MARK: - Adaptive SF Symbol effects

/// SF Symbol animation effects (`symbolEffect`) require iOS 17. These wrappers
/// apply the real effect on iOS 17+ and degrade to a no-op on iOS 16.
///
/// Symbol effects are purely decorative: their absence on iOS 16 changes
/// nothing functional. The iOS 17+ branch is the exact pre-existing call so
/// rendering on current OS versions is unchanged.
public extension View {
    /// iOS 17+: `.symbolEffect(.bounce, value:)`. iOS 16: no-op.
    ///
    /// Triggers a one-shot bounce whenever `value` changes.
    @ViewBuilder
    func adaptiveSymbolBounce(value: some Equatable) -> some View {
        if #available(iOS 17.0, *) {
            symbolEffect(.bounce, value: value)
        } else {
            self
        }
    }

    /// iOS 17+: repeating `.symbolEffect(.pulse, options: .repeating)`.
    /// iOS 16: no-op.
    @ViewBuilder
    func adaptiveSymbolPulse() -> some View {
        if #available(iOS 17.0, *) {
            symbolEffect(.pulse, options: .repeating)
        } else {
            self
        }
    }
}
