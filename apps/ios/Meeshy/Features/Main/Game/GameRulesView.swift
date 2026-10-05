import SwiftUI
import MeeshySDK
import MeeshyUI

/// « COMMENT ÇA MARCHE » (#9379) — le carnet des règles. Le texte que Mee et Meo
/// disent à l'intégration (conception, partie I : « les règles en une page ») et
/// que le joueur retrouve ici quand il veut, avec les sept cartes de l'intégration
/// en entier : chacune peut se passer, le carnet les garde toutes. Miroir de
/// `apps/web/src/routes/progression-rules.tsx`.
///
/// Une page qui EXPLIQUE, sans geste : aucun bouton n'y agit, rien n'y est promis
/// qui ne soit dit ailleurs. Pas de lecture réseau : elle s'ouvre instantanément,
/// hors ligne comme en ligne.
struct GameRulesPage: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            VStack(spacing: 0) {
                GamePageHeader(title: String(localized: "game.rules.page_title", defaultValue: "Comment ça marche", bundle: .main), onBack: { dismiss() })
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: MeeshySpacing.xl) {
                        intro
                        rules
                        steps
                    }
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.vertical, MeeshySpacing.md)
                }
            }
        }
        .accessibilityIdentifier("game.rules.page")
    }

    private var intro: some View {
        HStack(alignment: .bottom, spacing: MeeshySpacing.sm) {
            MeeStickerFilmView(filmID: "mee-bonjour", animated: true, side: 84, animates: !reduceMotion, pixelCap: 240)
                .frame(width: 84, height: 84)
                .accessibilityHidden(true)
            Text(String(
                localized: "game.rules.intro",
                defaultValue: "Huit règles, et tout le jeu tient dedans. Meo les explique, Mee te montre le geste.",
                bundle: .main
            ))
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
            .foregroundColor(theme.textPrimary)
            .frame(maxWidth: .infinity, alignment: .leading)
            MeeStickerFilmView(filmID: "meo-salut", animated: true, side: 84, animates: !reduceMotion, pixelCap: 240)
                .scaleEffect(x: -1, y: 1)
                .frame(width: 84, height: 84)
                .accessibilityHidden(true)
        }
    }

    private var rules: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "game.rules.section_rules", defaultValue: "Les règles en une page", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            ForEach(GameGuideCopy.rules) { rule in
                HStack(alignment: .top, spacing: MeeshySpacing.md) {
                    Text(GameCopy.formatCount(rule.index))
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                        .foregroundColor(MeeshyColors.brandPrimary)
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(MeeshyColors.brandPrimary.opacity(0.16)))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(rule.title)
                            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold))
                            .foregroundColor(theme.textPrimary)
                        Text(rule.body)
                            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .regular))
                            .foregroundColor(theme.textMuted)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
    }

    private var steps: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            Text(String(localized: "game.rules.section_steps", defaultValue: "Les sept étapes", bundle: .main))
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)
            ForEach(GameGuide.onboardingSteps, id: \.key) { step in
                let card = GameGuideCard.ofStep(step)
                HStack(alignment: .top, spacing: MeeshySpacing.md) {
                    stepFigures(card)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(
                            localized: "game.guide.step_of",
                            defaultValue: "Étape \(GameCopy.formatCount(step.index)) sur \(GameCopy.formatCount(GameGuide.onboardingSteps.count))",
                            bundle: .main
                        ))
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                        .textCase(.uppercase)
                        .foregroundColor(theme.textMuted)
                        Text(card.copy.what).font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .bold)).foregroundColor(theme.textPrimary)
                        Text(card.copy.means).font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .regular)).foregroundColor(theme.textPrimary)
                        Text(card.copy.next).font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold)).foregroundColor(theme.textPrimary)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
                .padding(MeeshySpacing.md)
                .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(theme.backgroundSecondary))
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func stepFigures(_ card: GuideCard) -> some View {
        let films = GameGuideCard.figures(speaker: card.speaker, mood: card.mood)
        let side: CGFloat = card.speaker == .duo ? 40 : 52
        return HStack(spacing: -6) {
            if let mee = films.meeFilmID {
                MeeStickerFilmView(filmID: mee, animated: false, side: side, animates: false, pixelCap: 160).frame(width: side, height: side)
            }
            if let meo = films.meoFilmID {
                MeeStickerFilmView(filmID: meo, animated: false, side: side, animates: false, pixelCap: 160)
                    .scaleEffect(x: -1, y: 1).frame(width: side, height: side)
            }
        }
        .accessibilityHidden(true)
    }
}

/// L'en-tête des pages du jeu : un retour par la PILE (le glissement depuis le
/// bord gauche fait le même geste) et un titre.
struct GamePageHeader: View {
    let title: String
    let onBack: () -> Void
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Button {
                HapticFeedback.light()
                onBack()
            } label: {
                Image(systemName: "chevron.backward")
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .semibold))
                    .foregroundColor(MeeshyColors.brandPrimary)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel(String(localized: "game.page.back", defaultValue: "Retour à la progression", bundle: .main))
            Text(title)
                .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .lineLimit(1)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.xs)
    }
}
