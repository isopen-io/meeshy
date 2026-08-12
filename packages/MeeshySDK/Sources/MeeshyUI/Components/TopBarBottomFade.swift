import SwiftUI

// Shared top-bar bottom fade utility for MeeshyUI components.
// Mirrors the app-side implementation so MeeshyUI consumers can reference it.
public enum TopBarBottomFade {
    /// Fraction of the bottom that is fully transparent.
    public static let transparentFraction: CGFloat = 0.06
    /// Fraction of the height used for the gradient fade.
    public static let gradientFraction: CGFloat = 0.24
    /// Location (0..1 from top) where the fade starts decreasing opacity.
    public static var fadeStartLocation: CGFloat { 1 - transparentFraction - gradientFraction }
    /// Location where opacity reaches zero.
    public static var fullyTransparentLocation: CGFloat { 1 - transparentFraction }

    /// Vertical ramp black -> transparent used as scrim or mask.
    public static var gradient: LinearGradient {
        LinearGradient(
            stops: [
                .init(color: .black, location: 0),
                .init(color: .black, location: fadeStartLocation),
                .init(color: .black.opacity(0), location: fullyTransparentLocation),
                .init(color: .black.opacity(0), location: 1),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}
