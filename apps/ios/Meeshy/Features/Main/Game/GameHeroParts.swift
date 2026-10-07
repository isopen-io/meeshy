import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les deux dernières questions du héro (#5841)
//
// « Comment gagner » : un bloc feuille, sans état, que `GameHeroView` pose sous le niveau et le rang. Il n'y a PLUS de
// « Comment frapper » ici (#9537) : le héro de frappe est UN SEUL (`GameMintPreviewView`), celui que Progression montre
// après les missions.

/// Le pictogramme et la couleur d'une famille d'actions — la couleur de l'émail de sa médaille
/// (`GameMedalFamily`), pour que la puce et le badge d'une même famille se reconnaissent.
private extension EngagementAxisFamily {
    var heroSymbol: String {
        switch self {
        case .content: "square.and.pencil"
        case .comment: "text.quote"
        case .conversation: "bubble.left.and.bubble.right.fill"
        case .tool: "wand.and.stars"
        case .social: "link"
        }
    }

    var heroTint: Color { GameMedalFamily(self).enamel }
}

/// « Comment gagner » : une puce par famille, DÉRIVÉE du barème, triée par poids décroissant,
/// avec son pictogramme et ses points. Un toucher ouvre le carnet des règles à « Chaque geste
/// rapporte ».
struct GameHeroEarn: View {
    let onOpenRule: (Int) -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            Text(String(localized: "game.hero.earn.title", defaultValue: "Comment gagner", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .textCase(.uppercase)
                .foregroundColor(theme.textMuted)
                .accessibilityAddTraits(.isHeader)
            FlowLayout(spacing: 2) {
                ForEach(GameHero.earnItems()) { item in
                    chip(item)
                }
            }
        }
    }

    private func chip(_ item: GameHero.EarnItem) -> some View {
        let title = ProgressionCopy.title(for: item.family)
        return Button {
            HapticFeedback.light()
            onOpenRule(GameHero.earnRule)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: item.family.heroSymbol)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundColor(item.family.heroTint)
                    .accessibilityHidden(true)
                Text(title)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                Text("+" + GameCopy.formatCount(item.weight))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
            }
            .lineLimit(1)
            .minimumScaleFactor(GameChip.minimumScale)
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xs)
            .background(Capsule().fill(item.family.heroTint.opacity(0.16)))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(
            localized: "game.hero.earn.a11y",
            defaultValue: "\(title), \(GameCopy.points(item.weight)) par geste",
            bundle: .main
        ))
        .accessibilityIdentifier("game.hero.earn.\(item.family.rawValue)")
    }
}
