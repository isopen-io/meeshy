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
/// avec son pictogramme et ses points. Une puce SE TOUCHE (#9564) : elle rebondit et ouvre les précisions de SA
/// famille — ce qu'un geste rapporte, et si elle est active ces jours-ci. Elle n'ouvre plus le carnet des règles :
/// un lien d'une fiche vers une autre page du deuxième niveau est un chemin transverse que la carte de navigation
/// retire (amendement n° 4).
struct GameHeroEarn: View {
    /// L'élan servi : il dit quelles familles sont actives ; `nil` devant un ancien serveur.
    var elan: EngagementElanProgress?

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
        return HStack(spacing: 6) {
            Image(systemName: item.family.heroSymbol)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                .foregroundColor(item.family.heroTint)
                .accessibilityHidden(true)
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                .foregroundColor(theme.textPrimary)
            Text(String(localized: "game.hero.earn.chip", defaultValue: "jusqu’à +\(GameCopy.formatCount(item.weight))", bundle: .main))
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
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(
            localized: "game.hero.earn.a11y",
            defaultValue: "\(title), jusqu’à \(GameCopy.points(item.weight)) par geste",
            bundle: .main
        ))
        .gameElement(GameElementDetails.elanFamily(item.family, elan: elan), identifier: "game.hero.earn.\(item.family.rawValue)")
    }
}

// MARK: - La prochaine étape des niveaux (#9706)

/// Sous la barre du niveau : la PROCHAINE étape, faite (coche) ou à faire (cercle, et où elle en est). Elle SE TOUCHE
/// comme tout élément du jeu : elle rebondit et ouvre SES précisions, dont « Voir la fiche » mène au geste qui la fait.
/// Rien quand le serveur ne sert pas d'étape (au-delà de 100, ou serveur d'avant les étapes).
struct GameLevelStepRow: View {
    let step: GameLevelStep
    /// Les faits des étapes servis : la feuille dit alors les dix étapes.
    var facts: GameLevelStepFacts?

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: MeeshySpacing.xs) {
            Image(systemName: step.met ? "checkmark.circle.fill" : "circle")
                .foregroundColor(step.met ? MeeshyColors.success : theme.textMuted)
                .accessibilityHidden(true)
            Text(GameCopy.levelStepLine(step))
                .foregroundColor(theme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: MeeshySpacing.xs)
            Text(GameCopy.levelStepState(step))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .bold, design: .rounded))
                .foregroundColor(step.met ? MeeshyColors.success : theme.textMuted)
                .lineLimit(1)
                .minimumScaleFactor(GameChip.minimumScale)
        }
        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(GameCopy.levelStepAccessibility(step))
        .gameElement(GameElementDetails.levelStep(step, facts: facts), identifier: "game.hero.level.step")
    }
}
