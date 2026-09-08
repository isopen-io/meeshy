import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les briques de l'écran « Progression » (#5698)
//
// Des vues FEUILLES : aucun `@ObservedObject` sur un singleton, des valeurs
// passées en `let` — la règle « Zero Unnecessary Re-render » des Instant App
// Principles. Le thème se lit par une propriété calculée, jamais observée.

/// Une carte teintée — la même surface que `UserStatsView.statCard` et les
/// sections de `SettingsView` : dégradé du thème dans la teinte, filet 1 pt.
struct ProgressionCard<Content: View>: View {
    let tint: Color
    @ViewBuilder let content: () -> Content

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        content()
            .padding(MeeshySpacing.md + 2)
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.md)
                    .fill(theme.surfaceGradient(tint: tint))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.md)
                            .stroke(theme.border(tint: tint), lineWidth: 1)
                    )
            )
    }
}

/// UNE BARRE DE PALIER — la fraction parcourue entre deux paliers, dans la
/// teinte de son échelle. C'est une information, pas un ornement : VoiceOver
/// la lit avec sa valeur, le libellé est celui de l'échelle, jamais un
/// pourcentage recopié.
struct ProgressionBar: View {
    let progress: Double
    let tint: Color
    let label: String

    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Capsule().fill(tint.opacity(0.18))
                Capsule()
                    .fill(tint)
                    .frame(width: geometry.size.width * min(1, max(0, progress)))
            }
        }
        .frame(height: 6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue("\(Int((min(1, max(0, progress)) * 100).rounded())) %")
    }
}

/// Les pastilles d'un axe — une par palier, pleine quand il est atteint,
/// datée quand il a été gravé.
struct ProgressionTierDots: View {
    let tiers: [EngagementTier]
    let tint: Color

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: MeeshySpacing.xs) {
            ForEach(tiers) { tier in
                Circle()
                    .strokeBorder(tier.reached ? tint : theme.textMuted.opacity(0.45), lineWidth: 1.5)
                    .background(Circle().fill(tier.reached ? tint : Color.clear))
                    .frame(width: 10, height: 10)
                    .accessibilityLabel(ProgressionCopy.tierAccessibilityLabel(tier))
            }
        }
    }
}

struct ProgressionLevelCard: View {
    let level: EngagementLevelProgress

    private var theme: ThemeManager { ThemeManager.shared }
    private let tint = MeeshyColors.brandPrimary

    var body: some View {
        ProgressionCard(tint: tint) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "star.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(tint)
                        .accessibilityHidden(true)
                    Text(ProgressionCopy.levelTitle(level.level))
                        .font(MeeshyFont.relative(17, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                }
                Text(ProgressionCopy.score(level.scale.value))
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(theme.textMuted)
                ProgressionBar(
                    progress: level.scale.progress,
                    tint: tint,
                    label: String(localized: "progression.a11y.bar.level", defaultValue: "Vers le niveau \(level.level + 1)", bundle: .main)
                )
                .padding(.top, MeeshySpacing.xs)
                Text(ProgressionCopy.nextStep(for: level.scale, kind: .level, level: level.level))
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}

struct ProgressionStreakCard: View {
    let streak: EngagementStreakProgress

    private var theme: ThemeManager { ThemeManager.shared }
    private let tint = MeeshyColors.warning

    var body: some View {
        ProgressionCard(tint: tint) {
            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(tint)
                        .accessibilityHidden(true)
                    Text(ProgressionCopy.streak(streak.currentDays))
                        .font(MeeshyFont.relative(17, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(2)
                        .minimumScaleFactor(0.8)
                }
                Text(ProgressionCopy.streakRecord(streak.longestDays))
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(theme.textMuted)
                ProgressionBar(
                    progress: streak.scale.progress,
                    tint: tint,
                    label: String(localized: "progression.a11y.bar.streak", defaultValue: "Série de jours actifs, vers le prochain jalon", bundle: .main)
                )
                .padding(.top, MeeshySpacing.xs)
                Text(ProgressionCopy.nextStep(for: streak.scale, kind: .streak))
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }
}

struct ProgressionAxisRow: View {
    let axis: EngagementAxisProgress

    private var theme: ThemeManager { ThemeManager.shared }
    private let tint = MeeshyColors.brandPrimary

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: ProgressionCopy.symbol(for: axis.axis))
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(tint)
                .frame(width: 36, height: 36)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(tint.opacity(0.12))
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
                HStack(alignment: .firstTextBaseline) {
                    Text(ProgressionCopy.title(for: axis.axis))
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)
                    Spacer(minLength: MeeshySpacing.sm)
                    Text("\(axis.scale.value)")
                        .font(MeeshyFont.relative(13, weight: .semibold, design: .rounded))
                        .foregroundColor(theme.textMuted)
                        .monospacedDigit()
                }
                HStack {
                    ProgressionTierDots(tiers: axis.scale.tiers, tint: tint)
                    Spacer(minLength: MeeshySpacing.sm)
                    Text(ProgressionCopy.nextStep(for: axis.scale, kind: .badge))
                        .font(MeeshyFont.relative(11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }
            }
        }
        .padding(.vertical, MeeshySpacing.sm + 2)
        .accessibilityElement(children: .combine)
    }
}

struct ProgressionAchievementRow: View {
    let achievement: EngagementAchievementProgress

