import SwiftUI

/// Shape animable pour l'effet de révélation circulaire.
nonisolated struct RevealCircleShape: Shape {
    var progress: CGFloat  // 0 = cercle invisible, 1 = plein écran

    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func path(in rect: CGRect) -> Path {
        let maxRadius = sqrt(rect.width * rect.width + rect.height * rect.height)
        let radius = maxRadius * progress
        let center = CGPoint(x: rect.midX, y: rect.midY)
        return Path(ellipseIn: CGRect(
            x: center.x - radius, y: center.y - radius,
            width: radius * 2, height: radius * 2
        ))
    }
}
