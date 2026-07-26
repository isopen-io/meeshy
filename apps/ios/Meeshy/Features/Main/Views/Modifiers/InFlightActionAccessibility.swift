import SwiftUI

extension View {
    /// Pins a confirmation button's accessible name and speaks its transient states.
    ///
    /// A button that renders `if isInFlight { ProgressView() } else { Text(…) }`
    /// **loses its accessible name** the moment the action starts: the `Text` that
    /// supplied it is gone, and a bare `ProgressView` contributes none. VoiceOver is
    /// left with an unnamed control at the exact moment the user wants to know what
    /// is happening.
    ///
    /// The name is therefore pinned here rather than inferred from the label, and the
    /// states ride on the *value* — the split Apple's own controls use, and the one
    /// `FeedView`'s publish button already followed.
    ///
    /// Pass **the key of the visible text** as `label`, never a second wording: the
    /// accessible name must contain the displayed label (WCAG 2.5.3 *Label in Name*),
    /// which is also what Voice Control matches against.
    ///
    /// - Parameters:
    ///   - label: Accessible name, stable across every state. Use the site's own
    ///     visible-text key.
    ///   - isInFlight: Whether the action is running — the same flag that swaps the
    ///     label to a `ProgressView`.
    ///   - inFlightValue: Wording spoken while running. Defaults to the shared
    ///     "En cours" string; pass a specific one when the surface has better words.
    ///   - unavailableReason: Spoken when the button is disabled, if the reason is
    ///     not otherwise perceivable. Pass `nil` when the button is operable.
    func inFlightActionAccessibility(
        _ label: String,
        isInFlight: Bool,
        inFlightValue: String? = nil,
        unavailableReason: String? = nil
    ) -> some View {
        accessibilityLabel(label)
            .accessibilityValue(
                isInFlight
                    ? (inFlightValue ?? String(localized: "a11y.action.in-progress", defaultValue: "En cours", bundle: .main))
                    : (unavailableReason ?? "")
            )
    }
}