    private var theme: ThemeManager { ThemeManager.shared }

    private var tint: Color {
        achievement.unlocked ? MeeshyColors.success : theme.textMuted
    }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: achievement.unlocked ? "trophy.fill" : "lock.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(tint)
                .frame(width: 36, height: 36)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(tint.opacity(achievement.unlocked ? 0.14 : 0.10))
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(ProgressionCopy.title(for: achievement.key))
                    .font(MeeshyFont.relative(14, weight: .semibold))
                    .foregroundColor(achievement.unlocked ? theme.textPrimary : theme.textMuted)
                Text(
                    achievement.unlocked
                        ? (ProgressionCopy.obtained(achievement.reachedAt)
                            ?? String(localized: "progression.unlocked", defaultValue: "Débloqué", bundle: .main))
                        : ProgressionCopy.condition(for: achievement.key)
                )
                .font(MeeshyFont.relative(11, weight: .medium))
                .foregroundColor(theme.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, MeeshySpacing.sm + 2)
        .accessibilityElement(children: .combine)
    }
}

/// Les avis de l'écran : l'état vide, la coupure, l'échec — chacun DIT quoi
/// faire, aucun ne bloque ce qui est déjà peint.
struct ProgressionNotice: View {
    enum Kind {
        case empty
        case offline(hasSnapshot: Bool)
        case error(String)
    }

    let kind: Kind
    var retry: (() -> Void)? = nil

    private var theme: ThemeManager { ThemeManager.shared }

    private var symbol: String {
        switch kind {
        case .empty: return "sparkles"
        case .offline: return "wifi.slash"
        case .error: return "exclamationmark.circle.fill"
        }
    }

    private var tint: Color {
        switch kind {
        case .empty: return MeeshyColors.brandPrimary
        case .offline: return MeeshyColors.warning
        case .error: return MeeshyColors.error
        }
    }

