import SwiftUI

// Les ondes du point de présence de `MeeshyAvatar`, tenues hors de l'avatar :
// la garde `MoodBadgeTests` y interdit toute animation infinie. Les deux ne
// sont montées que hors Reduce Motion (`MeeshyAvatar.body`).

/// Le point « ici » VIT tant que le pair est là (#9065) : une onde part de
/// lui, encore et encore — douce s'il observe, vive s'il agit ou regarde en
/// plein écran. Transform et opacité seulement.
struct PresenceHereWaveView: View {
    let color: Color
    let diameter: CGFloat
    let wave: PresenceHereWave
    @State private var spread = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: diameter, height: diameter)
            .scaleEffect(spread ? wave.peakScale : 1)
            .opacity(spread ? 0 : wave.startOpacity)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            .onAppear {
                withAnimation(.easeOut(duration: wave.duration).repeatForever(autoreverses: false)) { spread = true }
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
