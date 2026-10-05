import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE TRÉSOR ET LA FLAMME (#9383) — sous le héro de Progression (`GameHeroView`, #5841), qui
/// porte désormais le niveau et le rang. Conception, partie I : « un haut niveau, un haut rang
/// et un gros trésor en même temps » — aucune action ne fait monter les trois, c'est pourquoi on
/// les montre ensemble. Miroir de `apps/web/src/components/game-gauges.tsx`.
///
/// Les dessins sont les briques du SDK, DÉCORATIVES : chaque tuile dit en toutes lettres ce
/// qu'elle montre. **Rien ne se joue au premier rendu** : un écran qu'on ouvre ne rejoue pas ce
/// qui est déjà arrivé.
struct GameGaugesView: View {
    let game: GameBlock

    var body: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.md) {
            GameTreasuryTile(game: game)
            GameFlameTile(game: game)
        }
    }
}

/// Une tuile : un dessin, un titre, des lignes. Un seul élément pour VoiceOver,
/// lu en entier — le dessin est décoratif.
private struct GameTile<Drawing: View, Lines: View>: View {
    let title: String
    let anchor: GameAnchor
    @ViewBuilder let drawing: () -> Drawing
    @ViewBuilder let lines: () -> Lines

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ProgressionCard(tint: MeeshyColors.brandPrimary) {
            VStack(spacing: MeeshySpacing.sm) {
                drawing()
                    .frame(height: 76)
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .textCase(.uppercase)
                    .foregroundColor(theme.textMuted)
                lines()
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
        }
        .id(anchor)
        .accessibilityElement(children: .combine)
    }
}

private func headline(_ text: String) -> some View {
    Text(text)
        .font(MeeshyFont.relative(MeeshyFont.subtitleSize, weight: .bold, design: .rounded))
        .foregroundColor(ThemeManager.shared.textPrimary)
        .fixedSize(horizontal: false, vertical: true)
}

private func caption(_ text: String, tone: Color? = nil) -> some View {
    Text(text)
        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
        .foregroundColor(tone ?? ThemeManager.shared.textMuted)
        .fixedSize(horizontal: false, vertical: true)
}

// MARK: - Trésor

private struct GameTreasuryTile: View {
    let game: GameBlock

    private var treasury: TreasuryStanding { game.treasury }

    var body: some View {
        GameTile(
            title: String(localized: "game.gauge.treasury", defaultValue: "Trésor", bundle: .main),
            anchor: .treasury,
            drawing: {
                MeeshCoinView(face: .obverse, edition: .silver, figures: nil)
                    .frame(width: 64, height: 64)
            },
            lines: {
                headline(GameCopy.meeshes(treasury.held))
                caption(treasury.tier.map(GameCopy.treasuryName)
                    ?? String(localized: "game.treasury.hint", defaultValue: "Garde tes Meeshes : elles remplissent ton trésor", bundle: .main))
                if let next = treasury.next {
                    caption(String(
                        localized: "game.treasury.next",
                        defaultValue: "Encore \(GameCopy.formatCount(next.missing)) pour \(GameCopy.treasuryName(next.key))",
                        bundle: .main
                    ))
                }
            }
        )
    }
}

// MARK: - Flamme

private struct GameFlameTile: View {
    let game: GameBlock

    private var flame: GameBlock.Flame { game.flame }
    private var isOut: Bool { flame.status == .out || flame.form == nil }

    var body: some View {
        GameTile(
            title: String(localized: "game.gauge.flame", defaultValue: "Flamme", bundle: .main),
            anchor: .flame,
            drawing: {
                FlameView(form: flame.form ?? .braise, flickers: !isOut)
                    .frame(width: 64, height: 64)
                    .saturation(isOut ? 0 : 1)
                    .opacity(isOut ? 0.45 : 1)
            },
            lines: {
                headline(flame.days == 0
                    ? String(localized: "game.flame.no_streak", defaultValue: "Pas de série", bundle: .main)
                    : GameCopy.days(flame.days))
                caption(flame.form.map {
                    String(
                        localized: "game.flame.form_line",
                        defaultValue: "\(GameCopy.flameFormName($0)) · +\(GameCopy.formatCount(flame.bonusPercent)) % sur les missions",
                        bundle: .main
                    )
                } ?? String(localized: "game.flame.out_line", defaultValue: "Flamme éteinte", bundle: .main))
                if let status = statusText {
                    caption(status, tone: flame.status == .atRisk || isOut ? ThemeManager.shared.textPrimary : nil)
                }
            }
        )
    }

    private var statusText: String? {
        switch flame.status {
        case .none: String(localized: "game.flame.status.none", defaultValue: "Un geste aujourd’hui allume ta Flamme", bundle: .main)
        case .lit: nil
        case .atRisk: String(localized: "game.flame.status.at_risk", defaultValue: "Fais un geste avant minuit", bundle: .main)
        case .covered: String(localized: "game.flame.status.covered", defaultValue: "Un gel la protège", bundle: .main)
        case .out: String(localized: "game.flame.status.out", defaultValue: "Éteinte", bundle: .main)
        }
    }
}
