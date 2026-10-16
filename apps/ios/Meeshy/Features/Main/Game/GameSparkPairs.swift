import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les deux PAIRES des étincelles (#10846) — la poche (ce que la frappe dépense) et le total gagné à vie ; le niveau
/// actuel et le niveau max à vie, qui survit au prestige. TOUJOURS montrées, même quand le max égale le niveau
/// (décision porteur 2026-10-16) : une paire qui disparaît quand ses deux nombres se rejoignent laisse croire que
/// l'un d'eux n'existe pas.
struct GameSparkPairs: Equatable {
    let pocket: Int
    let lifetime: Int
    let level: Int
    let levelMax: Int

    init(_ block: GameBlock.Level) {
        let facts = block.sparkFacts
        pocket = facts.pocket
        lifetime = facts.lifetime
        level = block.shown.level
        levelMax = block.shownLevelMaxLifetime
    }

    /// Les quatre faits, dans l'ordre : poche, total à vie, niveau, max à vie.
    var facts: [ProgressionConceptFact] {
        [
            ProgressionConceptFact(label: GameSparksCopy.pocketLabel, value: GameCopy.points(pocket)),
            ProgressionConceptFact(label: GameSparksCopy.lifetimeLabel, value: GameCopy.points(lifetime)),
            ProgressionConceptFact(label: GameSparksCopy.levelLabel, value: GameCopy.formatCount(level)),
            ProgressionConceptFact(label: GameSparksCopy.levelMaxLabel, value: GameCopy.formatCount(levelMax)),
        ]
    }
}

/// Les deux paires sous le niveau du héro : le grand nombre en haut, son pendant « à vie » en petit dessous.
struct GameSparkPairsRow: View {
    let pairs: GameSparkPairs

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.md) {
            pair(big: GameCopy.formatCount(pairs.pocket), bigLabel: GameSparksCopy.pocketLabel,
                 small: GameCopy.formatCount(pairs.lifetime), smallLabel: GameSparksCopy.lifetimeLabel)
                .accessibilityIdentifier("game.hero.sparks")
            pair(big: GameCopy.formatCount(pairs.level), bigLabel: GameSparksCopy.levelLabel,
                 small: GameCopy.formatCount(pairs.levelMax), smallLabel: GameSparksCopy.levelMaxLabel)
                .accessibilityIdentifier("game.hero.levelMax")
        }
    }

    private func pair(big: String, bigLabel: String, small: String, smallLabel: String) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            Text(bigLabel)
                .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                .textCase(.uppercase)
                .foregroundColor(theme.textMuted)
            Text(big)
                .font(MeeshyFont.relative(MeeshyFont.headlineSize, weight: .bold, design: .rounded))
                .foregroundColor(theme.textPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text("\(smallLabel) · \(small)")
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(MeeshySpacing.sm)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous).fill(theme.textMuted.opacity(0.08)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(bigLabel) \(big), \(smallLabel) \(small)")
    }
}
