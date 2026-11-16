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
    /// La bannière tirée puis relâchée revient à sa place : un ressort court, avec le dépassement qui fait sentir l'élastique (#18721).
    public nonisolated static let bannerPullReturn = Animation.spring(response: 0.36, dampingFraction: 0.66)
    /// La bannière qui devient la conversation : la carte grandit jusqu'à l'écran sans rebondir, le cadre ne doit pas trembler.
    public nonisolated static let bannerPullMorph = Animation.spring(response: 0.42, dampingFraction: 0.92)
    /// L'enveloppe arrivée au plein écran s'efface devant la conversation posée dessous, sans disparaître d'une image.
    public nonisolated static let bannerMorphFade = Animation.easeOut(duration: 0.24)
    /// L'aperçu d'appui long qui naît de la ligne (#18722) : le cadre de la rangée s'étend jusqu'à la carte en un zoom qu'on VOIT (mesuré au simulateur : à 0,42 la carte était posée en 250 ms), et se pose sans trembler.
    public nonisolated static let previewMorph = Animation.spring(response: 0.5, dampingFraction: 0.86)
    /// Le retrait de l'aperçu : la carte redevient la ligne plus vite qu'elle n'en est née, et la rejoint avant que l'overlay ne se retire.
    public nonisolated static let previewMorphReturn = Animation.spring(response: 0.3, dampingFraction: 0.8)
    /// La carte d'aperçu qui recule quand le menu s'étend et revient quand il se réduit (#18723) : le maillon qui suit le menu dans la chaîne élastique franche du menu flottant (deux rangs de retard, même amorti), pour qu'elle arrive après lui et dépasse sa place.
    public nonisolated static let menuSpring = Animation.spring(
        response: FloatingMenuLadderFollow.firstRungResponse + 2 * FloatingMenuLadderFollow.responseStepPerRung,
        dampingFraction: FloatingMenuLadderFollow.dampingFraction
    )
    /// L'aperçu tiré qui décroche en ligne déplaçable (#18724) : la ligne saute vers le doigt et le suit comme le premier barreau de la chaîne élastique franche — elle colle presque, dépasse un peu sa place, puis s'y pose.
    public nonisolated static let peekDetach = Animation.spring(
        response: FloatingMenuLadderFollow.firstRungResponse,
        dampingFraction: FloatingMenuLadderFollow.dampingFraction
    )
    /// L'aperçu tiré puis relâché avant le décrochage revient à sa place : un ressort court qui fait sentir l'élastique sans trembler.
    public nonisolated static let peekDetachReturn = Animation.spring(response: 0.32, dampingFraction: 0.72)
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
