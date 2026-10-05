import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les deux dernières questions du héro (#5841)
//
// « Comment gagner » et « Comment frapper » : deux blocs feuilles, sans état, que
// `GameHeroView` pose sous le niveau et le rang.

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

/// « Comment frapper » : ce que la frappe coûte et rapporte (prix servi par le serveur, niveaux
/// perdus, Gloire), puis le bouton. Sans assez de points, le bouton devient « Encore N points » :
/// une phrase lisible, jamais un bouton grisé (directive du porteur, `EngagementMeeshProgress.canMint`).
struct GameHeroMint: View {
    let mint: GameMintPreview
    let online: Bool
    let minting: Bool
    let onMint: () -> Void
    let onOpenRule: () -> Void

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.xs) {
                Text(String(localized: "game.hero.mint.title", defaultValue: "Comment frapper", bundle: .main))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .textCase(.uppercase)
                    .foregroundColor(theme.textMuted)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                Button {
                    HapticFeedback.light()
                    onOpenRule()
                } label: {
                    Image(systemName: "questionmark.circle")
                        .font(MeeshyFont.relative(MeeshyIconSize.lg, weight: .medium))
                        .foregroundColor(theme.textMuted)
                        .frame(minWidth: 44, minHeight: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "game.hero.mint.info", defaultValue: "Lire la règle de la frappe", bundle: .main))
                .accessibilityIdentifier("game.hero.mint.info")
            }
            HStack(alignment: .center, spacing: MeeshySpacing.md) {
                MeeshCoinView(face: .obverse, edition: mint.edition, figures: nil)
                    .frame(width: 40, height: 40)
                Text(line)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            action
        }
        .padding(MeeshySpacing.md)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous).fill(theme.backgroundPrimary.opacity(0.72)))
    }

    /// Ce que la frappe fait : prix, niveaux perdus, Gloire gagnée.
    private var line: String {
        guard mint.canMint else {
            return String(localized: "game.hero.mint.price", defaultValue: "Une Meesh coûte \(GameCopy.points(mint.price))", bundle: .main)
        }
        let glory = GameCopy.formatCount(mint.gloryGained)
        guard mint.levelsLost > 0 else {
            return String(
                localized: "game.hero.mint.line_free",
                defaultValue: "\(GameCopy.points(mint.price)) → une Meesh · +\(glory) de Gloire",
                bundle: .main
            )
        }
        return String(
            localized: "game.hero.mint.line",
            defaultValue: "\(GameCopy.points(mint.price)) → une Meesh · coûte \(GameCopy.levels(mint.levelsLost)) · +\(glory) de Gloire",
            bundle: .main
        )
    }

    @ViewBuilder
    private var action: some View {
        if mint.canMint {
            GameActionButton(
                title: String(localized: "game.mint.action", defaultValue: "Frapper avec Mee et Meo", bundle: .main),
                busyTitle: String(localized: "game.mint.minting", defaultValue: "Frappe en cours…", bundle: .main),
                busy: minting, disabled: !online, identifier: "game.hero.mint", action: onMint
            )
            if !online {
                GameNote(text: String(localized: "game.mint.offline", defaultValue: "Hors ligne : la frappe reprendra avec la connexion.", bundle: .main))
            }
        } else {
            Text(String(
                localized: "game.hero.mint.missing",
                defaultValue: "Encore \(GameCopy.points(mint.missingPoints))",
                bundle: .main
            ))
            .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
            .foregroundColor(theme.textPrimary)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(MeeshyColors.warning.opacity(0.22)))
            .accessibilityIdentifier("game.hero.mint.missing")
        }
    }
}