    private var text: String {
        switch kind {
        case .empty:
            return String(
                localized: "progression.empty",
                defaultValue: "Aucune activité comptée pour l’instant. Envoyez un message, publiez une story… votre premier badge tombe dès la première action.",
                bundle: .main
            )
        case .offline(let hasSnapshot):
            return hasSnapshot
                ? String(localized: "progression.offline", defaultValue: "Hors ligne — progression telle qu’à la dernière ouverture", bundle: .main)
                : String(localized: "progression.offline.empty", defaultValue: "Hors ligne — aucune progression en mémoire. Elle s’affichera à la reconnexion.", bundle: .main)
        case .error(let message):
            return message
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.md) {
            Image(systemName: symbol)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(tint)
                .accessibilityHidden(true)
            Text(text)
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(theme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            if let retry {
                Button {
                    HapticFeedback.light()
                    retry()
                } label: {
                    Text(String(localized: "common.retry", defaultValue: "Réessayer", bundle: .main))
                        .font(MeeshyFont.relative(12, weight: .semibold))
                        .foregroundColor(tint)
                }
                .accessibilityLabel(String(localized: "common.retry", defaultValue: "Réessayer", bundle: .main))
            }
        }
        .padding(MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                .fill(tint.opacity(0.10))
        )
        .accessibilityElement(children: .combine)
    }
}

/// Le squelette de démarrage à froid — la FORME de l'écran (deux cartes, trois
/// sections), jamais un `ProgressView`. `SkeletonShape` + `skeletonShimmer()`,
/// Reduce Motion géré par `ShimmerModifier`.
struct ProgressionSkeleton: View {
    var body: some View {
        VStack(spacing: MeeshySpacing.xl) {
            HStack(spacing: MeeshySpacing.md) {
                SkeletonShape(height: 118, cornerRadius: MeeshyRadius.md)
                SkeletonShape(height: 118, cornerRadius: MeeshyRadius.md)
            }
            ForEach(0..<3, id: \.self) { _ in
                SkeletonShape(height: 150, cornerRadius: MeeshyRadius.lg)
            }
        }
        .skeletonShimmer()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "progression.loading", defaultValue: "Progression en cours de chargement", bundle: .main))
    }
}

/// LE HÉROS DES MEESHES (#5743) — la première chose qu'on voit sur l'écran.
///
/// Trois refus, tous délibérés :
///
///  - **rien du tout** quand la passerelle ne sert pas le bloc (`meesh == nil`) :
///    l'hôte ne monte pas cette vue, plutôt que de peindre un solde inventé à
///    quelqu'un dont l'application parle à un serveur antérieur ;
///  - **pas de bouton grisé** — directive porteur : « le bouton pour convertir
///    quand les points le permettent, sinon pas de bouton ». Un contrôle qui
///    existe sans effet est un contrôle qui ment ;
///  - **la barre se mesure sur les points DÉBITABLES**, jamais sur le score
///    total : une barre nourrie par le plancher conversationnel promettrait une
///    Meesh qui n'arriverait jamais.
///
/// Et quand la frappe est impossible, la vue DIT pourquoi — le plancher est une
/// promesse (« ce qu'on a bâti en parlant aux autres ne se vend pas »), et une
/// promesse muette ne rassure personne.
struct ProgressionMeeshHero: View {
    let meesh: EngagementMeeshProgress
    let isMinting: Bool
    let onMint: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }
    private let tint = MeeshyColors.warning

    var body: some View {
        ProgressionCard(tint: tint) {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                HStack(spacing: MeeshySpacing.sm) {
                    Image(systemName: "medal.fill")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(tint)
                        .accessibilityHidden(true)
                    Text(ProgressionCopy.meeshBalance(meesh.balance))
                        .font(MeeshyFont.relative(20, weight: .bold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                }

                if meesh.mintedLifetime > 0 {
                    Text(ProgressionCopy.meeshMintedLifetime(meesh.mintedLifetime))
                        .font(MeeshyFont.relative(11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }

                ProgressionBar(
                    progress: meesh.progress,
                    tint: tint,
                    label: String(
                        localized: "progression.a11y.bar.meesh",
                        defaultValue: "Vers la prochaine Meesh",
                        bundle: .main
                    )
                )
                .padding(.top, MeeshySpacing.xs)

                if meesh.canMint {
                    // Le bouton RESTE pendant la frappe, avec son état dit : le
                    // faire disparaître au moment du tap donnerait l'impression
                    // que l'action a échoué, alors qu'elle est en cours.
                    Button {
                        HapticFeedback.light()
                        onMint()
                    } label: {
                        Text(
                            isMinting
                                ? String(localized: "progression.meesh.minting", defaultValue: "Frappe en cours…", bundle: .main)
                                : ProgressionCopy.meeshMintAction(meesh.mintCost)
                        )
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .foregroundColor(theme.background)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(tint))
                    }
                    .buttonStyle(.plain)
                    .disabled(isMinting)
                    .opacity(isMinting ? 0.6 : 1)
                    .padding(.top, MeeshySpacing.xs)
                } else {
                    Text(ProgressionCopy.meeshMissing(missing: meesh.missingPoints, floor: meesh.floorPoints))
                        .font(MeeshyFont.relative(11, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
