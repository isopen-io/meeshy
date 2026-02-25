import SwiftUI
import MeeshySDK

/// Badge circulaire pour afficher un achievement avec progress ring.
///
/// Design:
/// - Badge 60x60pt avec fond coloré (couleur achievement)
/// - Icône SF Symbol centré
/// - Progress ring autour du badge
/// - État locked (opacité 0.4, pas de checkmark) vs unlocked (opacité 1.0, checkmark)
/// - Animation pulse pour unlocked
public struct AchievementBadge: View {
    private let achievement: Achievement
    @ObservedObject private var theme = ThemeManager.shared

    public init(achievement: Achievement) {
        self.achievement = achievement
    }

    public var body: some View {
        ZStack {
            // Progress ring background
            Circle()
                .stroke(Color(hex: achievement.color).opacity(0.2), lineWidth: 3)
                .frame(width: 68, height: 68)

            // Progress ring foreground
            if achievement.progress > 0 {
                Circle()
                    .trim(from: 0, to: achievement.progress)
                    .stroke(
                        Color(hex: achievement.color),
                        style: StrokeStyle(lineWidth: 3, lineCap: .round)
                    )
                    .frame(width: 68, height: 68)
                    .rotationEffect(.degrees(-90))
            }

            // Badge background
            Circle()
                .fill(
                    LinearGradient(
                        colors: [
                            Color(hex: achievement.color),
                            Color(hex: achievement.color).opacity(0.7)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 60, height: 60)
                .opacity(achievement.isUnlocked ? 1.0 : 0.4)

            // Icon
            Image(systemName: achievement.icon)
                .font(.system(size: 24, weight: .semibold))
                .foregroundColor(.white)
                .opacity(achievement.isUnlocked ? 1.0 : 0.4)

            // Checkmark overlay for unlocked
            if achievement.isUnlocked {
                VStack {
                    Spacer()
                    HStack {
                        Spacer()
                        Circle()
                            .fill(MeeshyColors.pink)
                            .frame(width: 20, height: 20)
                            .overlay(
                                Image(systemName: "checkmark")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundColor(.white)
                            )
                            .shadow(color: MeeshyColors.pink.opacity(0.4), radius: 4)
                    }
                }
                .frame(width: 60, height: 60)
            }
        }
        .shadow(
            color: Color(hex: achievement.color).opacity(achievement.isUnlocked ? 0.3 : 0.1),
            radius: 8,
            y: 4
        )
        .pulse(intensity: achievement.isUnlocked ? 0.06 : 0)
    }
}

// MARK: - Preview

#if DEBUG
struct AchievementBadge_Previews: PreviewProvider {
    static var previews: some View {
        VStack(spacing: 20) {
            AchievementBadge(
                achievement: Achievement(
                    id: "1",
                    name: "First Message",
                    description: "Send your first message",
                    icon: "paperplane.fill",
                    color: "FF2E63",
                    isUnlocked: true,
                    progress: 1.0,
                    threshold: 1,
                    current: 1
                )
            )

            AchievementBadge(
                achievement: Achievement(
                    id: "2",
                    name: "Translator",
                    description: "Translate 100 messages",
                    icon: "globe",
                    color: "08D9D6",
                    isUnlocked: false,
                    progress: 0.65,
                    threshold: 100,
                    current: 65
                )
            )

            AchievementBadge(
                achievement: Achievement(
                    id: "3",
                    name: "Social Butterfly",
                    description: "Join 10 conversations",
                    icon: "person.3.fill",
                    color: "A855F7",
                    isUnlocked: false,
                    progress: 0.0,
                    threshold: 10,
                    current: 0
                )
            )
        }
        .padding()
        .background(Color.black)
    }
}
#endif
