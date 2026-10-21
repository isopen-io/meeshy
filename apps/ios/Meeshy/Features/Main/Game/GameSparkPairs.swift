import SwiftUI
import MeeshySDK
import MeeshyUI

/// Les deux PAIRES des étincelles (#10846, #10860) — TA LUMIÈRE (la poche, ce que la frappe fige, la seule valeur
/// réelle, et la base du niveau, #10892) en grand et, en petit, ce qui a été reçu depuis toujours ; le niveau actuel et
/// TA PLUS HAUTE LUMIÈRE, qui survit à la renaissance (épopée § 4). Ce qu'on possède passe avant ce qu'on a cumulé
/// (§ 3.3). TOUJOURS montrées, même quand la plus haute lumière égale le niveau (décision porteur 2026-10-16) : une
/// paire qui disparaît quand ses deux nombres se rejoignent laisse croire que l'un d'eux n'existe pas.
struct GameSparkPairs: Equatable {
    let pocket: Int
    let cycle: Int
    let lifetime: Int
    let level: Int
    let levelMax: Int

    init(_ block: GameBlock.Level) {
        let facts = block.sparkFacts
        pocket = facts.pocket
        cycle = facts.cycle
        lifetime = facts.lifetime
        level = block.shown.level
        levelMax = block.shownLevelMaxLifetime
    }

    /// « 12 000 reçues depuis toujours » — ou « 4 200 cet Âge · 12 000 en tout » après une renaissance.
    var cumulLine: String { GameSparksCopy.cumulLine(cycle: cycle, lifetime: lifetime) }

    /// Les quatre faits, dans l'ordre : ta lumière, reçues depuis toujours, niveau, ta plus haute lumière.
    var facts: [ProgressionConceptFact] {
        [
            ProgressionConceptFact(label: GameSparksCopy.pocketLabel, value: GameCopy.points(pocket)),
            ProgressionConceptFact(label: GameSparksCopy.lifetimeLabel,
                                   value: GameSparksCopy.cumulValue(cycle: cycle, lifetime: lifetime)),
            ProgressionConceptFact(label: GameSparksCopy.levelLabel, value: GameCopy.formatCount(level)),
            ProgressionConceptFact(label: GameSparksCopy.levelMaxLabel, value: GameCopy.formatCount(levelMax)),
        ]
    }
}

/// Les deux paires sous le niveau du héros : ce qu'on possède en grand en haut, le « depuis toujours » en petit dessous.
struct GameSparkPairsRow: View {
    let pairs: GameSparkPairs

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.md) {
            pair(big: GameCopy.formatCount(pairs.pocket), bigLabel: GameSparksCopy.pocketLabel, small: pairs.cumulLine)
                .accessibilityIdentifier("game.hero.sparks")
            pair(big: GameCopy.formatCount(pairs.level), bigLabel: GameSparksCopy.levelLabel,
                 small: GameSparksCopy.levelRecordLine(pairs.levelMax))
                .accessibilityIdentifier("game.hero.levelMax")
        }
    }

    private func pair(big: String, bigLabel: String, small: String) -> some View {
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
            Text(small)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textMuted)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(MeeshySpacing.sm)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous).fill(theme.textMuted.opacity(0.08)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(bigLabel) \(big), \(small)")
    }
}
