import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le niveau et le rang d'un AUTRE membre (#9481)
//
// Ce que le serveur sert de SON jeu, selon SON réglage : l'anneau de niveau (emblème du palier, chiffre romain,
// étoiles de Prestige), le blason de son rang et sa division, le palier de son trésor. Jamais un compte exact : ni
// Gloire, ni jours de série, ni Meeshes — et jamais la Flamme, que le serveur sert pourtant : aucun réglage du jeu ne
// permet à son propriétaire de choisir de la montrer, elle reste donc masquée (#10093). Quand le serveur ne sert rien
// (réglage fermé, blocage, « Jeu masqué », compte inconnu), la vue ne se dessine PAS — un refus ne se distingue pas
// d'une absence.

extension GameText {
    static func visitorTreasury(tier: String) -> String {
        String(localized: "game2.profile.visitor_treasury", defaultValue: "Héritage : \(tier)", bundle: .main)
    }
}

extension GameStandingContent {
    /// Ce que VoiceOver lit : « Niveau 42, palier Éclat, quatrième palier, Voix II, Trésor : Coffre ».
    var accessibilityLabel: String {
        var parts: [String] = []
        if let standing {
            parts.append(GameCopy.levelRingAccessibility(level: standing.shownLevel, tier: standing.shownTier))
            parts.append(GameCopy.rankLabel(standing))
        }
        if let tier = treasuryTier { parts.append(GameText.visitorTreasury(tier: GameCopy.treasuryName(tier))) }
        return parts.joined(separator: ", ")
    }
}

/// La rangée de la bande de la carte de contact (#9481) — la seule qui la monte depuis que la fiche d'un profil porte
/// le niveau et le rang sur sa bannière (#10093, #10380).
struct GameStandingView: View {
    let content: GameStandingContent

    private var theme: ThemeManager { ThemeManager.shared }

    private let ringSize: CGFloat = 44

    var body: some View {
        HStack(alignment: .center, spacing: MeeshySpacing.sm) {
            if let standing = content.standing {
                ring(standing)
                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                    Text(GameText.profileLevel(level: GameCopy.formatCount(standing.shownLevel), tier: GameCopy.tierName(standing.shownTier)))
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold))
                        .foregroundColor(theme.textPrimary)
                    Text(GameCopy.rankLabel(standing))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                    if let tier = content.treasuryTier {
                        Text(GameText.visitorTreasury(tier: GameCopy.treasuryName(tier)))
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                            .foregroundColor(theme.textMuted)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
                RankBlasonView(rank: standing.rank, division5: standing.shownDivision, level: standing.shownLevel,
                               mythic: standing.mythic, title: nil, figures: nil)
                    .frame(width: 36, height: 34)
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
        .accessibilityIdentifier("game.contact.standing")
    }

    /// L'anneau est PLEIN : on ne sait pas où en est la barre d'un autre (le serveur ne le dit pas), et un arc
    /// vide ferait croire qu'il commence. Il porte la couleur de son palier, son emblème et son chiffre romain.
    private func ring(_ standing: GameStanding) -> some View {
        LevelRingView(
            level: standing.shownLevel, progress: 1, tier: standing.shownTier, prestige: standing.prestige,
            trackColor: theme.textMuted.opacity(MeeshyOpacity.light), inkColor: theme.textPrimary,
            accessibilityLabel: nil
        )
        .frame(width: ringSize, height: standing.prestige > 0 ? ringSize * 94 / 80 : ringSize)
    }
}
