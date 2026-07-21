import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct AchievementBadgeView: View {
    let achievement: Achievement

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
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
                    // doctrine 86i — icône bornée par le cercle de progression fixe 56×56
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(
                        achievement.isUnlocked
                            ? Color(hex: achievement.color)
                            : theme.textMuted.opacity(0.4)
                    )
            }

            Text(achievement.name)
                .font(MeeshyFont.relative(11, weight: .bold))
                .foregroundColor(
                    achievement.isUnlocked ? Color(hex: achievement.color) : theme.textMuted
                )
                .lineLimit(1)

            Text("\(achievement.current)/\(achievement.threshold)")
                .font(MeeshyFont.relative(9, weight: .medium, design: .rounded))
                .foregroundColor(theme.textMuted)
        }
        .padding(.vertical, MeeshySpacing.md)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.md)
                .fill(theme.surfaceGradient(tint: achievement.isUnlocked ? achievement.color : "808080"))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.md)
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
        .accessibilityLabel("\(achievement.name), \(achievement.isUnlocked ? String(localized: "achievement.unlocked", defaultValue: "unlocked", bundle: .main) : String(localized: "achievement.locked", defaultValue: "locked", bundle: .main)), \(achievement.current) \(String(localized: "achievement.outOf", defaultValue: "of", bundle: .main)) \(achievement.threshold)")
    }
}
