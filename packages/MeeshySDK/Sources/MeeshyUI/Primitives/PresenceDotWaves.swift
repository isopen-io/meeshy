import SwiftUI

// Les ondes du point de présence de `MeeshyAvatar`, tenues hors de l'avatar :
// la garde `MoodBadgeTests` y interdit toute animation infinie. Les deux ne
// sont montées que hors Reduce Motion (`MeeshyAvatar.body`).

/// Le point « ici » VIT tant que le pair regarde, écoute ou agit (#9061) : une
/// onde part de lui, encore et encore, et s'arrête avec l'activité (la vue est
/// retirée). Transform et opacité seulement.
struct PresenceActivityPulse: View {
    let color: Color
    let diameter: CGFloat
    @State private var spread = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: diameter, height: diameter)
            .scaleEffect(spread ? 2.2 : 1)
            .opacity(spread ? 0 : 0.55)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear {
                withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) { spread = true }
            }
    }
}

/// L'onde du point « ici » à son arrivée (#9047) : un anneau part du point,
/// s'élargit et s'éteint, une fois. Transform et opacité seulement.
struct PresenceArrivalRipple: View {
    let color: Color
    let diameter: CGFloat
    @State private var spread = false

    var body: some View {
        Circle()
            .stroke(color, lineWidth: 2)
            .frame(width: diameter, height: diameter)
            .scaleEffect(spread ? 2.6 : 1)
            .opacity(spread ? 0 : 0.9)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear {
                withAnimation(.easeOut(duration: 0.8).delay(0.15)) { spread = true }
            }
    }
}
