import SwiftUI

/// Presentation style for the audience picker sheet (ONLY / EXCEPT user
/// selection). Two product requirements drive it:
///
/// 1. **Translucent** — the composer behind stays partly visible
///    (`presentationBackground(.ultraThinMaterial)`, iOS 16.4+).
/// 2. **Composer header always visible** — the sheet never covers the top bar:
///    the detents cap below full height (`.medium` / `.fraction(0.85)`, NO
///    `.large`), so the story composer's visibility/publish header stays on
///    screen and reachable above the sheet.
///
/// All version gating lives here (Compatibility/) per the SDK convention: the
/// compiler needs a real `if #available` to unlock a version-restricted symbol.
/// - iOS 16.0–16.3: detents + drag indicator only (no translucent background API).
/// - iOS 16.4+: adds `.ultraThinMaterial` background, scroll interaction, rounded
///   corners — through iOS 26 unchanged.
public struct AudiencePickerPresentationStyle: ViewModifier {
    public init() {}

    public func body(content: Content) -> some View {
        if #available(iOS 16.4, *) {
            content
                .presentationDetents([.medium, .fraction(0.85)])
                .presentationDragIndicator(.visible)
                .presentationBackground(.ultraThinMaterial)
                .presentationContentInteraction(.scrolls)
                .presentationCornerRadius(28)
        } else {
            content
                .presentationDetents([.medium, .fraction(0.85)])
                .presentationDragIndicator(.visible)
        }
    }
}
