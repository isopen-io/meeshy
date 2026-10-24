import SwiftUI
import MeeshySDK

/// Le visage d'une identité SANS photo : initiales blanches sur le dégradé
/// d'accent. Site unique, partagé par `MeeshyAvatar` (pas de photo) et par le
/// repli de `CachedAvatarImage` (attente, échec) — la même personne garde le
/// même visage avant, pendant et après le chargement de sa photo (#12568).
struct AvatarInitialsFace: View {
    let initials: String
    let accent: String
    let secondary: String?
    let size: CGFloat
    let fontSize: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .fill(LinearGradient(
                    colors: [Color(hex: accent), secondaryColor],
                    startPoint: .topLeading, endPoint: .bottomTrailing
                ))
                .frame(width: size, height: size)
            Text(initials)
                .font(.system(size: fontSize, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        }
    }

    private var secondaryColor: Color {
        guard let secondary else { return Color(hex: accent).opacity(0.6) }
        return Color(hex: secondary)
    }
}
