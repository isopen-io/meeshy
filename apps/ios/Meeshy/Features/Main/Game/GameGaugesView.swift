import SwiftUI
import MeeshySDK
import MeeshyUI

/// LES TROIS JAUGES, ET LA FLAMME (#9383) — l'en-tête de Progression : niveau,
/// rang, trésor, Flamme. Conception, partie I : « un haut niveau, un haut rang et
/// un gros trésor en même temps » — aucune action ne fait monter les trois, c'est
/// pourquoi on les montre côte à côte. Miroir de `apps/web/src/components/game-gauges.tsx`.
///
/// Les dessins sont les briques du SDK, DÉCORATIVES : chaque tuile dit en toutes
/// lettres ce qu'elle montre. Le niveau qui bouge (une frappe l'a fait redescendre,
/// une mission l'a fait monter) joue sa chorégraphie sur l'anneau ; un rang ou une
/// division nouveaux jouent celle de l'écu. **Rien ne se joue au premier rendu** :
/// un écran qu'on ouvre ne rejoue pas ce qui est déjà arrivé.
struct GameGaugesView: View {
    let game: GameBlock
    var haptics: GameHapticsProviding = GameHaptics.shared

    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            HStack(alignment: .top, spacing: MeeshySpacing.md) {
                GameLevelTile(game: game, haptics: haptics)
                GameRankTile(game: game, haptics: haptics)
            }
            HStack(alignment: .top, spacing: MeeshySpacing.md) {
                GameTreasuryTile(game: game)
                GameFlameTile(game: game)
            }
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

// MARK: - Niveau

private struct GameLevelTile: View {
    let game: GameBlock
    let haptics: GameHapticsProviding

    @State private var shownLevel: Int
    @State private var shownProgress: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(game: GameBlock, haptics: GameHapticsProviding) {
        self.game = game
        self.haptics = haptics
        _shownLevel = State(initialValue: game.level.level)
        _shownProgress = State(initialValue: game.level.progress)
    }

    private var level: GameBlock.Level { game.level }

    var body: some View {
        GameTile(
            title: String(localized: "game.gauge.level", defaultValue: "Niveau", bundle: .main),
            anchor: .level,
            drawing: {
                LevelRingView(
                    level: shownLevel, progress: shownProgress, tier: level.tier, prestige: level.prestige,
                    // Redescendu : le repère du record reste au bout de la barre.
                    recordMarker: level.record > level.level ? 1 : nil,
                    trackColor: ThemeManager.shared.textMuted.opacity(0.22),
                    inkColor: ThemeManager.shared.textPrimary,
                    mutedColor: ThemeManager.shared.textMuted
                )
                .frame(width: 72, height: 72)
            },
            lines: {
                headline(String(
                    localized: "game.level.title",
                    defaultValue: "Niveau \(GameCopy.formatCount(level.level)) · \(GameCopy.tierName(level.tier))",
                    bundle: .main
                ))
                caption(level.nextThreshold == nil
                    ? String(localized: "game.level.top", defaultValue: "Tu es au sommet.", bundle: .main)
                    : String(
                        localized: "game.level.to_next",
                        defaultValue: "Encore \(GameCopy.points(level.pointsToNext)) avant le niveau \(GameCopy.formatCount(level.level + 1))",
                        bundle: .main
                    ))
                if level.record > level.level {
                    GameChip(text: recordText, tint: MeeshyColors.warning)
                }
            }
        )
        .adaptiveOnChange(of: level.level) { old, new in animateLevel(from: old, to: new) }
        .adaptiveOnChange(of: level.progress) { _, new in
            if level.level == shownLevel { settle(progress: new) }
        }
    }

    private var recordText: String {
        let record = String(
            localized: "game.level.record",
            defaultValue: "Record : niveau \(GameCopy.formatCount(level.record))",
            bundle: .main
        )
        guard game.boosts.tailwind > 1 else { return record }
        let factor = game.boosts.tailwind.formatted(.number.precision(.fractionLength(0...2)))
        return record + String(localized: "game.level.tailwind", defaultValue: " · Vent arrière ×\(factor)", bundle: .main)
    }

    private func settle(progress: Double) {
        withAnimation(reduceMotion ? nil : .easeInOut(duration: GameTimeline.levelGainDuration)) { shownProgress = progress }
    }

    /// Gagné : l'anneau se remplit, le chiffre roule (0,6 s, tape légère). Perdu à la
    /// frappe : il se vide calmement (0,8 s, aucun haptique), le repère du record reste.
    private func animateLevel(from old: Int, to new: Int) {
        let gained = new > old
        let duration = gained ? GameTimeline.levelGainDuration : GameTimeline.levelLossDuration
        if gained { haptics.play(GameHapticPattern.levelGain) }
        withAnimation(reduceMotion ? nil : .easeInOut(duration: duration)) {
            shownLevel = new
            shownProgress = level.progress
        }
    }
}

// MARK: - Rang

private struct GameRankTile: View {
    let game: GameBlock
    let haptics: GameHapticsProviding

    @State private var play = 0
    @State private var seenStanding: String

    init(game: GameBlock, haptics: GameHapticsProviding) {
        self.game = game
        self.haptics = haptics
        _seenStanding = State(initialValue: Self.standing(of: game))
    }

    private var glory: GameBlock.Glory { game.glory }

    private static func standing(of game: GameBlock) -> String {
        "\(game.glory.rank.rawValue)/\(game.glory.division?.rawValue ?? 0)"
    }

    var body: some View {
        GameTile(
            title: String(localized: "game.gauge.rank", defaultValue: "Rang", bundle: .main),
            anchor: .rank,
            drawing: {
                RankBlasonStage(
                    rank: glory.rank, division: glory.division, title: GameCopy.rankName(glory.rank),
                    play: play, accessibilityLabel: nil
                )
                .frame(width: 80, height: 74)
            },
            lines: {
                headline(GameCopy.rankLabel(glory.rank, division: glory.division))
                caption(String(
                    localized: "game.rank.glory",
                    defaultValue: "Gloire \(GameCopy.formatCount(glory.glory))",
                    bundle: .main
                ))
                caption(nextText ?? String(localized: "game.rank.top", defaultValue: "Le rang le plus haut", bundle: .main))
            }
        )
        .adaptiveOnChange(of: Self.standing(of: game)) { _, now in
            guard now != seenStanding else { return }
            seenStanding = now
            play += 1
            haptics.play(GameHapticPattern.rank)
        }
    }

    private var nextText: String? {
        guard let next = glory.next, let missing = glory.gloryMissing else { return nil }
        return String(
            localized: "game.rank.next",
            defaultValue: "Encore \(GameCopy.formatCount(missing)) de Gloire avant \(GameCopy.rankLabel(next.rank, division: next.division))",
            bundle: .main
        )
    }
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
