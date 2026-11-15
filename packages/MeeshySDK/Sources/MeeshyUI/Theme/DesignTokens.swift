import SwiftUI

// MARK: - Spacing

public nonisolated enum MeeshySpacing {
    public static let xxs: CGFloat = 2
    public static let xs: CGFloat = 4
    public static let xsPlus: CGFloat = 6
    public static let sm: CGFloat = 8
    public static let smPlus: CGFloat = 10
    public static let md: CGFloat = 12
    public static let mdPlus: CGFloat = 14
    public static let lg: CGFloat = 16
    public static let xl: CGFloat = 20
    public static let xxl: CGFloat = 24
    public static let xxxl: CGFloat = 32
}

// MARK: - Corner Radius

public nonisolated enum MeeshyRadius {
    public static let xxs: CGFloat = 4
    public static let xs: CGFloat = 8
    public static let sm: CGFloat = 10
    public static let smPlus: CGFloat = 12
    public static let md: CGFloat = 14
    public static let lg: CGFloat = 16
    public static let lgPlus: CGFloat = 18
    public static let xl: CGFloat = 20
    public static let xlPlus: CGFloat = 22
    public static let xxl: CGFloat = 24
    public static let full: CGFloat = .infinity
}

// MARK: - Typography Sizes

public nonisolated enum MeeshyFont {
    public static let microSize: CGFloat = 9
    public static let captionSize: CGFloat = 10
    public static let footnoteSize: CGFloat = 11
    public static let smallSize: CGFloat = 12
    public static let subheadSize: CGFloat = 13
    public static let labelSize: CGFloat = 14
    public static let bodySize: CGFloat = 15
    public static let calloutSize: CGFloat = 16
    public static let headlineSize: CGFloat = 17
    public static let subtitleSize: CGFloat = 18
    public static let title3Size: CGFloat = 20
    public static let titleSize: CGFloat = 22
    public static let displaySize: CGFloat = 28
    public static let largeTitleSize: CGFloat = 34
}

// MARK: - Icon Sizes (SF Symbols)

public nonisolated enum MeeshyIconSize {
    public static let xxs: CGFloat = 10
    public static let xs: CGFloat = 12
    public static let sm: CGFloat = 14
    public static let md: CGFloat = 16
    public static let lg: CGFloat = 18
    public static let xl: CGFloat = 20
    public static let xxl: CGFloat = 22
    public static let xxxl: CGFloat = 28
    public static let hero: CGFloat = 48
}

// MARK: - Control Sizes

public nonisolated enum MeeshyControlSize {
    public static let small: CGFloat = 28
    public static let compact: CGFloat = 32
    public static let regular: CGFloat = 36
    public static let large: CGFloat = 40
    public static let tapTarget: CGFloat = 44
    public static let buttonHeight: CGFloat = 52
}

// MARK: - Border Widths

public nonisolated enum MeeshyBorder {
    public static let hairline: CGFloat = 0.5
    public static let regular: CGFloat = 1
    public static let emphasis: CGFloat = 1.5
    public static let strong: CGFloat = 2
}

// MARK: - Opacities

public nonisolated enum MeeshyOpacity {
    public static let faint: Double = 0.04
    public static let subtle: Double = 0.08
    public static let light: Double = 0.15
    public static let medium: Double = 0.3
    public static let strong: Double = 0.5
    public static let heavy: Double = 0.7
    public static let intense: Double = 0.85
}

// MARK: - Shadows

public enum MeeshyShadow {
    public static let subtle = (opacity: 0.1, radius: 4.0, y: 2.0)
    public static let medium = (opacity: 0.2, radius: 8.0, y: 4.0)
    public static let strong = (opacity: 0.3, radius: 12.0, y: 6.0)
}

// MARK: - Animations

public enum MeeshyAnimation {
    public static let springFast = Animation.spring(response: 0.25, dampingFraction: 0.7)
    public static let springDefault = Animation.spring(response: 0.4, dampingFraction: 0.75)
    public static let springBouncy = Animation.spring(response: 0.5, dampingFraction: 0.6)
    public static let staggerDelay: Double = 0.04
}

// MARK: - iPad Layout

public nonisolated enum MeeshyLayout {
    public static let formMaxWidth: CGFloat = 600
    public static let contentMaxWidth: CGFloat = 700
}

extension View {
    /// Constrains content to a readable width on iPad, centered in the available space.
    /// No effect on compact width (iPhone).
    public func iPadFormWidth(_ maxWidth: CGFloat = MeeshyLayout.formMaxWidth) -> some View {
        frame(maxWidth: maxWidth)
            .frame(maxWidth: .infinity)
    }
}
