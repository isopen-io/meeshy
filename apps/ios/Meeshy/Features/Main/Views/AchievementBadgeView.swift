import SwiftUI
import MeeshySDK

struct AchievementBadgeView: View {
    let achievement: Achievement

    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .stroke(
                        achievement.isUnlocked
                            ? Color(hex: achievement.color)
                            : theme.textMuted.opacity(0.2),
                        lineWidth: 3
                    )
                    .frame(width: 56, height: 56)

                Circle()
                    .trim(from: 0, to: achievement.progress)
                    .stroke(Color(hex: achievement.color), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .frame(width: 56, height: 56)
                    .rotationEffect(.degrees(-90))

                Image(systemName: achievement.icon)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(
                        achievement.isUnlocked
                            ? Color(hex: achievement.color)
                            : theme.textMuted.opacity(0.4)
                    )
            }

            Text(achievement.name)
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(
                    achievement.isUnlocked ? Color(hex: achievement.color) : theme.textMuted
                )
                .lineLimit(1)

            Text("\(achievement.current)/\(achievement.threshold)")
                .font(.system(size: 9, weight: .medium, design: .rounded))
                .foregroundColor(theme.textMuted)
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: achievement.isUnlocked ? achievement.color : "808080"))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(
                            achievement.isUnlocked
                                ? Color(hex: achievement.color).opacity(0.3)
                                : theme.textMuted.opacity(0.1),
                            lineWidth: 1
                        )
                )
        )
        .opacity(achievement.isUnlocked ? 1 : 0.7)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(achievement.name), \(achievement.isUnlocked ? "debloque" : "verrouille"), \(achievement.current) sur \(achievement.threshold)")
    }
}
