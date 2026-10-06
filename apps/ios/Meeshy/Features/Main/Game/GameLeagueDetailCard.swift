import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le détail de ligue, avant la frappe (#9541)
//
// Directive porteur 2026-10-06 : dans Engagement / Progression, le DÉTAIL DE LIGUE — la gemme, la place, les points de
// la semaine, le temps jusqu'à la fermeture — se place AVANT le bouton de frappe des Meeshes. La frappe est le geste
// qui coûte ; la ligue est ce qui se joue cette semaine : on la lit avant de décider.
//
// Seulement quand elle existe : la ligue publique ouverte ET le joueur placé dans un groupe. Sans cela (verrouillée,
// consentement à donner, mineur, pas encore de groupe), la porte de la ligue plus bas dit pourquoi — cette carte ne
// répète pas une absence. Un toucher ouvre la page de la ligue.

/// La ligue que Progression détaille : `nil` tant que le joueur n'est pas placé dans un groupe de la ligue publique.
nonisolated enum GameLeagueDetail {
    static func current(of league: GameLeagueBlock?) -> GameLeagueBlock.Current? {
        guard let league, league.access == .open else { return nil }
        return league.current
    }
}

extension GameText {
    /// « 120 points cette semaine » — ce que le joueur a gagné dans le groupe depuis lundi.
    static func leagueDetailWeek(points: String) -> String {
        String(localized: "game.league.detail.week", defaultValue: "\(points) cette semaine", bundle: .main)
    }
}

struct GameLeagueDetailCard: View {
    let league: GameLeagueBlock
    let current: GameLeagueBlock.Current
    let onOpen: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    /// La carte, ou rien : la décision est `GameLeagueDetail.current(of:)`, l'hôte n'a pas à la répéter.
    static func make(league: GameLeagueBlock?, onOpen: @escaping () -> Void) -> GameLeagueDetailCard? {
        guard let league, let current = GameLeagueDetail.current(of: league) else { return nil }
        return GameLeagueDetailCard(league: league, current: current, onOpen: onOpen)
    }

    var body: some View {
        Button {
            HapticFeedback.light()
            onOpen()
        } label: {
            GameCard(tint: current.league.gemColor) {
                HStack(alignment: .center, spacing: MeeshySpacing.md) {
                    LeagueGemView(league: current.league)
                        .frame(width: 48, height: 48)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
                        Text(GameText.leagueName(current.league))
                            .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                            .foregroundColor(theme.textPrimary)
                        Text(GameText.leagueRankLine(rank: GameCopy.formatCount(current.rank), size: GameCopy.formatCount(current.groupSize))
                            + " · " + GameText.leagueDetailWeek(points: GameCopy.points(current.weekPoints)))
                            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                            .foregroundColor(theme.textPrimary)
                            .fixedSize(horizontal: false, vertical: true)
                        TimelineView(.periodic(from: .now, by: 60)) { context in
                            GameNote(text: GameText.leagueCloses(remaining: GameWave2Format.remaining(closes: league.closes, now: context.date)))
                        }
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .foregroundColor(theme.textMuted)
                        .accessibilityHidden(true)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityIdentifier("game.league.detail")
    }
}
