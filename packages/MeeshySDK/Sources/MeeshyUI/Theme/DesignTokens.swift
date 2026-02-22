import SwiftUI

// MARK: - Spacing

public enum MeeshySpacing {
    public static let xs: CGFloat = 4
    public static let sm: CGFloat = 8
    public static let md: CGFloat = 12
    public static let lg: CGFloat = 16
    public static let xl: CGFloat = 20
    public static let xxl: CGFloat = 24
    public static let xxxl: CGFloat = 32
}

// MARK: - Corner Radius

public enum MeeshyRadius {
    public static let sm: CGFloat = 10
    public static let md: CGFloat = 14
    public static let lg: CGFloat = 18
    public static let xl: CGFloat = 20
    public static let xxl: CGFloat = 24
    public static let full: CGFloat = .infinity
}

// MARK: - Typography Sizes

public enum MeeshyFont {
    public static let captionSize: CGFloat = 10
    public static let footnoteSize: CGFloat = 11
    public static let subheadSize: CGFloat = 13
    public static let bodySize: CGFloat = 15
    public static let headlineSize: CGFloat = 17
    public static let titleSize: CGFloat = 22
    public static let largeTitleSize: CGFloat = 34
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
