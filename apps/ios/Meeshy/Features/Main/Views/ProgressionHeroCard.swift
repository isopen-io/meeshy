import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le héros du tableau de bord** (#5831) — le dernier succès obtenu, à son
/// échelle, en tête de l'écran.
///
/// Sans lui, `ProgressionView` listait : le succès décroché ce matin pesait
/// exactement autant qu'un succès encore verrouillé, dans la même rangée, à la
/// même taille. Un écran de progression qui ne distingue pas ce qui vient
/// d'arriver ne donne aucune raison d'y revenir — il compte, il ne raconte pas.
///
/// Quand rien n'est encore débloqué, le héros ne DISPARAÎT pas : il montre le
/// prochain palier et ce qu'il demande. C'est exactement à quelqu'un qui n'a
/// rien obtenu qu'il faut dire quoi faire — un trou à cet endroit-là serait le
/// pire des états vides.
struct ProgressionHeroCard: View {
    let achievement: EngagementAchievementProgress
    let onOpen: () -> Void

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    private var teinte: Color {
        achievement.unlocked ? MeeshyColors.purple500 : MeeshyColors.textMuted(isDark: isDark)
    }

    /// La ligne sous le titre : la DATE quand il est obtenu, la CONDITION
    /// sinon. Jamais les deux, jamais un libellé générique — dans les deux cas
    /// c'est la seule information que le lecteur n'a pas déjà.
    private var sousTitre: String {
        guard achievement.unlocked else { return ProgressionCopy.condition(for: achievement.key) }
        return ProgressionCopy.obtained(achievement.reachedAt)
            ?? String(localized: "progression.unlocked", defaultValue: "Débloqué", bundle: .main)
    }

    private var bandeau: String {
        achievement.unlocked
            ? String(localized: "progression.hero.latest", defaultValue: "Dernier succès", bundle: .main)
            : String(localized: "progression.hero.next", defaultValue: "Prochain succès", bundle: .main)
    }

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: MeeshySpacing.lg) {
                médaille
                VStack(alignment: .leading, spacing: 4) {
                    Text(bandeau.uppercased())
                        .font(MeeshyFont.relative(10, weight: .bold, design: .rounded))
                        .tracking(1.2)
                        .foregroundColor(teinte)
                    Text(ProgressionCopy.title(for: achievement.key))
                        .font(MeeshyFont.relative(19, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                        .multilineTextAlignment(.leading)
                    Text(sousTitre)
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundColor(theme.textMuted)
                    .accessibilityHidden(true)
            }
            .padding(MeeshySpacing.lg)
            // 44 pt de cible minimum — la carte les dépasse largement, mais la
            // borne est écrite plutôt que supposée : une variante compacte à
            // venir la respecterait sans qu'on ait à y repenser.
            .frame(minHeight: 44)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(theme.surfaceGradient(tint: achievement.unlocked ? "8B5CF6" : "808080"))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                            .stroke(teinte.opacity(achievement.unlocked ? 0.35 : 0.15), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(bandeau). \(ProgressionCopy.title(for: achievement.key)). \(sousTitre)")
        .accessibilityHint(String(localized: "progression.hero.a11y.hint",
                                  defaultValue: "Touchez pour voir ce succès en grand.",
                                  bundle: .main))
        .accessibilityAddTraits(.isButton)
    }

    private var médaille: some View {
        ZStack {
            Circle()
                .fill(LinearGradient(colors: [teinte, teinte.opacity(0.55)],
                                     startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 60, height: 60)
                .shadow(color: teinte.opacity(achievement.unlocked ? 0.4 : 0), radius: 12, y: 4)
            Image(systemName: achievement.unlocked ? "rosette" : "lock.fill")
                .font(MeeshyFont.relative(26, weight: .semibold))
                .foregroundColor(.white)
        }
        .accessibilityHidden(true)
    }
}
