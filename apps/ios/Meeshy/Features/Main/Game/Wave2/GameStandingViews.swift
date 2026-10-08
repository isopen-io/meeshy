import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le niveau et le rang d'un AUTRE membre (#9481)
//
// Ce que le serveur sert de SON jeu, selon SON réglage : l'anneau de niveau (emblème du palier, chiffre romain,
// étoiles de Prestige), le blason de son rang et sa division, le palier de son trésor, la forme de sa Flamme. Jamais
// un compte exact : ni Gloire, ni jours de série, ni Meeshes. Quand le serveur ne sert rien (réglage fermé, blocage,
// « Jeu masqué », compte inconnu), la vue ne se dessine PAS — un refus ne se distingue pas d'une absence.

extension GameText {
    static func visitorGameTitle(name: String) -> String {
        String(localized: "game2.profile.visitor_game_title", defaultValue: "Le jeu de \(name)", bundle: .main)
    }

    static func visitorTreasury(tier: String) -> String {
        String(localized: "game2.profile.visitor_treasury", defaultValue: "Trésor : \(tier)", bundle: .main)
    }

    static func visitorFlame(form: String) -> String {
        String(localized: "game2.profile.visitor_flame", defaultValue: "Flamme : \(form)", bundle: .main)
    }
}

extension GameStandingContent {
    /// Ce que VoiceOver lit : « Niveau 42, palier Éclat, quatrième palier, Voix II, Flamme : Brasier, Trésor : Coffre ».
    var accessibilityLabel: String {
        var parts: [String] = []
        if let standing {
            parts.append(GameCopy.levelRingAccessibility(level: standing.level, tier: standing.tier))
            parts.append(GameCopy.rankLabel(standing))
            if let flame = standing.flame { parts.append(GameText.visitorFlame(form: GameCopy.flameFormName(flame))) }
        }
        if let tier = treasuryTier { parts.append(GameText.visitorTreasury(tier: GameCopy.treasuryName(tier))) }
        return parts.joined(separator: ", ")
    }
}

struct GameStandingView: View {
    let content: GameStandingContent
    /// La rangée de la fiche de contact : plus petite, sur une ligne.
    var compact = false

    private var theme: ThemeManager { ThemeManager.shared }

    private var ringSize: CGFloat { compact ? 44 : 64 }

    var body: some View {
        HStack(alignment: .center, spacing: compact ? MeeshySpacing.sm : MeeshySpacing.lg) {
            if let standing = content.standing {
                ring(standing)
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(GameText.profileLevel(level: GameCopy.formatCount(standing.level), tier: GameCopy.tierName(standing.tier)))
                        .font(MeeshyFont.relative(compact ? MeeshyFont.smallSize : MeeshyFont.bodySize, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                    Text(GameCopy.rankLabel(standing))
                        .font(MeeshyFont.relative(compact ? MeeshyFont.footnoteSize : MeeshyFont.smallSize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    if let tier = content.treasuryTier {
                        Text(GameText.visitorTreasury(tier: GameCopy.treasuryName(tier)))
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                if let flame = standing.flame {
                    FlameView(form: flame, flickers: false)
                        .frame(width: compact ? 18 : 22, height: compact ? 18 : 22)
                        .accessibilityHidden(true)
                }
                RankBlasonView(rank: standing.rank, division5: standing.shownDivision, level: standing.level,
                               mythic: standing.mythic, title: nil, figures: nil)
                    .frame(width: compact ? 36 : 56, height: compact ? 34 : 52)
                    .accessibilityHidden(true)
            } else if let tier = content.treasuryTier {
                Text(GameText.visitorTreasury(tier: GameCopy.treasuryName(tier)))
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                Spacer(minLength: 0)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(content.accessibilityLabel)
        .accessibilityIdentifier(compact ? "game.contact.standing" : "game.profile.standing")
    }

    /// L'anneau est PLEIN : on ne sait pas où en est la barre d'un autre (le serveur ne le dit pas), et un arc
    /// vide ferait croire qu'il commence. Il porte la couleur de son palier, son emblème et son chiffre romain.
    private func ring(_ standing: GameStanding) -> some View {
        LevelRingView(
            level: standing.level, progress: 1, tier: standing.tier, prestige: standing.prestige,
            trackColor: theme.textMuted.opacity(MeeshyOpacity.light), inkColor: theme.textPrimary,
            accessibilityLabel: nil
        )
        .frame(width: ringSize, height: standing.prestige > 0 ? ringSize * 94 / 80 : ringSize)
    }
}
